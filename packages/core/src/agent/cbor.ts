import { Principal } from '#principal';
import * as cbor from '@dfinity/cbor';
import { CborDecodeErrorCode, CborEncodeErrorCode, InputError } from './errors.ts';
import { Expiry } from './agent/index.ts';

/**
 * Used to extend classes that need to provide a custom value for the CBOR encoding process.
 */
export abstract class ToCborValue {
  /**
   * Returns a value that can be encoded with CBOR. Typically called in the replacer function of the {@link encode} function.
   */
  public abstract toCborValue(): cbor.CborValue;
}

function hasCborValueMethod(value: unknown): value is ToCborValue {
  return typeof value === 'object' && value !== null && 'toCborValue' in value;
}

/**
 * Encode a JavaScript value into CBOR. If the value is an instance of {@link ToCborValue},
 * the {@link ToCborValue.toCborValue} method will be called to get the value to encode.
 * @param value The value to encode
 */
export function encode(value: unknown): Uint8Array {
  try {
    return cbor.encodeWithSelfDescribedTag(value, value => {
      if (Principal.isPrincipal(value)) {
        return value.toUint8Array();
      }

      if (Expiry.isExpiry(value)) {
        return value.toBigInt();
      }

      if (hasCborValueMethod(value)) {
        return value.toCborValue();
      }

      return value;
    });
  } catch (error) {
    throw InputError.fromCode(new CborEncodeErrorCode(error, value));
  }
}

/**
 * Decode a CBOR encoded value into a JavaScript value.
 * @param input The CBOR encoded value
 */
export function decode<T>(input: Uint8Array): T {
  try {
    return cbor.decode(input) as T;
  } catch (error) {
    throw InputError.fromCode(new CborDecodeErrorCode(error, input));
  }
}

// Not strictly necessary, we're just keeping it for backwards compatibility.
export const Cbor = {
  encode,
  decode,
};
