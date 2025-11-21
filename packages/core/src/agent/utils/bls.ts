import { bls12_381 } from '@noble/curves/bls12-381';
import { bytesToHex } from '@noble/hashes/utils';

export let verify: (pk: Uint8Array, sig: Uint8Array, msg: Uint8Array) => boolean;

/**
 *
 * @param pk primary key: Uint8Array
 * @param sig signature: Uint8Array
 * @param msg message: Uint8Array
 * @returns boolean
 */
export function blsVerify(pk: Uint8Array, sig: Uint8Array, msg: Uint8Array): boolean {
  const primaryKey = typeof pk === 'string' ? pk : bytesToHex(pk);
  const signature = typeof sig === 'string' ? sig : bytesToHex(sig);
  const message = typeof msg === 'string' ? msg : bytesToHex(msg);
  return bls12_381.verifyShortSignature(signature, message, primaryKey);
}
