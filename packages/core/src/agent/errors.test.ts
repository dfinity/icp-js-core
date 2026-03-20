/* eslint-disable no-prototype-builtins */
import { Principal } from '#principal';
import {
  AgentError,
  ErrorKindEnum,
  UnexpectedErrorCode,
  IdentityInvalidErrorCode,
  UnknownError,
  UncertifiedRejectErrorCode,
  CertifiedRejectErrorCode,
  CallContext,
  ErrorVerbosity,
  ErrorCode,
} from './errors.ts';
import { Expiry, ReplicaRejectCode } from './agent/index.ts';
import type { RequestId } from './request_id.ts';

class TestError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, TestError.prototype);
  }
}

test('AgentError', () => {
  const errorCode = new UnexpectedErrorCode(new TestError('message'));
  const agentError = new AgentError(errorCode, ErrorKindEnum.Unknown);
  const expectedErrorMessage = 'Unexpected error: Error: message';

  expect(agentError.name).toEqual('AgentError');
  expect(agentError.message.startsWith(expectedErrorMessage)).toEqual(true);
  expect(agentError.code).toBeInstanceOf(UnexpectedErrorCode);
  expect(agentError.kind).toBe(ErrorKindEnum.Unknown);
  expect(agentError.cause.code).toBeInstanceOf(UnexpectedErrorCode);
  expect(agentError.cause.kind).toBe(ErrorKindEnum.Unknown);
  expect(
    agentError.toString().startsWith('AgentError (Unknown): Unexpected error: Error: message'),
  ).toEqual(true);

  const unknownError = UnknownError.fromCode(errorCode);
  expect(unknownError.name).toEqual('UnknownError');
  expect(agentError.message.startsWith(expectedErrorMessage)).toEqual(true);
  expect(unknownError.code).toBeInstanceOf(UnexpectedErrorCode);
  expect(unknownError.kind).toBe(ErrorKindEnum.Unknown);
  expect(unknownError.cause.code).toBeInstanceOf(UnexpectedErrorCode);
  expect(unknownError.cause.kind).toBe(ErrorKindEnum.Unknown);
  expect(
    unknownError.toString().startsWith('UnknownError (Unknown): Unexpected error: Error: message'),
  ).toEqual(true);

  expect(agentError instanceof Error).toEqual(true);
  expect(agentError instanceof AgentError).toEqual(true);
  expect(agentError instanceof UnknownError).toEqual(false);
  expect(unknownError instanceof Error).toEqual(true);
  expect(unknownError instanceof AgentError).toEqual(true);
  expect(unknownError instanceof UnknownError).toEqual(true);
  expect(AgentError.prototype.isPrototypeOf(agentError)).toEqual(true);
  expect(AgentError.prototype.isPrototypeOf(unknownError)).toEqual(true);
  expect(UnknownError.prototype.isPrototypeOf(agentError)).toEqual(false);
  expect(UnknownError.prototype.isPrototypeOf(unknownError)).toEqual(true);

  expect(agentError.hasCode(UnexpectedErrorCode)).toEqual(true);
  // another error code to test that hasCode works
  expect(agentError.hasCode(IdentityInvalidErrorCode)).toEqual(false);

  expect(errorCode.toErrorMessage().startsWith(expectedErrorMessage)).toEqual(true);
  expect(errorCode.toString().startsWith(expectedErrorMessage)).toEqual(true);
  expect(errorCode.requestContext).toBeUndefined();
  expect(errorCode.toString().includes('\nRequest context:')).toBe(false);
  expect(errorCode.callContext).toBeUndefined();
  expect(errorCode.toString().includes('\nCall context:')).toBe(false);
  errorCode.requestContext = {
    requestId: undefined,
    senderPubKey: new Uint8Array(1),
    senderSignature: new Uint8Array(1),
    ingressExpiry: Expiry.fromDeltaInMilliseconds(1),
  };
  expect(errorCode.requestContext).toBeDefined();
  expect(errorCode.toString().includes('\nRequest context:')).toBe(true);
  errorCode.callContext = {
    canisterId: Principal.anonymous(),
    methodName: 'test',
    httpDetails: {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: [],
    },
  };
  expect(errorCode.callContext).toBeDefined();
  expect(errorCode.toString().includes('\nCall context:')).toBe(true);

  const anotherErrorCode = new IdentityInvalidErrorCode();
  agentError.code = anotherErrorCode;
  expect(agentError.code).toBe(anotherErrorCode);
  expect(agentError.cause.code).toBe(anotherErrorCode);
  unknownError.code = anotherErrorCode;
  expect(unknownError.code).toBe(anotherErrorCode);
  expect(unknownError.cause.code).toBe(anotherErrorCode);

  const anotherKind = ErrorKindEnum.External;
  agentError.kind = anotherKind;
  expect(agentError.kind).toBe(anotherKind);
  expect(agentError.cause.kind).toBe(anotherKind);
  unknownError.kind = anotherKind;
  expect(unknownError.kind).toBe(anotherKind);
  expect(unknownError.cause.kind).toBe(anotherKind);
});

test('Error code certification', () => {
  const requestId = new Uint8Array(16) as RequestId;
  const rejectCode = ReplicaRejectCode.CanisterReject;
  const rejectMessage = 'message';
  const rejectErrorCode = '42';

  const uncertifiedRejectErrorCode = new UncertifiedRejectErrorCode(
    requestId,
    rejectCode,
    rejectMessage,
    rejectErrorCode,
    [],
  );
  const agentError = new AgentError(uncertifiedRejectErrorCode, ErrorKindEnum.Trust);
  expect(uncertifiedRejectErrorCode.isCertified).toBe(false);
  expect(agentError.isCertified).toBe(false);

  const certifiedRejectErrorCode = new CertifiedRejectErrorCode(
    requestId,
    rejectCode,
    rejectMessage,
    rejectErrorCode,
  );
  agentError.code = certifiedRejectErrorCode;
  expect(certifiedRejectErrorCode.isCertified).toBe(true);
  expect(agentError.isCertified).toBe(true);
});

describe('ErrorCode httpDetails verbosity in toString()', () => {
  function createErrorWithLargeArg() {
    const errorCode = new UnexpectedErrorCode(new Error('test'));
    const largeArg = new Uint8Array(20000);
    for (let i = 0; i < largeArg.length; i++) {
      largeArg[i] = i % 256;
    }
    errorCode.callContext = {
      canisterId: Principal.anonymous(),
      methodName: 'upload_asset_chunk',
      httpDetails: {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: [],
        requestDetails: {
          request_type: 'call',
          canister_id: Principal.anonymous(),
          method_name: 'upload_asset_chunk',
          arg: largeArg,
          sender: Principal.anonymous(),
          ingress_expiry: { __expiry__: '0' },
        },
      } as unknown as CallContext['httpDetails'],
    };
    return errorCode;
  }

  afterEach(() => {
    ErrorCode.verbosity = ErrorVerbosity.Normal;
  });

  // First bytes of the arg are [0, 1, 2, ..., 255, 0, 1, ...] → hex starts with "000102030405..."
  const expectedHexPrefix = '000102030405060708090a0b0c0d0e0f';

  it.each([
    {
      verbosity: ErrorVerbosity.Normal,
      expectedToContain: 'use ErrorVerbosity.Verbose to display',
      expectedNotToContain: 'hex(20000):',
      shouldContainHex: false,
    },
    {
      verbosity: ErrorVerbosity.Verbose,
      expectedToContain: 'hex(20000):',
      expectedNotToContain: 'use ErrorVerbosity.Verbose to display',
      shouldContainHex: true,
    },
  ])(
    'should format binary fields correctly with $verbosity verbosity',
    ({ verbosity, expectedToContain, expectedNotToContain, shouldContainHex }) => {
      ErrorCode.verbosity = verbosity;
      const errorCode = createErrorWithLargeArg();
      const output = errorCode.toString();
      expect(output).not.toContain('"0":');
      expect(output).toContain(expectedToContain);
      expect(output).not.toContain(expectedNotToContain);
      if (shouldContainHex) {
        expect(output).toContain(`hex(20000):${expectedHexPrefix}`);
      }
    },
  );
});
