import { lebEncode, compare } from '#candid';
import { Principal } from '#principal';
import { HashValueErrorCode, InputError } from './errors.ts';
import { uint8FromBufLike } from './utils/buffer.ts';
import { concatBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha2';

export type RequestId = Uint8Array & { __requestId__: void };

interface ToHashable {
  toHash(): unknown;
}

/**
 *
 * @param value unknown value
 * @returns Uint8Array
 */
export function hashValue(value: unknown): Uint8Array {
  if (typeof value === 'string') {
    return hashString(value);
  } else if (typeof value === 'number') {
    return sha256(lebEncode(value));
  } else if (value instanceof Uint8Array || ArrayBuffer.isView(value)) {
    return sha256(uint8FromBufLike(value));
  } else if (Array.isArray(value)) {
    const vals = value.map(hashValue);
    return sha256(concatBytes(...vals));
  } else if (value && typeof value === 'object' && (value as Principal)._isPrincipal) {
    return sha256((value as Principal).toUint8Array());
  } else if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ToHashable).toHash === 'function'
  ) {
    return hashValue((value as ToHashable).toHash());
    // TODO This should be move to a specific async method as the webauthn flow required
    // the flow to be synchronous to ensure Safari touch id works.
    // } else if (value instanceof Promise) {
    //   return value.then(x => hashValue(x));
  } else if (typeof value === 'object') {
    return hashOfMap(value as Record<string, unknown>);
  } else if (typeof value === 'bigint') {
    // Do this check much later than the other bigint check because this one is much less
    // type-safe.
    // So we want to try all the high-assurance type guards before this 'probable' one.
    return sha256(lebEncode(value));
  }
  throw InputError.fromCode(new HashValueErrorCode(value));
}

const hashString = (value: string): Uint8Array => {
  const encoded = new TextEncoder().encode(value);
  return sha256(encoded);
};

/**
 * Get the RequestId of the provided ic-ref request.
 * RequestId is the result of the representation-independent-hash function.
 * https://sdk.dfinity.org/docs/interface-spec/index.html#hash-of-map
 * @param request - ic-ref request to hash into RequestId
 */
export function requestIdOf(request: Record<string, unknown>): RequestId {
  return hashOfMap(request) as RequestId;
}

/**
 * Hash a map into a Uint8Array using the representation-independent-hash function.
 * https://sdk.dfinity.org/docs/interface-spec/index.html#hash-of-map
 * @param map - Any non-nested object
 * @returns Uint8Array
 */
export function hashOfMap(map: Record<string, unknown>): Uint8Array {
  const hashed: Array<[Uint8Array, Uint8Array]> = Object.entries(map)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]: [string, unknown]) => {
      const hashedKey = hashString(key);
      const hashedValue = hashValue(value);

      return [hashedKey, hashedValue] as [Uint8Array, Uint8Array];
    });

  const traversed: Array<[Uint8Array, Uint8Array]> = hashed;

  const sorted: Array<[Uint8Array, Uint8Array]> = traversed.sort(([k1], [k2]) => {
    return compare(k1, k2);
  });

  const concatenated = concatBytes(...sorted.map(x => concatBytes(...x)));
  const result = sha256(concatenated);
  return result;
}
