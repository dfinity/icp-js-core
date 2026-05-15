import { bls12_381 } from '@noble/curves/bls12-381.js';
import { hexToBytes } from '@noble/hashes/utils.js';

export let verify: (pk: Uint8Array, sig: Uint8Array, msg: Uint8Array) => boolean;

/**
 *
 * @param pk primary key: Uint8Array
 * @param sig signature: Uint8Array
 * @param msg message: Uint8Array
 * @returns boolean
 */
export function blsVerify(pk: Uint8Array, sig: Uint8Array, msg: Uint8Array): boolean {
  const primaryKey = typeof pk === 'string' ? hexToBytes(pk) : pk;
  const signature = typeof sig === 'string' ? hexToBytes(sig) : sig;
  const message = typeof msg === 'string' ? hexToBytes(msg) : msg;
  const blss = bls12_381.shortSignatures;
  return blss.verify(signature, blss.hash(message), primaryKey);
}
