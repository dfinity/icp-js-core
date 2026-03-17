import { Principal } from '#principal';
import type { Agent } from '../agent/api.ts';
import type { RequestId } from '../request_id.ts';
import type { LookupPathResultFound, LookupPathStatus } from '../certificate.ts';
import type {
  pollForResponse as _pollForResponse,
  defaultStrategy as _defaultStrategy,
} from './index.ts';

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
          lookup_path: (path: [string, RequestId, string]) => {
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
              return { status: 'Absent' as LookupPathStatus.Absent };
            }
            throw new Error(`Unexpected lastPathElementStr ${lastPathElementStr}`);
          },
        } as const;
      }),
    },
  };
});

describe('pollForResponse strategy lifecycle', () => {
  let pollForResponse: typeof _pollForResponse;
  let defaultStrategy: typeof _defaultStrategy;

  beforeEach(async () => {
    instantiatedStrategies.length = 0;
    statusesByRequestKey.clear();
    replyByRequestKey.clear();
    rejectByRequestKey.clear();
    jest.resetModules();
    ({ pollForResponse, defaultStrategy } = await import('./index.ts'));
  });

  it('creates a fresh default strategy per request and reuses it across retries', async () => {
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
  const canisterId = Principal.anonymous();
  const requestId = new Uint8Array([1, 2, 3]) as RequestId;

  let pollForResponse: typeof _pollForResponse;

  beforeEach(async () => {
    statusesByRequestKey.clear();
    replyByRequestKey.clear();
    rejectByRequestKey.clear();
    jest.resetModules();
    ({ pollForResponse } = await import('./index.ts'));
  });

  it('returns reply, certificate, and rawCertificate on replied status', async () => {
    const rawCertBytes = new Uint8Array([10, 20, 30]);
    const agentWithCustomCert = {
      rootKey: new Uint8Array([1]),
      readState: async () => ({ certificate: rawCertBytes }),
    } as unknown as Agent;

    replyByRequestKey.set(requestId, new Uint8Array([1, 2, 3, 4, 5]));

    const result = await pollForResponse(agentWithCustomCert, canisterId, requestId);

    expect(result.reply).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    expect(result.rawCertificate).toEqual(rawCertBytes);
    expect(result.certificate).toBeDefined();
  });

  it('returns rawCertificate from the final readState after polling', async () => {
    let callCount = 0;
    const agentWithChangingCert = {
      rootKey: new Uint8Array([1]),
      readState: async () => {
        callCount++;
        return { certificate: new Uint8Array([callCount]) };
      },
    } as unknown as Agent;

    statusesByRequestKey.set(requestId, ['processing', 'replied']);
    replyByRequestKey.set(requestId, new Uint8Array([42]));

    const result = await pollForResponse(agentWithChangingCert, canisterId, requestId);

    expect(callCount).toBe(2);
    expect(result.rawCertificate).toEqual(new Uint8Array([2]));
  });

  it('throws RejectError with reject details when the request is rejected', async () => {
    const { RejectError } = await import('../errors.ts');

    statusesByRequestKey.set(requestId, ['rejected']);
    rejectByRequestKey.set(requestId, {
      reject_code: 4,
      reject_message: 'canister trapped',
      error_code: 'IC0503',
    });

    const error = await pollForResponse(mockAgent, canisterId, requestId).catch(e => e);

    expect(error).toBeInstanceOf(RejectError);
    expect(error.code.rejectCode).toBe(4);
    expect(error.code.rejectMessage).toBe('canister trapped');
    expect(error.code.rejectErrorCode).toBe('IC0503');
  });

  it.each([
    {
      scenario: 'done status',
      statuses: ['done'],
      expectedError: 'UnknownError',
      agent: mockAgent,
    },
    {
      scenario: 'null rootKey',
      statuses: undefined,
      expectedError: 'ExternalError',
      agent: {
        rootKey: null,
        readState: async () => ({ certificate: new Uint8Array([0]) }),
      } as unknown as Agent,
    },
  ])('throws $expectedError on $scenario', async ({ statuses, expectedError, agent }) => {
    const errors = await import('../errors.ts');

    if (statuses) {
      statusesByRequestKey.set(requestId, statuses);
    }
    replyByRequestKey.set(requestId, new Uint8Array([42]));

    const ErrorClass = errors[expectedError as keyof typeof errors] as {
      new (...args: unknown[]): Error;
    };
    await expect(pollForResponse(agent, canisterId, requestId)).rejects.toThrow(ErrorClass);
  });
});
