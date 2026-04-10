import { Principal } from '#principal';
import { HttpAgent } from '../index.ts';
import type { CallOptions, SubmitResponse } from '../index.ts';
import type { RequestId } from '../../request_id.ts';
import type { LookupPathResultFound, LookupPathStatus } from '../../certificate.ts';
import { ExternalError, RejectError, UnknownError, UnexpectedV4StatusErrorCode } from '../../errors.ts';
import type { Expiry } from './transforms.ts';
import { type CallRequest, SubmitRequestType } from './types.ts';
import { ECDSAKeyIdentity } from '../../../identity';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Map a requestId key to a queue of statuses to emit across polls
const statusesByRequestKey = new Map<RequestId, string[]>();
const replyByRequestKey = new Map<RequestId, Uint8Array>();
// Set of requestIds for which the certificate should have no status entry (simulates absent status in v4 cert)
const absentStatusRequestIds = new Set<RequestId>();
const rejectByRequestKey = new Map<
  RequestId,
  { reject_code: number; reject_message: string; error_code?: string }
>();

jest.mock('../../certificate.ts', () => {
  return {
    ...jest.requireActual('../../certificate.ts'),
    lookupResultToBuffer: (res: LookupPathResultFound) => res?.value,
    Certificate: {
      create: jest.fn(async () => {
        return {
          lookup_path: (path: [string, RequestId, string]) => {
            const requestIdBytes = path[1];
            const lastPathElement = path[path.length - 1] as string | Uint8Array;
            const lastPathElementStr =
              typeof lastPathElement === 'string'
                ? lastPathElement
                : textDecoder.decode(lastPathElement);

            if (lastPathElementStr === 'status') {
              if (absentStatusRequestIds.has(requestIdBytes)) {
                return { status: 'Absent' as LookupPathStatus.Absent };
              }
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

const HTTP_AGENT_HOST = 'http://127.0.0.1:4943';

const canisterId = Principal.anonymous();
const requestId = new Uint8Array([10, 20, 30]) as RequestId;

const mockRequestDetails: CallRequest = {
  request_type: SubmitRequestType.Call,
  canister_id: canisterId,
  method_name: 'test_method',
  arg: new Uint8Array([1]),
  sender: new Uint8Array([4]),
  ingress_expiry: { toHash: () => new Uint8Array() } as unknown as Expiry,
};

const callFields: CallOptions = {
  methodName: 'test_method',
  arg: new Uint8Array([1]),
  effectiveCanisterId: canisterId,
};

function createAgentWithCallMock(
  responseOverrides: {
    status?: number;
    statusText?: string;
    body?: unknown;
    ok?: boolean;
  } = {},
): HttpAgent {
  const agent = HttpAgent.createSync({
    host: HTTP_AGENT_HOST,
    fetch: jest.fn(),
  });
  // Set rootKey so certificate verification doesn't fail
  Object.defineProperty(agent, 'rootKey', { value: new Uint8Array([1]), writable: true });

  jest.spyOn(agent, 'call').mockResolvedValue({
    requestId,
    requestDetails: mockRequestDetails,
    response: {
      ok: responseOverrides.ok ?? true,
      status: responseOverrides.status ?? 202,
      statusText: responseOverrides.statusText ?? 'Accepted',
      body: (responseOverrides.body ?? null) as SubmitResponse['response']['body'],
      headers: [],
    },
  });

  jest.spyOn(agent, 'readState').mockResolvedValue({ certificate: new Uint8Array([0]) } as never);

  return agent;
}

describe('HttpAgent.update', () => {
  beforeEach(() => {
    statusesByRequestKey.clear();
    replyByRequestKey.clear();
    rejectByRequestKey.clear();
    absentStatusRequestIds.clear();
  });

  describe('202 fallback to polling', () => {
    it('returns the expected reply', async () => {
      const agent = createAgentWithCallMock();
      const expectedReply = new Uint8Array([42]);
      replyByRequestKey.set(requestId, expectedReply);

      const result = await agent.update(canisterId, callFields);

      expect(result.reply).toEqual(expectedReply);
    });

    it('returns the expected rawCertificate', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const result = await agent.update(canisterId, callFields);

      expect(result.rawCertificate).toEqual(new Uint8Array([0]));
    });

    it('returns a certificate that can look up the reply', async () => {
      const agent = createAgentWithCallMock();
      const expectedReply = new Uint8Array([42]);
      replyByRequestKey.set(requestId, expectedReply);

      const result = await agent.update(canisterId, callFields);

      expect(result.certificate).toBeDefined();
      expect(typeof result.certificate.lookup_path).toBe('function');
      const lookupResult = result.certificate.lookup_path([
        new Uint8Array(),
        requestId,
        'reply',
      ]) as LookupPathResultFound;
      expect(lookupResult.value).toEqual(expectedReply);
    });

    it('returns the expected requestDetails', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const result = await agent.update(canisterId, callFields);

      expect(result.requestDetails).toEqual(mockRequestDetails);
    });

    it('calls agent.call with the canisterId and fields', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      await agent.update(canisterId, callFields);

      expect(agent.call).toHaveBeenCalledWith(canisterId, callFields, undefined);
    });

    it('throws RejectError with reject details when polling encounters a rejection', async () => {
      const agent = createAgentWithCallMock();
      statusesByRequestKey.set(requestId, ['rejected']);
      rejectByRequestKey.set(requestId, {
        reject_code: 4,
        reject_message: 'canister rejected',
        error_code: 'IC0406',
      });

      try {
        await agent.update(canisterId, callFields);
        fail('Expected update to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(RejectError);
        const code = (
          error as { code: { rejectCode: number; rejectMessage: string; rejectErrorCode: string } }
        ).code;
        expect(code.rejectCode).toBe(4);
        expect(code.rejectMessage).toBe('canister rejected');
        expect(code.rejectErrorCode).toBe('IC0406');
      }
    });

    it('uses effectiveCanisterId when provided', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const ecid = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
      const fieldsWithEcid = {
        methodName: 'test_method',
        arg: new Uint8Array([1]),
        effectiveCanisterId: ecid,
      };

      await agent.update(canisterId, fieldsWithEcid);

      expect(agent.call).toHaveBeenCalledWith(canisterId, fieldsWithEcid, undefined);
    });

    it('accepts canisterId as a string', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const result = await agent.update(canisterId.toText(), callFields);

      expect(result.reply).toEqual(new Uint8Array([42]));
      expect(agent.call).toHaveBeenCalledWith(canisterId.toText(), callFields, undefined);
    });

    it('passes nonce through to agent.call', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));
      const nonce = new Uint8Array([99, 88, 77]);

      const fieldsWithNonce = { ...callFields, nonce };
      await agent.update(canisterId, fieldsWithNonce);

      expect(agent.call).toHaveBeenCalledWith(canisterId, fieldsWithNonce, undefined);
    });

    it('passes identity through to agent.call', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const identity = await ECDSAKeyIdentity.generate();
      await agent.update(canisterId, callFields, undefined, identity);

      expect(agent.call).toHaveBeenCalledWith(canisterId, callFields, identity);
    });

    it('includes callResponse in the result', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const result = await agent.update(canisterId, callFields);

      expect(result.callResponse).toEqual({
        ok: true,
        status: 202,
        statusText: 'Accepted',
        body: null,
        headers: [],
      });
    });

    it('polls via readState when response is 202 Accepted', async () => {
      const agent = createAgentWithCallMock();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const result = await agent.update(canisterId, callFields);

      expect(result.reply).toEqual(new Uint8Array([42]));
      expect(agent.readState).toHaveBeenCalled();
    });
  });

  describe('v4 sync response handling', () => {
    function createAgentWithV4Response(overrides: { certificate?: Uint8Array } = {}): HttpAgent {
      return createAgentWithCallMock({
        status: 200,
        statusText: 'OK',
        body: { certificate: overrides.certificate ?? new Uint8Array([0]) },
      });
    }

    it('uses v4 sync response without polling when reply is available', async () => {
      const agent = createAgentWithV4Response();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const result = await agent.update(canisterId, callFields);

      expect(result.reply).toEqual(new Uint8Array([42]));
      expect(result.certificate).toBeDefined();
      expect(result.rawCertificate).toEqual(new Uint8Array([0]));
      expect(result.requestDetails).toEqual(mockRequestDetails);
      expect(agent.readState).not.toHaveBeenCalled();
    });

    it('returns the v4 certificate bytes as rawCertificate', async () => {
      const certBytes = new Uint8Array([10, 20, 30]);
      const agent = createAgentWithV4Response({ certificate: certBytes });
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      const result = await agent.update(canisterId, callFields);

      expect(result.rawCertificate).toEqual(certBytes);
    });

    it('throws ExternalError when agent.rootKey is null', async () => {
      const agent = createAgentWithV4Response();
      Object.defineProperty(agent, 'rootKey', { value: null, writable: true });
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      await expect(agent.update(canisterId, callFields)).rejects.toThrow(ExternalError);
    });

    it('throws UnknownError with UnexpectedV4StatusErrorCode for unexpected v4 status', async () => {
      const agent = createAgentWithV4Response();
      statusesByRequestKey.set(requestId, ['processing']);
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      try {
        await agent.update(canisterId, callFields);
        fail('Expected update to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(UnknownError);
        expect((error as UnknownError).code).toBeInstanceOf(UnexpectedV4StatusErrorCode);
        const code = (error as UnknownError).code as UnexpectedV4StatusErrorCode;
        expect(code.status).toBe('processing');
      }
      expect(agent.readState).not.toHaveBeenCalled();
    });

    // Reproduces: boundary node returns a v4 sync response (200 OK + certificate body)
    // but the certificate tree does not contain a request_status entry for the requestId.
    // The agent should fall back to polling via read state requests.
    it('falls back to polling when v4 certificate has no request_status entry for the requestId', async () => {
      const agent = createAgentWithV4Response();
      replyByRequestKey.set(requestId, new Uint8Array([42]));

      // The v4 certificate will return absent for the request ID.
      absentStatusRequestIds.add(requestId);
      const origReadState = agent.readState as jest.Mock;
      origReadState.mockImplementation(async (...args: unknown[]) => {
        // Polling gets a fresh certificate where the request is now present
        absentStatusRequestIds.delete(requestId);
        return { certificate: new Uint8Array([0]) };
      });

      const result = await agent.update(canisterId, callFields);

      expect(result.reply).toEqual(new Uint8Array([42]));
      expect(agent.readState).toHaveBeenCalled();
    });

    it('throws RejectError with reject details for v4 rejected response', async () => {
      const agent = createAgentWithV4Response();
      statusesByRequestKey.set(requestId, ['rejected']);
      rejectByRequestKey.set(requestId, {
        reject_code: 4,
        reject_message: 'canister trapped',
        error_code: 'IC0503',
      });

      try {
        await agent.update(canisterId, callFields);
        fail('Expected update to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(RejectError);
        const code = (
          error as { code: { rejectCode: number; rejectMessage: string; rejectErrorCode: string } }
        ).code;
        expect(code.rejectCode).toBe(4);
        expect(code.rejectMessage).toBe('canister trapped');
        expect(code.rejectErrorCode).toBe('IC0503');
      }
      expect(agent.readState).not.toHaveBeenCalled();
    });
  });

  describe('unexpected response handling', () => {
    it('throws UnknownError for status 200 with unrecognized body', async () => {
      const agent = createAgentWithCallMock({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: null,
      });

      await expect(agent.update(canisterId, callFields)).rejects.toThrow(UnknownError);
      expect(agent.readState).not.toHaveBeenCalled();
    });

    it('throws UnknownError for an unexpected status code with null body', async () => {
      const agent = createAgentWithCallMock({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: null,
      });

      await expect(agent.update(canisterId, callFields)).rejects.toThrow(UnknownError);
      expect(agent.readState).not.toHaveBeenCalled();
    });
  });

  describe('v2 rejection handling', () => {
    it('throws RejectError with reject details for v2 rejection', async () => {
      const agent = createAgentWithCallMock({
        ok: false,
        status: 200,
        statusText: 'OK',
        body: {
          reject_code: 5,
          reject_message: 'canister error',
          error_code: 'IC0503',
        },
      });

      try {
        await agent.update(canisterId, callFields);
        fail('Expected update to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(RejectError);
        const code = (
          error as { code: { rejectCode: number; rejectMessage: string; rejectErrorCode: string } }
        ).code;
        expect(code.rejectCode).toBe(5);
        expect(code.rejectMessage).toBe('canister error');
        expect(code.rejectErrorCode).toBe('IC0503');
      }
      expect(agent.readState).not.toHaveBeenCalled();
    });
  });
});
