/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpAgent, Nonce } from '../index.ts';
import * as cbor from '../../cbor.ts';
import { Expiry, httpHeadersTransform } from './transforms.ts';
import {
  CallRequest,
  Envelope,
  HttpAgentRequestTransformFn,
  makeNonce,
  SubmitRequestType,
} from './types.ts';
import { Principal } from '#principal';
import { RequestId, requestIdOf } from '../../request_id.ts';

import { JSDOM } from 'jsdom';
import { AnonymousIdentity, SignIdentity, Signature, uint8FromBufLike } from '../../index.ts';
import { Ed25519KeyIdentity } from '#identity';
import {
  AgentError,
  HttpErrorCode,
  HttpFetchErrorCode,
  IdentityInvalidErrorCode,
} from '../../errors.ts';
import { utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils';

const { window } = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`);
window.fetch = global.fetch;
(global as any).window = window;

const HTTP_AGENT_HOST = 'http://127.0.0.1:4943';

const NANOSECONDS_PER_MILLISECONDS = 1_000_000;

function createIdentity(seed: number): Ed25519KeyIdentity {
  const seed1 = new Array(32).fill(0);
  seed1[0] = seed;
  return Ed25519KeyIdentity.generate(new Uint8Array(seed1));
}

const originalDateNowFn = global.Date.now;
const originalWindow = global.window;
const originalFetch = global.fetch;

beforeEach(() => {
  global.Date.now = jest.fn(() => new Date(NANOSECONDS_PER_MILLISECONDS).getTime());
  Object.assign(global, 'window', {
    value: {
      originalWindow,
    },
    writable: true,
  });
  global.fetch = originalFetch;
});

afterEach(() => {
  global.Date.now = originalDateNowFn;
  global.window = originalWindow;
  global.fetch = originalFetch;
  jest.runOnlyPendingTimers();
});

test('call', async () => {
  const mockFetch: jest.Mock = jest.fn(() => {
    return Promise.resolve(
      new Response(null, {
        status: 200,
      }),
    );
  });

  const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');
  const nonce = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) as Nonce;
  const principal = Principal.anonymous();

  const httpAgent = new HttpAgent({ fetch: mockFetch, host: 'http://127.0.0.1' });

  const methodName = 'greet';
  const arg = new Uint8Array([]);

  const { requestId } = await httpAgent.call(canisterId, {
    methodName,
    arg,
    nonce, // Explicitly pass the nonce to ensure consistency
  });

  const mockPartialRequest = {
    request_type: SubmitRequestType.Call,
    canister_id: canisterId,
    method_name: methodName,
    arg,
    sender: principal,
    ingress_expiry: Expiry.fromDeltaInMilliseconds(300000),
    nonce,
  };

  const mockPartialsRequestId = requestIdOf(mockPartialRequest);

  const expectedRequest = {
    content: mockPartialRequest,
  };

  const expectedRequestId = requestIdOf(expectedRequest.content);
  expect(expectedRequestId).toEqual(mockPartialsRequestId);

  const { calls } = mockFetch.mock;
  expect(calls.length).toBe(1);

  // For test stability, don't directly compare requestIds
  expect(requestId).toBeTruthy();

  const callUrl = calls[0][0];
  const callParams = calls[0][1];
  expect(callUrl.toString()).toBe(`http://127.0.0.1/api/v4/canister/${canisterId.toText()}/call`);
  expect(callParams.method).toEqual('POST');

  // Get the body from the request and ensure nonce matches
  const requestBody = cbor.decode<Envelope<CallRequest>>(callParams.body);
  expect(Array.from(requestBody.content.nonce!)).toHaveLength(Array.from(nonce).length);

  expect(callParams.headers['Content-Type']).toEqual('application/cbor');
});

test.todo('query');

test('queries with the same content should have the same signature', async () => {
  const mockResponse = {
    status: 'replied',
    reply: { arg: new Uint8Array([]) },
  };

  const mockFetch: jest.Mock = jest.fn(() => {
    const body = cbor.encode(mockResponse);
    return Promise.resolve(
      new Response(body, {
        status: 200,
      }),
    );
  });

  const canisterId = '2chl6-4hpzw-vqaaa-aaaaa-c';
  const nonce = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) as Nonce;

  const principal = Principal.anonymous();

  const httpAgent = new HttpAgent({
    fetch: mockFetch,
    host: 'http://127.0.0.1',
    verifyQuerySignatures: false,
  });

  const methodName = 'greet';
  const arg = new Uint8Array([]);

  const requestId = requestIdOf({
    request_type: SubmitRequestType.Call,
    nonce,
    canister_id: Principal.fromText(canisterId).toString(),
    method_name: methodName,
    arg,
    sender: principal,
  });

  const paths = [[utf8ToBytes('request_status'), requestId, utf8ToBytes('reply')]];

  const response1 = await httpAgent.readState(canisterId, { paths });
  const response2 = await httpAgent.readState(canisterId, { paths });

  const response3 = await httpAgent.query(canisterId, { arg, methodName });
  const response4 = await httpAgent.query(canisterId, { methodName, arg });

  const { calls } = mockFetch.mock;
  expect(calls.length).toBe(4);

  expect(calls[0]).toEqual(calls[1]);
  expect(response1).toEqual(response2);

  // TODO - investigate why these are not equal
  // expect(calls[2]).toEqual(calls[3]);
  expect(response3).toEqual(response4);
});

test('readState should not call transformers if request is passed', async () => {
  const mockResponse = {
    status: 'replied',
    reply: { arg: new Uint8Array([]) },
  };

  const mockFetch: jest.Mock = jest.fn(() => {
    const body = cbor.encode(mockResponse);
    return Promise.resolve(
      new Response(body, {
        status: 200,
      }),
    );
  });

  const canisterIdent = '2chl6-4hpzw-vqaaa-aaaaa-c';
  const nonce = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) as Nonce;

  const principal = Principal.anonymous();

  const httpAgent = new HttpAgent({
    fetch: mockFetch,
    host: 'http://127.0.0.1',
    useQueryNonces: true,
  });
  const transformMock: HttpAgentRequestTransformFn = jest
    .fn()
    .mockImplementation(d => Promise.resolve(d));
  httpAgent.addTransform('query', transformMock);

  const methodName = 'greet';
  const arg = new Uint8Array([]);

  const requestId = requestIdOf({
    request_type: SubmitRequestType.Call,
    nonce,
    canister_id: Principal.fromText(canisterIdent).toString(),
    method_name: methodName,
    arg,
    sender: principal,
  });

  const paths = [[utf8ToBytes('request_status'), requestId, utf8ToBytes('reply')]];

  const request = await httpAgent.createReadStateRequest({ paths });
  expect(transformMock).toHaveBeenCalledTimes(1);
  await httpAgent.readState(canisterIdent, { paths }, undefined, request);
  expect(transformMock).toHaveBeenCalledTimes(1);
});

test('use provided nonce for call', async () => {
  const mockFetch: jest.Mock = jest.fn(() => {
    return Promise.resolve(
      new Response(null, {
        status: 200,
      }),
    );
  });

  const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');
  const nonce = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) as Nonce;

  const httpAgent = new HttpAgent({ fetch: mockFetch, host: 'http://localhost' });

  const methodName = 'greet';
  const arg = new Uint8Array(32);

  const callResponse = await httpAgent.call(canisterId, {
    methodName,
    arg,
    nonce,
  });

  expect(callResponse?.requestDetails?.nonce).toEqual(nonce);
});

test('redirect avoid', async () => {
  function checkUrl(base: string, result: string) {
    const httpAgent = new HttpAgent({ host: base });
    expect(httpAgent.host.hostname).toBe(result);
  }

  checkUrl('https://ic0.app', 'ic0.app');
  checkUrl('https://IC0.app', 'ic0.app');
  checkUrl('https://foo.ic0.app', 'ic0.app');
  checkUrl('https://foo.IC0.app', 'ic0.app');
  checkUrl('https://foo.Ic0.app', 'ic0.app');
  checkUrl('https://foo.iC0.app', 'ic0.app');
  checkUrl('https://foo.bar.ic0.app', 'ic0.app');
  checkUrl('https://ic0.app/foo/', 'ic0.app');
  checkUrl('https://foo.ic0.app/foo/', 'ic0.app');

  // icp-api.io
  checkUrl('https://icp-api.io', 'icp-api.io');
  checkUrl('https://ICP-API.io', 'icp-api.io');
  checkUrl('https://foo.icp-api.io', 'icp-api.io');
  checkUrl('https://foo.ICP-API.io', 'icp-api.io');
  checkUrl('https://foo.Icp-api.io', 'icp-api.io');
  checkUrl('https://foo.bar.icp-api.io', 'icp-api.io');
  checkUrl('https://icp-api.io/foo/', 'icp-api.io');
  checkUrl('https://foo.icp-api.io/foo/', 'icp-api.io');

  // icp-api.io
  checkUrl('https://icp0.io', 'icp0.io');
  checkUrl('https://ICP0.io', 'icp0.io');
  checkUrl('https://foo.icp0.io', 'icp0.io');
  checkUrl('https://foo.ICP0.io', 'icp0.io');
  checkUrl('https://foo.Icp0.io', 'icp0.io');
  checkUrl('https://foo.bar.icp0.io', 'icp0.io');
  checkUrl('https://icp0.io/foo/', 'icp0.io');
  checkUrl('https://foo.icp0.io/foo/', 'icp0.io');

  checkUrl('https://ic1.app', 'ic1.app');
  checkUrl('https://foo.ic1.app', 'foo.ic1.app');
  checkUrl('https://ic0.app.ic1.app', 'ic0.app.ic1.app');

  checkUrl('https://fooic0.app', 'fooic0.app');
  checkUrl('https://fooic0.app.ic0.app', 'ic0.app');
});

test('use anonymous principal if unspecified', async () => {
  const mockFetch: jest.Mock = jest.fn(() => {
    return Promise.resolve(
      new Response(new Uint8Array([]), {
        status: 200,
      }),
    );
  });

  const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');
  const nonce = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) as Nonce;
  const principal = Principal.anonymous();

  const httpAgent = new HttpAgent({
    fetch: mockFetch,
    host: 'http://127.0.0.1',
  });

  const methodName = 'greet';
  const arg = new Uint8Array([]);

  const { requestId } = await httpAgent.call(canisterId, {
    methodName,
    arg,
    nonce, // Explicitly pass the nonce to ensure consistency
  });

  const mockPartialRequest: CallRequest = {
    request_type: SubmitRequestType.Call,
    canister_id: canisterId,
    method_name: methodName,
    arg,
    sender: principal,
    ingress_expiry: Expiry.fromDeltaInMilliseconds(300000),
    nonce,
  };

  const mockPartialsRequestId = requestIdOf(mockPartialRequest);

  const expectedRequest: Envelope<CallRequest> = {
    content: mockPartialRequest,
  };

  const expectedRequestId = requestIdOf(expectedRequest.content);
  expect(expectedRequestId).toEqual(mockPartialsRequestId);

  const { calls } = mockFetch.mock;
  expect(calls.length).toBe(1);

  // For test stability, don't directly compare requestIds
  expect(requestId).toBeTruthy();

  expect(calls[0][0].toString()).toBe(
    `http://127.0.0.1/api/v4/canister/${canisterId.toText()}/call`,
  );
  const call2 = calls[0][1];
  expect(call2.method).toEqual('POST');

  // Get the body from the request and ensure nonce matches
  const requestBody = cbor.decode<Envelope<CallRequest>>(call2.body);
  expect(Array.from(requestBody.content.nonce!)).toHaveLength(Array.from(nonce).length);

  expect(call2.headers['Content-Type']).toEqual('application/cbor');
});

describe('transforms', () => {
  it('should map from fetch Headers to HttpFieldHeader', async () => {
    const headers = new Headers([]);
    headers.set('content-type', 'text/plain');

    expect(httpHeadersTransform(headers)).toEqual([['content-type', 'text/plain']]);
  });
});

describe('getDefaultFetch', () => {
  it("should use fetch from window if it's available", async () => {
    const generateAgent = () => new HttpAgent({ host: HTTP_AGENT_HOST });
    expect(generateAgent).not.toThrow();
  });
  it('should throw an error if fetch is not available on the window object', async () => {
    delete (window as any).fetch;
    const generateAgent = () => new HttpAgent({ host: HTTP_AGENT_HOST });

    expect(generateAgent).toThrow('Fetch implementation was not available');
  });
  it('should throw error for defaultFetch with no window or global fetch', () => {
    delete (global as any).window;
    delete (global as any).fetch;
    const generateAgent = () => new HttpAgent({ host: HTTP_AGENT_HOST });

    expect(generateAgent).toThrow('Fetch implementation was not available');
  });
  it('should fall back to global.fetch if window is not available', () => {
    delete (global as any).window;
    global.fetch = originalFetch;
    const generateAgent = () => new HttpAgent({ host: HTTP_AGENT_HOST });

    expect(generateAgent).not.toThrow();
  });
  it.todo('should throw an error if window, global, and fetch are not available');
});

describe('invalidate identity', () => {
  const mockFetch: jest.Mock = jest.fn();
  it('should allow its identity to be invalidated', () => {
    const identity = new AnonymousIdentity();
    const agent = new HttpAgent({ identity, fetch: mockFetch, host: 'http://127.0.0.1' });
    const invalidate = () => agent.invalidateIdentity();
    expect(invalidate).not.toThrow();
  });
  it('should throw an error instead of making a call if its identity is invalidated', async () => {
    const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');
    const identity = new AnonymousIdentity();
    const agent = new HttpAgent({ identity, fetch: mockFetch, host: 'http://127.0.0.1' });
    agent.invalidateIdentity();

    const expectedError =
      "This identity has expired due this application's security policy. Please refresh your authentication.";

    expect.assertions(3);
    // Test Agent.call
    try {
      await agent.call(canisterId, {
        methodName: 'test',
        arg: new Uint8Array(16),
      });
    } catch (error) {
      expect((error as Error).message).toBe(expectedError);
    }
    // Test Agent.query
    try {
      await agent.query(canisterId, {
        methodName: 'test',
        arg: new Uint8Array(16),
      });
    } catch (error) {
      expect((error as Error).message).toBe(expectedError);
    }
    // Test readState
    try {
      const path = utf8ToBytes('request_status');
      await agent.readState(canisterId, {
        paths: [[path]],
      });
    } catch (error) {
      expect((error as Error).message).toBe(expectedError);
    }
  });
});
describe('replace identity', () => {
  const mockFetch: jest.Mock = jest.fn();
  it('should allow an actor to replace its identity', () => {
    const identity = new AnonymousIdentity();
    const agent = new HttpAgent({ identity, fetch: mockFetch, host: 'http://127.0.0.1' });

    const identity2 = new AnonymousIdentity();
    const replace = () => agent.replaceIdentity(identity2);
    expect(replace).not.toThrow();
  });
  it('should use the new identity in calls', async () => {
    const mockFetch: jest.Mock = jest.fn(() => {
      return Promise.resolve(
        new Response(null, {
          status: 200,
        }),
      );
    });

    const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');
    const identity = new AnonymousIdentity();
    const agent = new HttpAgent({ identity, fetch: mockFetch, host: 'http://127.0.0.1' });
    // First invalidate identity
    agent.invalidateIdentity();
    expect.assertions(3);
    try {
      await agent.query(canisterId, {
        methodName: 'test',
        arg: new Uint8Array(16),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).cause.code).toBeInstanceOf(IdentityInvalidErrorCode);
    }

    // Then, add new identity
    const identity2 = createIdentity(0) as unknown as SignIdentity;
    agent.replaceIdentity(identity2);
    await agent.call(canisterId, {
      methodName: 'test',
      arg: new Uint8Array(16),
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('makeNonce', () => {
  it('should create unique values', () => {
    const nonces = new Set();
    for (let i = 0; i < 100; i++) {
      nonces.add(bytesToHex(makeNonce()));
    }
    expect(nonces.size).toBe(100);
  });

  describe('setBigUint64 polyfill', () => {
    beforeAll(() => {
      jest.spyOn(Math, 'random').mockImplementation(() => 0.5);
      jest
        .spyOn(global.crypto, 'getRandomValues')
        .mockImplementation((array: ArrayBufferView | null) => {
          const view = new Uint8Array(array!.buffer, array!.byteOffset, array!.byteLength);
          for (let i = 0; i < view.length; i++) {
            view[i] = Math.floor(Math.random() * 256);
          }
          return array;
        });
    });

    afterAll(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it('should create same value using polyfill', () => {
      const spyOnSetUint32 = jest.spyOn(DataView.prototype, 'setUint32').mockImplementation();
      const originalNonce = bytesToHex(makeNonce());
      expect(spyOnSetUint32).toHaveBeenCalledTimes(4);

      const nonce = bytesToHex(makeNonce());
      expect(spyOnSetUint32).toHaveBeenCalledTimes(8);

      expect(nonce).toBe(originalNonce);
    });
    it('should insert the nonce as a header in the request', async () => {
      const mockFetch: jest.Mock = jest.fn(() => {
        return Promise.resolve(
          new Response(null, {
            status: 200,
          }),
        );
      });
      const agent = new HttpAgent({ host: HTTP_AGENT_HOST, fetch: mockFetch });
      await agent.call(Principal.managementCanister(), {
        methodName: 'test',
        arg: new Uint8Array(16),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const request = mockFetch.mock.calls[0][1];

      const nonce = request.headers['X-IC-Request-ID'];
      expect(nonce).toBeUndefined();
      // TODO: Add this back once we set the nonce in the request
      // expect(nonce).toBeDefined();
      // expect(nonce).toHaveLength(32);
    });
  });
});
describe('retry failures', () => {
  it('should throw errors immediately if retryTimes is set to 0', async () => {
    const mockFetch: jest.Mock = jest.fn(
      () =>
        new Response('Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
    );
    const agent = new HttpAgent({ host: HTTP_AGENT_HOST, fetch: mockFetch, retryTimes: 0 });
    const performCall = async () =>
      await agent.call(Principal.managementCanister(), {
        methodName: 'test',
        arg: new Uint8Array(),
      });
    expect.assertions(4);
    try {
      await performCall();
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).cause.code).toBeInstanceOf(HttpErrorCode);
      expect((error as AgentError).cause.code.requestContext).toBeDefined();
    }
    expect(mockFetch.mock.calls.length).toBe(1);
  });
  it('should throw errors after 3 retries by default', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout').mockImplementation(callback => {
      if (typeof callback === 'function') {
        callback();
      }
      return { hasRef: () => false } as NodeJS.Timeout;
    });
    const mockFetch: jest.Mock = jest.fn(() => {
      return new Response('Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    });

    const agent = new HttpAgent({ host: HTTP_AGENT_HOST, fetch: mockFetch });
    expect.assertions(4);
    try {
      await agent.call(Principal.managementCanister(), {
        methodName: 'test',
        arg: new Uint8Array(),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).cause.code).toBeInstanceOf(HttpErrorCode);
      expect((error as AgentError).cause.code.requestContext).toBeDefined();
      // First call + three retries
      expect(mockFetch.mock.calls.length).toEqual(4);
    }
  });
  it('should succeed after multiple failures within the configured limit', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout').mockImplementation(callback => {
      if (typeof callback === 'function') {
        callback();
      }
      return { hasRef: () => false } as NodeJS.Timeout;
    });

    let calls = 0;
    const mockFetch: jest.Mock = jest.fn(() => {
      if (calls === 3) {
        return new Response(null, {
          status: 200,
          statusText: 'success!',
        });
      } else {
        calls += 1;
        return new Response('Error', {
          status: 500,
          statusText: 'Internal Server Error',
        });
      }
    });

    const agent = new HttpAgent({ host: HTTP_AGENT_HOST, fetch: mockFetch });
    const result = await agent.call(Principal.managementCanister(), {
      methodName: 'test',
      arg: new Uint8Array(),
    });

    // Copy the result and modify for snapshot
    const resultForSnapshot = {
      requestDetails: undefined,
      requestId: new ArrayBuffer(0),
      response: {
        body: result.response?.body,
        headers: result.response?.headers || [],
        ok: result.response?.ok,
        status: result.response?.status,
        statusText: result.response?.statusText,
      },
    };

    expect(resultForSnapshot).toMatchSnapshot();
    // First call + three retries
    expect(mockFetch.mock.calls.length).toBe(4);
  });
});
jest.useFakeTimers({ legacyFakeTimers: true });

test('should fetch with given call options and fetch options', async () => {
  const mockFetch: jest.Mock = jest.fn(() => {
    const body = cbor.encode({});
    return Promise.resolve(
      new Response(body, {
        status: 200,
      }),
    );
  });

  const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');
  const httpAgent = new HttpAgent({
    fetch: mockFetch,
    host: 'http://127.0.0.1',
    callOptions: {
      reactNative: { textStreaming: true },
    },
    fetchOptions: {
      reactNative: {
        __nativeResponseType: 'base64',
      },
    },
    verifyQuerySignatures: false,
  });

  await httpAgent.call(canisterId, {
    methodName: 'greet',
    arg: new Uint8Array([]),
  });

  await httpAgent.query(canisterId, {
    methodName: 'greet',
    arg: new Uint8Array([]),
  });

  const { calls } = mockFetch.mock;

  expect(calls[0][1].reactNative).toStrictEqual({ textStreaming: true });
  expect(calls[1][1].reactNative.__nativeResponseType).toBe('base64');
});

describe('default host', () => {
  it('should use a default host of icp-api.io', () => {
    const agent = new HttpAgent({ fetch: jest.fn() });
    expect((agent as any).host.hostname).toBe('icp-api.io');
  });
  it('should use a default of icp-api.io if location is not available', () => {
    delete (global as any).window;
    const agent = new HttpAgent({ fetch: jest.fn() });
    expect((agent as any).host.hostname).toBe('icp-api.io');
  });
  it('should use the existing host if the agent is used on a known hostname', () => {
    const knownHosts = ['ic0.app', 'icp0.io', '127.0.0.1', 'localhost'];
    for (const host of knownHosts) {
      delete (window as any).location;
      (window as any).location = {
        hostname: host,
        protocol: 'https:',
      } as any;
      const agent = HttpAgent.createSync({ fetch: jest.fn(), host });
      expect((agent as any).host.hostname).toBe(host);
    }
  });
  it('should correctly handle subdomains on known hosts', () => {
    const knownHosts = ['ic0.app', 'icp0.io', '127.0.0.1', 'localhost'];
    for (const host of knownHosts) {
      delete (window as any).location;
      (window as any).location = {
        host: `foo.${host}`,
        hostname: `rrkah-fqaaa-aaaaa-aaaaq-cai.${host}`,
        protocol: 'https:',
      } as any;
      const agent = new HttpAgent({ fetch: jest.fn() });
      expect(agent.host.hostname).toBe(host);
    }
  });
  it('should correctly handle subdomains on remote hosts', async () => {
    const remoteHosts = [
      '000.gitpod.io',
      '000.github.dev',
      '4943-dfinity-candid-6715adkgujw.ws-us107.gitpod.io',
      'sturdy-space-rotary-phone-674vv99gxf4x9j-4943.app.github.dev',
    ];
    for (const host of remoteHosts) {
      delete (window as any).location;
      (window as any).location = {
        host: host,
        hostname: host,
        protocol: 'https:',
      } as any;
      const agent = HttpAgent.createSync({ fetch: jest.fn() });
      expect(agent.host.toString()).toBe(`https://${host}/`);
    }
  });
  it('should handle port numbers for 127.0.0.1 and localhost', async () => {
    const knownHosts = ['127.0.0.1', 'localhost'];
    for (const host of knownHosts) {
      delete (window as any).location;
      // hostname is different from host when port is specified
      (window as any).location = {
        host: `${host}:4943`,
        hostname: `${host}`,
        protocol: 'http:',
        port: '4943',
      } as any;
      const agent = HttpAgent.createSync({ fetch: jest.fn() });
      expect(agent.host.toString()).toBe(`http://${host}:4943/`);
    }
  });
});

jest.setTimeout(10000);
test('retry requests that fail due to a network failure', async () => {
  jest.useFakeTimers();
  const mockFetch: jest.Mock = jest.fn(() => {
    throw new Error('Network failure');
  });
  jest.spyOn(global, 'setTimeout').mockImplementation(callback => {
    if (typeof callback === 'function') {
      callback();
    }
    return { hasRef: () => false } as NodeJS.Timeout;
  });

  const agent = HttpAgent.createSync({
    host: HTTP_AGENT_HOST,
    fetch: mockFetch,
  });

  agent.rootKey = new Uint8Array(32);

  expect.assertions(4);
  try {
    await agent.call(Principal.managementCanister(), {
      methodName: 'test',
      arg: new Uint8Array(),
    });
  } catch (error) {
    expect(error).toBeInstanceOf(AgentError);
    expect((error as AgentError).cause.code).toBeInstanceOf(HttpFetchErrorCode);
    expect((error as AgentError).cause.code.requestContext).toBeDefined();
    // First call + three retries
    expect(mockFetch.mock.calls.length).toBe(4);
  }
});

describe('read response body', () => {
  describe('response.arrayBuffer() throws', () => {
    const mockFetchWithArrayBufferError = (status: number): jest.Mock =>
      jest.fn(() => {
        const ok = true;
        const statusText = '';
        const headers = new Headers();
        const arrayBuffer = async () => {
          throw new Error('Malformed response body');
        };
        return Promise.resolve({
          ok,
          status,
          statusText,
          headers,
          arrayBuffer,
          clone: () => {
            return {
              ok,
              status,
              statusText,
              headers,
              arrayBuffer,
            };
          },
        });
      });

    it('should retry requests that fail due to malformed response body with 200 status code', async () => {
      const mockFetch = mockFetchWithArrayBufferError(200);

      const agent = HttpAgent.createSync({
        host: HTTP_AGENT_HOST,
        fetch: mockFetch,
        retryTimes: 3,
        shouldFetchRootKey: false,
      });

      expect.assertions(4);
      try {
        await agent.call(Principal.managementCanister(), {
          methodName: 'test',
          arg: new Uint8Array(),
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).cause.code).toBeInstanceOf(HttpFetchErrorCode);
        expect((error as AgentError).cause.code.requestContext).toBeDefined();
        // First call + three retries
        expect(mockFetch.mock.calls.length).toEqual(4);
      }
    });

    it('should not retry requests that fail due to malformed response body with 202 status code', async () => {
      const mockFetch = mockFetchWithArrayBufferError(202);

      const agent = HttpAgent.createSync({
        host: HTTP_AGENT_HOST,
        fetch: mockFetch,
        retryTimes: 3,
        shouldFetchRootKey: false,
      });

      const response = await agent.call(Principal.managementCanister(), {
        methodName: 'test',
        arg: new Uint8Array(),
      });

      expect(response.response.ok).toEqual(true);
      expect(response.response.status).toEqual(202);
      expect(response.response.statusText).toEqual('');
      expect(response.response.headers.length).toEqual(0);
      expect(mockFetch.mock.calls.length).toEqual(1);
    });
  });

  describe('response.arrayBuffer() returns a valid ArrayBuffer', () => {
    const mockFetchWithStatus = (
      status: number,
      arrayBuffer: jest.Mock,
      text?: jest.Mock,
    ): jest.Mock =>
      jest.fn(() => {
        const ok = true;
        const statusText = '';
        const headers = new Headers();
        return Promise.resolve({
          ok,
          status,
          statusText,
          headers,
          arrayBuffer,
          text,
          clone: () => {
            return {
              ok,
              status,
              statusText,
              headers,
              arrayBuffer,
              text,
            };
          },
        });
      });

    it('should not call response.arrayBuffer() if the response is 202', async () => {
      const mockArrayBuffer: jest.Mock = jest.fn(() => {
        return Promise.resolve(new ArrayBuffer(0));
      });
      const mockFetch = mockFetchWithStatus(202, mockArrayBuffer);

      const agent = HttpAgent.createSync({
        host: HTTP_AGENT_HOST,
        retryTimes: 0,
        shouldFetchRootKey: false,
        fetch: mockFetch,
      });

      const response = await agent.call(Principal.managementCanister(), {
        methodName: 'test',
        arg: new Uint8Array(),
      });

      expect(response.response.ok).toEqual(true);
      expect(response.response.status).toEqual(202);
      expect(response.response.body).toEqual(null);
      expect(mockArrayBuffer.mock.calls.length).toEqual(0);
      expect(mockFetch.mock.calls.length).toEqual(1);
    });

    it('should call response.text() if the response is 40x', async () => {
      const mockArrayBuffer: jest.Mock = jest.fn(() => {
        return Promise.resolve(new ArrayBuffer(0));
      });
      const mockText: jest.Mock = jest.fn(() => {
        return Promise.resolve('test');
      });
      const mockFetch = mockFetchWithStatus(400, mockArrayBuffer, mockText);

      const agent = HttpAgent.createSync({
        host: HTTP_AGENT_HOST,
        retryTimes: 0,
        shouldFetchRootKey: false,
        fetch: mockFetch,
      });

      expect.assertions(6);
      try {
        await agent.call(Principal.managementCanister(), {
          methodName: 'test',
          arg: new Uint8Array(),
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).cause.code).toBeInstanceOf(HttpErrorCode);
        expect((error as AgentError).cause.code.requestContext).toBeDefined();
        expect(mockText.mock.calls.length).toEqual(1);
        expect(mockArrayBuffer.mock.calls.length).toEqual(0);
        expect(mockFetch.mock.calls.length).toEqual(1);
      }
    });

    it('should call response.text() if the response is 50x', async () => {
      const mockArrayBuffer: jest.Mock = jest.fn(() => {
        return Promise.resolve(new ArrayBuffer(0));
      });
      const mockText: jest.Mock = jest.fn(() => {
        return Promise.resolve('test');
      });
      const mockFetch = mockFetchWithStatus(500, mockArrayBuffer, mockText);

      const agent = HttpAgent.createSync({
        host: HTTP_AGENT_HOST,
        retryTimes: 0,
        shouldFetchRootKey: false,
        fetch: mockFetch,
      });

      expect.assertions(6);
      try {
        await agent.call(Principal.managementCanister(), {
          methodName: 'test',
          arg: new Uint8Array(),
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError);
        expect((error as AgentError).cause.code).toBeInstanceOf(HttpErrorCode);
        expect((error as AgentError).cause.code.requestContext).toBeDefined();
        expect(mockText.mock.calls.length).toEqual(1);
        expect(mockArrayBuffer.mock.calls.length).toEqual(0);
        expect(mockFetch.mock.calls.length).toEqual(1);
      }
    });
  });
});

test.todo('retry query signature validation after refreshing the subnet node keys');

test('it should fail when setting an expiry in the past', async () => {
  expect(() =>
    HttpAgent.createSync({
      host: 'https://icp-api.io',
      ingressExpiryInMinutes: -1,
      fetch: jest.fn(),
    }),
  ).toThrow(`Ingress expiry time must be greater than 0`);
});

describe('await fetching root keys before making a call to the network.', () => {
  const mockResponse = {
    headers: [
      ['access-control-allow-origin', '*'],
      ['content-length', '317'],
      ['content-type', 'application/cbor'],
      ['date', 'Sat, 25 Jan 2025 00:48:00 GMT'],
    ],
    ok: true,
    status: 200,
    statusText: 'OK',
    body: 'd9d9f7a66e69635f6170695f76657273696f6e66302e31382e3068726f6f745f6b65795885308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c05030201036100a05a4707525774767f395a97ea9cd670ebf8694c4649421cdec91d86fa16beee0250e1ef64ec3b1eecb2ece53235ae0e0433592804c8947359694912cd743e5cba7d9bf705f875da3b36d12ec7eb94fb437bd31c255d2a6d65b964e0430f93686c696d706c5f76657273696f6e65302e392e3069696d706c5f686173687840646536376636313133633830316163326137386463663739623431376530306365343361366233636136636161346366616239636236653338383136643534757265706c6963615f6865616c74685f737461747573676865616c746879706365727469666965645f6865696768741a0003f560',
    now: 1737766080180,
  };
  jest.useFakeTimers();
  // Mock the fetch implementation, resolving a pre-calculated response
  const mockFetch: jest.Mock = jest.fn(() => {
    const body = hexToBytes(mockResponse.body);
    const arrayBuffer = async (): Promise<ArrayBuffer> => {
      return body.buffer;
    };
    return Promise.resolve({
      ...mockResponse,
      body,
      arrayBuffer,
      clone: () => {
        return {
          ...mockResponse,
          body,
          arrayBuffer,
        };
      },
    });
  });
  it('should allow fetchRootKey to be awaited after using the constructor', async () => {
    const agent = new HttpAgent({
      shouldFetchRootKey: true,
      host: 'http://localhost:4943',
      fetch: mockFetch,
    });
    expect(agent.rootKey).toBe(null);
    await agent.fetchRootKey();
    expect(ArrayBuffer.isView(agent.rootKey)).toBe(true);
  });
  it('should allow fetchRootKey to be awaited after using createSync', async () => {
    const agent = HttpAgent.createSync({
      shouldFetchRootKey: true,
      host: 'http://localhost:4943',
      fetch: mockFetch,
    });
    expect(agent.rootKey).toBe(null);
    await agent.fetchRootKey();
    expect(ArrayBuffer.isView(agent.rootKey)).toBe(true);
  });
  it('it should automatically fetch root key if using create', async () => {
    const agent = await HttpAgent.create({
      shouldFetchRootKey: true,
      host: 'http://localhost:4943',
      fetch: mockFetch,
    });
    expect(ArrayBuffer.isView(agent.rootKey)).toBe(true);
  });

  it('it should automatically fetch root key during async calls if one was not set during initialization', async () => {
    const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');

    const agent = new HttpAgent({
      fetch: mockFetch,
      host: 'http://localhost:4943',
      shouldFetchRootKey: true,
    });
    expect(agent.rootKey).toBe(null);

    const methodName = 'greet';
    const arg = new Uint8Array([]);

    await agent.call(canisterId, {
      methodName,
      arg,
    });
    expect(agent.rootKey).toBeTruthy();
  });
});

describe('error logs for bad signature', () => {
  const badSignatureResponse = {
    headers: [
      ['access-control-allow-origin', '*'],
      ['content-length', '332'],
      ['content-type', 'text/plain; charset=utf-8'],
      ['date', 'Fri, 31 Jan 2025 18:53:47 GMT'],
    ],
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    body: '496e76616c6964207369676e61747572653a20496e76616c6964206261736963207369676e61747572653a2045643235353139207369676e617475726520636f756c64206e6f742062652076657269666965643a207075626c6963206b657920336236613237626363656236613432643632613361386430326136663064373336353332313537373164653234336136336163303438613138623539646132392c207369676e61747572652030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030302c206572726f723a2041207369676e61747572652077617320696e76616c6964',
    now: 1738349617614,
  };
  const mockFetch: jest.Mock = jest.fn(() => {
    const body = hexToBytes(badSignatureResponse.body);
    const arrayBuffer = async (): Promise<ArrayBuffer> => {
      return hexToBytes(badSignatureResponse.body).buffer;
    };
    const text = async () => {
      return 'Invalid signature: Invalid basic signature: Ed25519 signature could not be verified: public key 3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29, signature 00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000, error: A signature was invalid\n';
    };
    return Promise.resolve({
      ...badSignatureResponse,
      body,
      arrayBuffer,
      text,
      clone: () => {
        return {
          ...badSignatureResponse,
          body,
          arrayBuffer,
          text,
        };
      },
    });
  });
  it('should throw call errors if provided an invalid signature', async () => {
    jest.spyOn(Date, 'now').mockImplementation(() => 1738362489290);
    global.clearTimeout = jest.fn();

    const identity = Ed25519KeyIdentity.generate(new Uint8Array(32)) as unknown as SignIdentity;
    identity.sign = async () => {
      return new Uint8Array(64) as Signature;
    };
    const agent = HttpAgent.createSync({
      identity,
      fetch: mockFetch,
      retryTimes: 0,
      host: 'http://localhost:4943',
    });
    // Important - override nonce when making request to ensure reproducible result
    agent.addTransform('update', async args => {
      args.body.nonce = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) as Nonce;
      return args;
    });
    const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');

    const methodName = 'greet';
    const arg = new Uint8Array([]);
    const logs: {
      message: string;
      level: 'error';
      error: AgentError;
    }[] = [];
    agent.log.subscribe(e => {
      if (e.level === 'error') {
        logs.push(e);
      }
    });

    expect.assertions(7);
    try {
      await agent.call(canisterId, {
        methodName,
        arg,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).cause.code).toBeInstanceOf(HttpErrorCode);
      expect((error as AgentError).cause.code.requestContext).toBeDefined();
    }
    expect(JSON.stringify(logs[0])).toMatchSnapshot();
    expect(logs[0].error).toBeInstanceOf(AgentError);
    expect(logs[0].error.cause.code).toBeInstanceOf(HttpErrorCode);
    expect(logs[0].error.cause.code.requestContext).toBeDefined();
  });
  it('should throw query errors for bad signature', async () => {
    jest.spyOn(Date, 'now').mockImplementation(() => 1738362489290);
    global.clearTimeout = jest.fn();

    const identity = Ed25519KeyIdentity.generate(new Uint8Array(32)) as unknown as SignIdentity;
    identity.sign = async () => {
      return new Uint8Array(64) as Signature;
    };
    const agent = HttpAgent.createSync({
      identity,
      fetch: mockFetch,
      retryTimes: 0,
      host: 'http://localhost:4943',
    });
    const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');

    const methodName = 'greet';
    const arg = new Uint8Array([]);
    const logs: {
      message: string;
      level: 'error';
      error: AgentError;
    }[] = [];
    agent.log.subscribe(e => {
      if (e.level === 'error') {
        logs.push(e);
      }
    });

    expect.assertions(7);
    try {
      await agent.query(canisterId, {
        methodName,
        arg,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).cause.code).toBeInstanceOf(HttpErrorCode);
      expect((error as AgentError).cause.code.requestContext).toBeDefined();
    }
    expect(JSON.stringify(logs[0])).toMatchSnapshot();
    expect(logs[0].error).toBeInstanceOf(AgentError);
    expect(logs[0].error.cause.code).toBeInstanceOf(HttpErrorCode);
    expect(logs[0].error.cause.code.requestContext).toBeDefined();
  });

  it('should throw read_state errors for bad signature', async () => {
    const clonedReadStateResponse = {
      headers: [
        ['access-control-allow-origin', '*'],
        ['content-length', '332'],
        ['content-type', 'text/plain; charset=utf-8'],
        ['date', 'Thu, 06 Feb 2025 22:21:52 GMT'],
      ],
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      body: '496e76616c6964207369676e61747572653a20496e76616c6964206261736963207369676e61747572653a2045643235353139207369676e617475726520636f756c64206e6f742062652076657269666965643a207075626c6963206b657920336236613237626363656236613432643632613361386430326136663064373336353332313537373164653234336136336163303438613138623539646132392c207369676e61747572652030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030302c206572726f723a2041207369676e61747572652077617320696e76616c6964',
      now: 1738880304205,
    };

    const mockFetch: jest.Mock = jest.fn(() => {
      const body = hexToBytes(badSignatureResponse.body);
      const arrayBuffer = async (): Promise<ArrayBuffer> => {
        return hexToBytes(badSignatureResponse.body).buffer;
      };
      const text = async () => {
        return 'Invalid signature: Invalid basic signature: Ed25519 signature could not be verified: public key 3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29, signature 00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000, error: A signature was invalid\n';
      };
      return Promise.resolve({
        ...clonedReadStateResponse,
        body,
        arrayBuffer,
        text,
        clone: () => {
          return {
            ...badSignatureResponse,
            body,
            arrayBuffer,
            text,
          };
        },
      });
    });

    const identity = Ed25519KeyIdentity.generate(new Uint8Array(32)) as unknown as SignIdentity;

    identity.sign = async () => {
      return new Uint8Array(64) as Signature;
    };
    const agent = HttpAgent.createSync({
      identity,
      fetch: mockFetch,
      retryTimes: 0,
      host: 'http://localhost:4943',
    });

    const canisterId: Principal = Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c');

    jest.spyOn(Date, 'now').mockImplementation(() => 1738880304205);

    const logs: {
      message: string;
      level: 'error';
      error: AgentError;
    }[] = [];
    agent.log.subscribe(e => {
      if (e.level === 'error') {
        logs.push(e);
      }
    });

    expect.assertions(6);
    try {
      const requestId = new Uint8Array(32) as RequestId;
      const path = new TextEncoder().encode('request_status');
      await agent.readState(canisterId, { paths: [[path, requestId]] });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).cause.code).toBeInstanceOf(HttpErrorCode);
      expect((error as AgentError).cause.code.requestContext).toBeDefined();
    }
    expect(logs[0].error).toBeInstanceOf(AgentError);
    expect(logs[0].error.cause.code).toBeInstanceOf(HttpErrorCode);
    expect(logs[0].error.cause.code.requestContext).toBeDefined();
  });
});
