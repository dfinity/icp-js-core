import { Principal } from '#principal';
import { type Agent } from '../agent/api.ts';
import { type RequestId } from '../request_id.ts';
import { type LookupPathResultFound, type LookupPathStatus } from '../certificate.ts';

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
