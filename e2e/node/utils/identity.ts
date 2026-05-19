import { BLS12_381_G2_OID, wrapDER } from '@icp-sdk/core/agent';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { randomBytes } from 'crypto';
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';

/**
 * Generates a random identity using Ed25519KeyIdentity.
 * @returns {Ed25519KeyIdentity} A new random identity.
 */
export function randomIdentity(): Ed25519KeyIdentity {
  return Ed25519KeyIdentity.generate(randomBytes(32));
}

export interface KeyPair {
  publicKey: Uint8Array;
  publicKeyDer: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Generates a random BLS key pair.
 * @returns {KeyPair} A new random key pair.
 */
export function randomKeyPair(): KeyPair {
  const privateKey = bls.utils.randomSecretKey();
  const publicKey = bls.shortSignatures.getPublicKey(privateKey).toBytes(true);
  const publicKeyDer = wrapDER(publicKey, BLS12_381_G2_OID);

  return { publicKey, privateKey, publicKeyDer };
}

/**
 * Signs a message using the provided BLS private key.
 * @param {Uint8Array} message - The message to sign.
 * @param {Uint8Array} privateKey - The BLS private key to sign the message with.
 * @returns {Uint8Array} The signature of the message.
 */
export function signBls(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return bls.shortSignatures.sign(bls.shortSignatures.hash(message), privateKey).toBytes(true);
}
