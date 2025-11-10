import { lebEncode } from '@dfinity/candid';
import {
  Endpoint,
  type HttpAgentRequest,
  type HttpAgentRequestTransformFn,
  type HttpHeaderField,
  makeNonce,
  type Nonce,
} from './types.ts';
import { ExpiryJsonDeserializeErrorCode, InputError } from '../../errors.ts';

export const JSON_KEY_EXPIRY = '__expiry__';
const SECONDS_TO_MILLISECONDS = BigInt(1_000);
const MILLISECONDS_TO_NANOSECONDS = BigInt(1_000_000);
const MINUTES_TO_SECONDS = BigInt(60);
const MINUTES_TO_MILLISECONDS = MINUTES_TO_SECONDS * SECONDS_TO_MILLISECONDS;

const EXPIRY_DELTA_THRESHOLD_MILLISECONDS = BigInt(1) * MINUTES_TO_MILLISECONDS;

function roundToSecond(millis: bigint): bigint {
  return (millis / SECONDS_TO_MILLISECONDS) * SECONDS_TO_MILLISECONDS;
}

function roundToMinute(millis: bigint): bigint {
  return (millis / MINUTES_TO_MILLISECONDS) * MINUTES_TO_MILLISECONDS;
}

export type JsonnableExpiry = {
  [JSON_KEY_EXPIRY]: string;
};

export class Expiry {
  public readonly _isExpiry = true;

  private constructor(private readonly __expiry__: bigint) {}

  /**
   * Creates an Expiry object from a delta in milliseconds.
   * The expiry is calculated as: current_time + delta + clock_drift
   * The resulting expiry is then rounded:
   * - If rounding down to the nearest minute still provides at least 60 seconds in the future, use minute precision
   * - Otherwise, use second precision
   * @param deltaInMs The milliseconds to add to the current time.
   * @param clockDriftInMs The milliseconds to add to the current time, typically the clock drift between IC network clock and the client's clock. Defaults to `0` if not provided.
   * @returns {Expiry} The constructed Expiry object.
   */
  public static fromDeltaInMilliseconds(deltaInMs: number, clockDriftInMs: number = 0): Expiry {
    const correctedNowMs = BigInt(Date.now()) + BigInt(clockDriftInMs);
    const expiryMs = correctedNowMs + BigInt(deltaInMs);

    const roundedToMinute = roundToMinute(expiryMs);

    let roundedExpiryMs: bigint;
    if (roundedToMinute >= correctedNowMs + EXPIRY_DELTA_THRESHOLD_MILLISECONDS) {
      roundedExpiryMs = roundedToMinute;
    } else {
      const roundedToSecond = roundToSecond(expiryMs);
      roundedExpiryMs = roundedToSecond;
    }

    return new Expiry(roundedExpiryMs * MILLISECONDS_TO_NANOSECONDS);
  }

  public toBigInt(): bigint {
    return this.__expiry__;
  }

  public toHash(): Uint8Array {
    return lebEncode(this.__expiry__);
  }

  public toString(): string {
    return this.__expiry__.toString();
  }

  /**
   * Serializes to JSON
   * @returns {JsonnableExpiry} a JSON object with a single key, {@link JSON_KEY_EXPIRY}, whose value is the expiry as a string
   */
  public toJSON(): JsonnableExpiry {
    return { [JSON_KEY_EXPIRY]: this.toString() };
  }

  /**
   * Deserializes a {@link JsonnableExpiry} object from a JSON string.
   * @param input The JSON string to deserialize.
   * @returns {Expiry} The deserialized Expiry object.
   */
  public static fromJSON(input: string): Expiry {
    const obj = JSON.parse(input);
    if (obj[JSON_KEY_EXPIRY]) {
      try {
        const expiry = BigInt(obj[JSON_KEY_EXPIRY]);
        return new Expiry(expiry);
      } catch (error) {
        throw new InputError(new ExpiryJsonDeserializeErrorCode(`Not a valid BigInt: ${error}`));
      }
    }
    throw new InputError(
      new ExpiryJsonDeserializeErrorCode(`The input does not contain the key ${JSON_KEY_EXPIRY}`),
    );
  }

  public static isExpiry(other: unknown): other is Expiry {
    return (
      other instanceof Expiry ||
      (typeof other === 'object' &&
        other !== null &&
        '_isExpiry' in other &&
        (other as { _isExpiry: boolean })['_isExpiry'] === true &&
        '__expiry__' in other &&
        typeof (other as { __expiry__: bigint })['__expiry__'] === 'bigint')
    );
  }
}

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
