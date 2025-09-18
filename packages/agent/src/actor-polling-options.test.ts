import { IDL } from '@dfinity/candid';
import { Principal } from '@dfinity/principal';
import { type Agent } from './agent/api.ts';
import { RequestId } from './request_id.ts';
import { type LookupPathStatus, type LookupPathResultFound } from './certificate.ts';

// Track strategy creations and invocations
const instantiatedStrategies: jest.Mock[] = [];
jest.mock('./polling/strategy.ts', () => {
  return {
    defaultStrategy: jest.fn(() => {
      const fn = jest.fn(async () => {
        // no-op strategy used in tests
      });
      instantiatedStrategies.push(fn);
      return fn;
    }),
  };
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const statusesByRequestId = new Map<RequestId, string[]>();
const replyByRequestId = new Map<RequestId, Uint8Array>();

jest.mock('./certificate.ts', () => {
  return {
    lookupResultToBuffer: (res: { value: Uint8Array }) => res?.value,
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
              const q = statusesByRequestId.get(requestIdBytes) ?? [];
              const current = q.length > 0 ? q.shift()! : 'replied';
              statusesByRequestId.set(requestIdBytes, q);
              return {
                status: 'Found' as LookupPathStatus.Found,
                value: textEncoder.encode(current),
              };
            }
            if (lastPathElementStr === 'reply') {
              return {
                status: 'Found' as LookupPathStatus.Found,
                value: replyByRequestId.get(requestIdBytes)!,
              };
            }
            throw new Error(`Unexpected lastPathElementStr ${lastPathElementStr}`);
          },
        } as const;
      }),
    },
  };
});

describe('Actor default polling options are not reused across calls', () => {
  beforeEach(() => {
    instantiatedStrategies.length = 0;
    statusesByRequestId.clear();
    replyByRequestId.clear();
    jest.resetModules();
  });

  it('instantiates a fresh defaultStrategy per update call when using DEFAULT_POLLING_OPTIONS', async () => {
    const { Actor } = await import('./actor.ts');
    const defaultStrategy = (await import('./polling/strategy.ts')).defaultStrategy as jest.Mock;

    const canisterId = Principal.anonymous();

    const requestIdA = new Uint8Array([1, 2, 3]) as RequestId;
    const requestIdB = new Uint8Array([4, 5, 6]) as RequestId;
    statusesByRequestId.set(requestIdA, ['processing', 'replied']);
    statusesByRequestId.set(requestIdB, ['unknown', 'replied']);

    const expectedReplyArgA = IDL.encode([IDL.Text], ['okA']);
    const expectedReplyArgB = IDL.encode([IDL.Text], ['okB']);
    replyByRequestId.set(requestIdA, expectedReplyArgA);
    replyByRequestId.set(requestIdB, expectedReplyArgB);

    // Fake Agent that forces polling (202) and provides readState
    let callCount = 0;
    const fakeAgent = {
      rootKey: new Uint8Array([1]),
      call: async () => {
        const requestId = callCount === 0 ? requestIdA : requestIdB;
        callCount += 1;
        return {
          requestId,
          response: { status: 202 },
          reply: replyByRequestId.get(requestId)!,
          requestDetails: {},
        } as unknown as {
          requestId: Uint8Array;
          response: { status: number };
          requestDetails: object;
        };
      },
      readState: async () => ({ certificate: new Uint8Array([0]) }),
    } as unknown as Agent;

    // Simple update method to trigger poll
    const actorInterface = () =>
      IDL.Service({
        upd: IDL.Func([IDL.Text], [IDL.Text]),
      });

    const actor = Actor.createActor(actorInterface, {
      canisterId,
      // Critically, no pollingOptions override; Actor uses DEFAULT_POLLING_OPTIONS
      // which must not carry a pre-instantiated strategy
      agent: fakeAgent,
    });

    const outA = await actor.upd('x');
    const outB = await actor.upd('y');
    expect(outA).toBe('okA');
    expect(outB).toBe('okB');

    // defaultStrategy should have been created once per call, not shared
    expect(defaultStrategy.mock.calls.length).toBe(2);
    // Each created strategy used at least once
    expect(instantiatedStrategies.length).toBe(2);
    expect(instantiatedStrategies[0].mock.calls.length).toBe(1);
    expect(instantiatedStrategies[1].mock.calls.length).toBe(1);
  });
});
