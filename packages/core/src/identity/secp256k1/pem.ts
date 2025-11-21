import * as asn1js from 'asn1js';

const HEADER = `-----BEGIN EC PRIVATE KEY-----`;
const FOOTER = `-----END EC PRIVATE KEY-----`;

/**
 * Parse a PEM-encoded key into a Uint8Array
 * @param pem - the PEM-encoded key
 * @returns secret key as a Uint8Array
 */
export function pemToSecretKey(pem: string): Uint8Array {
  const lines = pem.trim().split('\n');
  const header = lines[0].trim();
  const footer = lines[lines.length - 1].trim();
  if (lines.length < 3) {
    throw new Error('Invalid PEM format');
  }
  if (!header.startsWith(HEADER)) {
    throw new Error('Invalid PEM header');
  }
  if (!footer.startsWith(FOOTER)) {
    throw new Error('Invalid PEM footer');
  }
  const base64Data = lines.slice(1, -1).join('').replace(/\r?\n/g, '');
  const rawKey = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

  // Parse the key as ASN.1 object
  try {
    const asn1 = asn1js.fromBER(rawKey);
    // OID for secp256k1
    if (!asn1.result.toString().includes(`OBJECT IDENTIFIER : 1.3.132.0.10`)) {
      throw new Error('Invalid curve, must be secp256k1');
    }
    // Returns the 32-byte raw private key at the appropriate offset
    return rawKey.slice(7, 39);
  } catch (error) {
    console.error(error);
    throw new Error('Encountered error while parsing PEM key');
  }
}
