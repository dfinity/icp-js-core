import type { Identity, HttpAgentRequest } from '#agent';
import type { Principal } from '#principal';

/**
 * Signed attributes to be included as `sender_info` in the request content.
 */
export interface SignedAttributes {
  data: Uint8Array;
  signature: Uint8Array;
}

/**
 * The canister that signed the attributes.
 */
export interface Signer {
  canisterId: Principal;
}

/**
 * Options for creating an {@link AttributesIdentity}.
 */
export interface AttributesIdentityOptions {
  /** The inner identity to delegate signing to. */
  inner: Identity;
  /** The signed attributes to include in the request. */
  attributes: SignedAttributes;
  /** The canister that signed the attributes. */
  signer: Signer;
}

/**
 * An Identity decorator that injects `sender_info` into the request body
 * before delegating to an inner identity for signing.
 *
 * Because `sender_info` is part of the request content, it is included in the
 * representation-independent hash (`requestIdOf`) and covered by the sender's
 * signature.
 *
 * @example
 * ```ts
 * const inner = DelegationIdentity.fromDelegation(key, chain);
 * const identity = new AttributesIdentity({
 *   inner,
 *   attributes: { data: new Uint8Array([...]), signature: new Uint8Array([...]) },
 *   signer: { canisterId: Principal.fromText('aaaaa-aa') },
 * });
 * const agent = HttpAgent.create({ identity });
 * ```
 */
export class AttributesIdentity implements Identity {
  readonly #inner: Identity;
  readonly #attributes: SignedAttributes;
  readonly #signer: Signer;

  /**
   * @param options - Configuration for the identity.
   * @param options.inner - The inner identity to delegate signing to.
   * @param options.attributes - The signed attributes to include in the request.
   * @param options.signer - The canister that signed the attributes.
   */
  constructor(options: AttributesIdentityOptions) {
    this.#inner = options.inner;
    this.#attributes = options.attributes;
    this.#signer = options.signer;
  }

  getPrincipal(): Principal {
    return this.#inner.getPrincipal();
  }

  transformRequest(request: HttpAgentRequest): Promise<unknown> {
    return this.#inner.transformRequest({
      ...request,
      body: {
        ...request.body,
        sender_info: {
          signer: this.#signer.canisterId.toUint8Array(),
          info: this.#attributes.data,
          sig: this.#attributes.signature,
        },
      },
    } as HttpAgentRequest);
  }
}
