import { Principal } from '#principal';
import type { Agent } from '../agent/api.ts';
import type { RequestId } from '../request_id.ts';
import type { LookupPathResultFound, LookupPathStatus } from '../certificate.ts';

// Mock the strategy module to observe instantiation and usage
const instantiatedStrategies: jest.Mock[] = [];
jest.mock('./strategy.ts', () => {
  return {
    // Each call should create a fresh, stateful strategy function
    defaultStrategy: jest.fn(() => {
      const strategyFn = jest.fn(async () => {
        // no-op strategy used in tests
      });
      instantiatedStrategies.push(strategyFn);
      return strategyFn;
    }),
  };
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Map a requestId key to a queue of statuses to emit across polls
const statusesByRequestKey = new Map<RequestId, string[]>();
const replyByRequestKey = new Map<RequestId, Uint8Array>();
const rejectByRequestKey = new Map<
  RequestId,
  { reject_code: number; reject_message: string; error_code?: string }
>();

const mockAgent = {
  rootKey: new Uint8Array([1]),
  readState: async () => ({ certificate: new Uint8Array([0]) }),
} as unknown as Agent;

jest.mock('../certificate.ts', () => {
  return {
    // Simplified adapter used by polling/index.ts
    lookupResultToBuffer: (res: LookupPathResultFound) => res.value,
    Certificate: {
      create: jest.fn(async () => {
        return {
          lookup_path: (path: [string, RequestId, string]): LookupPathResultFound => {
            // Path shape: ['request_status', requestIdBytes, 'status'|'reject_code'|'reject_message'|'error_code'|'reply']
            const requestIdBytes = path[1];
            const lastPathElement = path[path.length - 1] as string | Uint8Array;
            const lastPathElementStr =
              typeof lastPathElement === 'string'
                ? lastPathElement
                : textDecoder.decode(lastPathElement);

            if (lastPathElementStr === 'status') {
              const q = statusesByRequestKey.get(requestIdBytes) ?? [];
              const current = q.length > 0 ? q.shift()! : 'replied';
              statusesByRequestKey.set(requestIdBytes, q);
              return {
                status: 'Found' as LookupPathStatus.Found,
                value: textEncoder.encode(current),
              };
            }
            if (lastPathElementStr === 'reply') {
              return {
                status: 'Found' as LookupPathStatus.Found,
                value: replyByRequestKey.get(requestIdBytes)!,
              };
            }
            if (lastPathElementStr === 'reject_code') {
              const reject = rejectByRequestKey.get(requestIdBytes);
              return {
                status: 'Found' as LookupPathStatus.Found,
                value: new Uint8Array([reject?.reject_code ?? 0]),
              };
            }
            if (lastPathElementStr === 'reject_message') {
              const reject = rejectByRequestKey.get(requestIdBytes);
              return {
                status: 'Found' as LookupPathStatus.Found,
                value: textEncoder.encode(reject?.reject_message ?? ''),
              };
            }
            if (lastPathElementStr === 'error_code') {
              const reject = rejectByRequestKey.get(requestIdBytes);
              if (reject?.error_code) {
                return {
                  status: 'Found' as LookupPathStatus.Found,
                  value: textEncoder.encode(reject.error_code),
                };
              }
              return undefined as unknown as LookupPathResultFound;
            }
            throw new Error(`Unexpected lastPathElementStr ${lastPathElementStr}`);
          },
        } as const;
      }),
    },
  };
});

describe('pollForResponse strategy lifecycle', () => {
  beforeEach(() => {
    instantiatedStrategies.length = 0;
    statusesByRequestKey.clear();
    replyByRequestKey.clear();
    rejectByRequestKey.clear();
    jest.resetModules();
  });

  it('creates a fresh default strategy per request and reuses it across retries', async () => {
    // We need to import the module here to make sure the mock is applied
    const { pollForResponse, defaultStrategy } = await import('./index.ts');

    const canisterId = Principal.anonymous();

    // Request A: simulate three polls: processing -> unknown -> replied
    const requestIdA = new Uint8Array([1, 2, 3]) as RequestId;
    statusesByRequestKey.set(requestIdA, ['processing', 'unknown', 'replied']);
    replyByRequestKey.set(requestIdA, new Uint8Array([42]));

    // Request B: simulate two polls: unknown -> replied
    const requestIdB = new Uint8Array([9, 8, 7]) as RequestId;
    statusesByRequestKey.set(requestIdB, ['unknown', 'replied']);
    replyByRequestKey.set(requestIdB, new Uint8Array([99]));

    // First call
    const responseA = await pollForResponse(mockAgent, canisterId, requestIdA);
    expect(responseA.reply).toEqual(new Uint8Array([42]));

    // Second independent call
    const responseB = await pollForResponse(mockAgent, canisterId, requestIdB);
    expect(responseB.reply).toEqual(new Uint8Array([99]));

    // Assert that defaultStrategy has been instantiated once per request (not per retry)
    const defaultStrategyMock = defaultStrategy as jest.Mock;
    expect(defaultStrategyMock.mock.calls.length).toBe(2);

    // And that each created strategy function was invoked during its own request
    expect(instantiatedStrategies.length).toBe(2);
    // Request A had two non-replied statuses, so strategy called at least twice
    expect(instantiatedStrategies[0].mock.calls.length).toBe(2);
    // Request B had one non-replied status (unknown), so strategy called once
    expect(instantiatedStrategies[1].mock.calls.length).toBe(1);
  });
});

describe('pollForResponse', () => {
  beforeEach(() => {
    statusesByRequestKey.clear();
    replyByRequestKey.clear();
    rejectByRequestKey.clear();
  });

  it('returns rawCertificate matching the bytes from agent.readState', async () => {
    const rawCertBytes = new Uint8Array([10, 20, 30]);
    const agentWithCustomCert = {
      rootKey: new Uint8Array([1]),
      readState: async () => ({ certificate: rawCertBytes }),
    } as unknown as Agent;

    const { pollForResponse } = await import('./index.ts');

    const canisterId = Principal.anonymous();
    const requestId = new Uint8Array([1, 2, 3]) as RequestId;
    replyByRequestKey.set(requestId, new Uint8Array([42]));

    const result = await pollForResponse(agentWithCustomCert, canisterId, requestId);

    expect(result.rawCertificate).toEqual(rawCertBytes);
  });

  it('returns the expected reply bytes', async () => {
    const { pollForResponse } = await import('./index.ts');

    const canisterId = Principal.anonymous();
    const requestId = new Uint8Array([1, 2, 3]) as RequestId;
    const expectedReply = new Uint8Array([1, 2, 3, 4, 5]);
    replyByRequestKey.set(requestId, expectedReply);

    const result = await pollForResponse(mockAgent, canisterId, requestId);

    expect(result.reply).toEqual(expectedReply);
  });

  it('returns a certificate that can look up the reply', async () => {
    const { pollForResponse } = await import('./index.ts');

    const canisterId = Principal.anonymous();
    const requestId = new Uint8Array([1, 2, 3]) as RequestId;
    const expectedReply = new Uint8Array([42]);
    replyByRequestKey.set(requestId, expectedReply);

    const result = await pollForResponse(mockAgent, canisterId, requestId);

    expect(result.certificate).toBeDefined();
    expect(typeof result.certificate.lookup_path).toBe('function');
    // The certificate's lookup_path should resolve the reply
    const lookupResult = result.certificate.lookup_path([
      new Uint8Array(),
      requestId,
      'reply',
    ]) as LookupPathResultFound;
    expect(lookupResult.value).toEqual(expectedReply);
  });

  it('throws RejectError when the request is rejected', async () => {
    const { pollForResponse } = await import('./index.ts');
    const { RejectError } = await import('../errors.ts');

    const canisterId = Principal.anonymous();
    const requestId = new Uint8Array([5, 6, 7]) as RequestId;
    statusesByRequestKey.set(requestId, ['rejected']);
    rejectByRequestKey.set(requestId, {
      reject_code: 4,
      reject_message: 'canister trapped',
      error_code: 'IC0503',
    });

    await expect(pollForResponse(mockAgent, canisterId, requestId)).rejects.toThrow(RejectError);
  });

  it('includes reject_code, reject_message and error_code in the RejectError', async () => {
    const { pollForResponse } = await import('./index.ts');

    const canisterId = Principal.anonymous();
    const requestId = new Uint8Array([5, 6, 7]) as RequestId;
    statusesByRequestKey.set(requestId, ['rejected']);
    rejectByRequestKey.set(requestId, {
      reject_code: 4,
      reject_message: 'canister trapped',
      error_code: 'IC0503',
    });

    try {
      await pollForResponse(mockAgent, canisterId, requestId);
      fail('Expected pollForResponse to throw');
    } catch (error) {
      expect(error).toHaveProperty('code');
      const code = (
        error as { code: { rejectCode: number; rejectMessage: string; rejectErrorCode: string } }
      ).code;
      expect(code.rejectCode).toBe(4);
      expect(code.rejectMessage).toBe('canister trapped');
      expect(code.rejectErrorCode).toBe('IC0503');
    }
  });

  it('throws UnknownError when status is done without a reply', async () => {
    const { pollForResponse } = await import('./index.ts');
    const { UnknownError } = await import('../errors.ts');

    const canisterId = Principal.anonymous();
    const requestId = new Uint8Array([8, 9, 10]) as RequestId;
    statusesByRequestKey.set(requestId, ['done']);
    replyByRequestKey.set(requestId, new Uint8Array([42]));

    await expect(pollForResponse(mockAgent, canisterId, requestId)).rejects.toThrow(UnknownError);
  });

  it('throws ExternalError when agent.rootKey is null', async () => {
    const { pollForResponse } = await import('./index.ts');
    const { ExternalError } = await import('../errors.ts');

    const agentWithoutRootKey = {
      rootKey: null,
      readState: async () => ({ certificate: new Uint8Array([0]) }),
    } as unknown as Agent;

    const canisterId = Principal.anonymous();
    const requestId = new Uint8Array([1, 2, 3]) as RequestId;
    replyByRequestKey.set(requestId, new Uint8Array([42]));

    await expect(pollForResponse(agentWithoutRootKey, canisterId, requestId)).rejects.toThrow(
      ExternalError,
    );
  });
});
