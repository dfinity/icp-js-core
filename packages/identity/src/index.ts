/**
 * @module api
 */

export * from './identity/ed25519.ts';
export * from './identity/ecdsa.ts';
export * from './identity/delegation.ts';
export * from './identity/partial.ts';
export { WebAuthnIdentity } from './identity/webauthn.ts';
export { wrapDER, unwrapDER, DER_COSE_OID, ED25519_OID } from '@dfinity/agent';

/**
 * @deprecated due to size of dependencies. Use `@dfinity/identity-secp256k1` instead.
 */
export class Secp256k1KeyIdentity {
  constructor() {
    throw new Error(
      'Secp256k1KeyIdentity has been moved to a new repo: @dfinity/identity-secp256k1',
    );
  }
}
