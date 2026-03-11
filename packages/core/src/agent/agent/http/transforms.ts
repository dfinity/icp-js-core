import {
  Endpoint,
  type HttpAgentRequest,
  type HttpAgentRequestTransformFn,
  type HttpHeaderField,
  makeNonce,
  type Nonce,
} from './types.ts';
import { Expiry } from './expiry.ts';

export { Expiry, JSON_KEY_EXPIRY, type JsonnableExpiry } from './expiry.ts';

/**
 * Create a Nonce transform, which takes a function that returns a Buffer, and adds it
 * as the nonce to every call requests.
 * @param nonceFn A function that returns a buffer. By default uses a semi-random method.
 */
export function makeNonceTransform(nonceFn: () => Nonce = makeNonce): HttpAgentRequestTransformFn {
  return async (request: HttpAgentRequest) => {
    // Nonce needs to be inserted into the header for all requests, to enable logs to be correlated with requests.
    const headers = request.request.headers;
    // TODO: uncomment this when the http proxy supports it.
    // headers.set('X-IC-Request-ID', toHex(new Uint8Array(nonce)));
    request.request.headers = headers;

    // Nonce only needs to be inserted into the body for async calls, to prevent replay attacks.
    if (request.endpoint === Endpoint.Call) {
      request.body.nonce = nonceFn();
    }
  };
}

/**
 * Create a transform that adds a delay (by default 5 minutes) to the expiry.
 * @param delayInMilliseconds The delay to add to the call time, in milliseconds.
 */
export function makeExpiryTransform(delayInMilliseconds: number): HttpAgentRequestTransformFn {
  return async (request: HttpAgentRequest) => {
    request.body.ingress_expiry = Expiry.fromDeltaInMilliseconds(delayInMilliseconds);
  };
}

/**
 * Maps the default fetch headers field to the serializable HttpHeaderField.
 * @param headers Fetch definition of the headers type
 * @returns array of header fields
 */
export function httpHeadersTransform(headers: Headers): HttpHeaderField[] {
  const headerFields: HttpHeaderField[] = [];
  headers.forEach((value, key) => {
    headerFields.push([key, value]);
  });
  return headerFields;
}
