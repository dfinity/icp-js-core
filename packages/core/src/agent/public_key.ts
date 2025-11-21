import { type DerEncodedPublicKey, type PublicKey } from './auth.ts';
import { ED25519_OID, unwrapDER, wrapDER } from './der.ts';
import { DerDecodeErrorCode, InputError } from './errors.ts';

export class Ed25519PublicKey implements PublicKey {
  public static from(key: PublicKey): Ed25519PublicKey {
    return this.fromDer(key.toDer());
  }

  public static fromRaw(rawKey: Uint8Array): Ed25519PublicKey {
    return new Ed25519PublicKey(rawKey);
  }

  public static fromDer(derKey: DerEncodedPublicKey): Ed25519PublicKey {
    return new Ed25519PublicKey(this.derDecode(derKey));
  }

  // The length of Ed25519 public keys is always 32 bytes.
  private static RAW_KEY_LENGTH = 32;

  private static derEncode(publicKey: Uint8Array): DerEncodedPublicKey {
    return wrapDER(publicKey, ED25519_OID) as DerEncodedPublicKey;
  }

  private static derDecode(key: DerEncodedPublicKey): Uint8Array {
    const unwrapped = unwrapDER(key, ED25519_OID);
    if (unwrapped.length !== this.RAW_KEY_LENGTH) {
      throw InputError.fromCode(
        new DerDecodeErrorCode('An Ed25519 public key must be exactly 32 bytes long'),
      );
    }
    return unwrapped;
  }

  #rawKey: Uint8Array;

  public get rawKey(): Uint8Array {
    return this.#rawKey;
  }

  #derKey: DerEncodedPublicKey;

  public get derKey(): DerEncodedPublicKey {
    return this.#derKey;
  }

  // `fromRaw` and `fromDer` should be used for instantiation, not this constructor.
  private constructor(key: Uint8Array) {
    if (key.byteLength !== Ed25519PublicKey.RAW_KEY_LENGTH) {
      throw InputError.fromCode(
        new DerDecodeErrorCode('An Ed25519 public key must be exactly 32 bytes long'),
      );
    }
    this.#rawKey = key;
    this.#derKey = Ed25519PublicKey.derEncode(key);
  }

  public toDer(): DerEncodedPublicKey {
    return this.derKey;
  }

  public toRaw(): Uint8Array {
    return this.rawKey;
  }
}
