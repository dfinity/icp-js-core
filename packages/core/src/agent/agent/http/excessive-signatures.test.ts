import { Principal } from '#principal';
import { HttpAgent } from '../index.ts';
import * as cbor from '../../cbor.ts';
import {
  AgentError,
  ExcessiveSignaturesErrorCode,
  MalformedSignatureErrorCode,
  MissingSignatureErrorCode,
} from '../../errors.ts';
import { lookupNodeKeysFromCertificate } from '../../utils/readState.ts';

// Mock the certificate module to bypass real certificate verification in fetchSubnetKeys
jest.mock('../../certificate.ts', () => {
  const actual = jest.requireActual('../../certificate.ts');
  return {
    ...actual,
    Certificate: {
      ...actual.Certificate,
      create: jest.fn().mockResolvedValue({
        cert: {
          delegation: { subnet_id: new Uint8Array(29) },
          tree: [0],
        },
      }),
    },
    getSubnetIdFromCertificate: jest.fn().mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('#principal').Principal.anonymous(),
    ),
    check_canister_ranges: jest.fn().mockReturnValue(true),
  };
});

jest.mock('../../utils/readState.ts', () => {
  const actual = jest.requireActual('../../utils/readState.ts');
  return {
    ...actual,
    lookupNodeKeysFromCertificate: jest.fn(),
  };
});

const NANOSECONDS_PER_MILLISECONDS = 1_000_000;
const SUBNET_SIZE = 3;

function createSubnetNodeKeys(size: number): Map<string, Uint8Array> {
  const keys = new Map<string, Uint8Array>();
  for (let i = 0; i < size; i++) {
    keys.set(`node-${i}`, new Uint8Array(44));
  }
  return keys;
}

describe('excessive signatures guard', () => {
  const canisterId = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');
  const now = 1_700_000_000_000;

  beforeEach(() => {
    jest.setSystemTime(now);
    (lookupNodeKeysFromCertificate as jest.Mock).mockReturnValue(createSubnetNodeKeys(SUBNET_SIZE));
  });

  function createMockFetch(queryResponse: unknown) {
    return jest.fn((url: unknown) => {
      if (String(url).includes('/query')) {
        const body = cbor.encode(queryResponse);
        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/cbor' },
          }),
        );
      }
      const readStateResponse = cbor.encode({
        certificate: new Uint8Array(0),
      });
      return Promise.resolve(
        new Response(readStateResponse, {
          status: 200,
          headers: { 'Content-Type': 'application/cbor' },
        }),
      );
    });
  }

  function createQueryResponse(signatureCount: number) {
    const timestampNs = BigInt(now) * BigInt(NANOSECONDS_PER_MILLISECONDS);
    return {
      status: 'replied',
      reply: { arg: new Uint8Array([]) },
      signatures: Array.from({ length: signatureCount }, () => ({
        timestamp: timestampNs,
        signature: new Uint8Array(64),
        identity: Principal.anonymous().toUint8Array(),
      })),
    };
  }

  it.each([{ signatureCount: 4 }])(
    'should throw ExcessiveSignaturesErrorCode for $signatureCount signatures',
    async ({ signatureCount }) => {
      const agent = HttpAgent.createSync({
        fetch: createMockFetch(createQueryResponse(signatureCount)),
        host: 'http://localhost:4943',
        retryTimes: 0,
        rootKey: new Uint8Array(96),
      });

      await expect(
        agent.query(canisterId, { methodName: 'greet', arg: new Uint8Array([]) }),
      ).rejects.toThrow(
        expect.objectContaining({
          cause: expect.objectContaining({
            code: expect.any(ExcessiveSignaturesErrorCode),
          }),
        }),
      );
    },
  );

  it('should retry with fresh subnet keys and still throw if signatures exceed refreshed subnet size', async () => {
    const mockFetch = createMockFetch(createQueryResponse(4));
    const agent = HttpAgent.createSync({
      fetch: mockFetch,
      host: 'http://localhost:4943',
      retryTimes: 0,
      rootKey: new Uint8Array(96),
    });

    await expect(
      agent.query(canisterId, { methodName: 'greet', arg: new Uint8Array([]) }),
    ).rejects.toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          code: expect.any(ExcessiveSignaturesErrorCode),
        }),
      }),
    );

    // Should have 2 readState calls: initial fetch + retry refresh
    const readStateCalls = mockFetch.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('/read_state'),
    );
    expect(readStateCalls).toHaveLength(2);
  });

  it.each([
    { label: 'omitted', signatures: undefined },
    { label: 'an empty array', signatures: [] },
  ])('should throw MissingSignatureErrorCode when signatures is $label', async ({ signatures }) => {
    const agent = HttpAgent.createSync({
      fetch: createMockFetch({
        status: 'replied',
        reply: { arg: new Uint8Array([]) },
        ...(signatures === undefined ? {} : { signatures }),
      }),
      host: 'http://localhost:4943',
      retryTimes: 0,
      rootKey: new Uint8Array(96),
    });

    await expect(
      agent.query(canisterId, { methodName: 'greet', arg: new Uint8Array([]) }),
    ).rejects.toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          code: expect.any(MissingSignatureErrorCode),
        }),
      }),
    );
  });

  describe('non-array signatures field', () => {
    function createSignature() {
      return {
        timestamp: BigInt(now) * BigInt(NANOSECONDS_PER_MILLISECONDS),
        signature: new Uint8Array(64),
        identity: Principal.anonymous().toUint8Array(),
      };
    }

    it.each([
      { label: 'a map with an index key', signatures: { '0': createSignature() } },
      {
        label: 'a map with an index key and a "__proto__" key',
        // The computed key defines "__proto__" as an own property, so the encoder emits it.
        signatures: { '0': createSignature(), ['__proto__']: [] },
      },
    ])('should throw MalformedSignatureErrorCode for $label', async ({ signatures }) => {
      const agent = HttpAgent.createSync({
        fetch: createMockFetch({
          status: 'replied',
          reply: { arg: new Uint8Array([]) },
          signatures,
        }),
        host: 'http://localhost:4943',
        retryTimes: 0,
        rootKey: new Uint8Array(96),
      });

      await expect(
        agent.query(canisterId, { methodName: 'greet', arg: new Uint8Array([]) }),
      ).rejects.toThrow(
        expect.objectContaining({
          cause: expect.objectContaining({
            code: expect.any(MalformedSignatureErrorCode),
          }),
        }),
      );
    });
  });

  it.each([{ signatureCount: 1 }, { signatureCount: 3 }])(
    'should not throw ExcessiveSignaturesErrorCode for $signatureCount signatures',
    async ({ signatureCount }) => {
      const agent = HttpAgent.createSync({
        fetch: createMockFetch(createQueryResponse(signatureCount)),
        host: 'http://localhost:4943',
        retryTimes: 0,
        rootKey: new Uint8Array(96),
      });

      try {
        await agent.query(canisterId, { methodName: 'greet', arg: new Uint8Array([]) });
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).cause.code).not.toBeInstanceOf(ExcessiveSignaturesErrorCode);
      }
    },
  );
});
