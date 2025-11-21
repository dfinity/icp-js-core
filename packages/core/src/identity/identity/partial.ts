import { type Identity, type PublicKey } from '#agent';
import { Principal } from '#principal';

/**
 * A partial delegated identity, representing a delegation chain and the public key that it targets
 */
export class PartialIdentity implements Identity {
  #inner: PublicKey;

  /**
   * The raw public key of this identity.
   */
  get rawKey(): Uint8Array | undefined {
    return this.#inner.rawKey;
  }

  /**
   * The DER-encoded public key of this identity.
   */
  get derKey(): Uint8Array | undefined {
    return this.#inner.derKey;
  }

  /**
   * The DER-encoded public key of this identity.
   */
  public toDer(): Uint8Array {
    return this.#inner.toDer();
  }

  /**
   * The inner {@link PublicKey} used by this identity.
   */
  public getPublicKey(): PublicKey {
    return this.#inner;
  }

  /**
   * The {@link Principal} of this identity.
   */
  public getPrincipal(): Principal {
    if (!this.#inner.rawKey) {
      throw new Error('Cannot get principal from a public key without a raw key.');
    }
    return Principal.fromUint8Array(new Uint8Array(this.#inner.rawKey));
  }

  /**
   * Required for the Identity interface, but cannot implemented for just a public key.
   */
  public transformRequest(): Promise<never> {
    return Promise.reject(
      'Not implemented. You are attempting to use a partial identity to sign calls, but this identity only has access to the public key.To sign calls, use a DelegationIdentity instead.',
    );
  }

  constructor(inner: PublicKey) {
    this.#inner = inner;
  }
}
