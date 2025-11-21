import { ECDSAKeyIdentity } from './ecdsa.ts';

describe('ECDSAKeyIdentity Tests', () => {
  test('can encode and decode to/from keyPair', async () => {
    const identity = await ECDSAKeyIdentity.generate();
    const keyPair = identity.getKeyPair();
    const identity2 = await ECDSAKeyIdentity.fromKeyPair(keyPair);

    expect(identity.getPublicKey().toDer()).toStrictEqual(identity2.getPublicKey().toDer());
  });

  test('getKeyPair should return a copy of the key pair', async () => {
    const identity = await ECDSAKeyIdentity.generate();
    const keyPair = identity.getKeyPair();
    expect(keyPair.publicKey).toBeTruthy();
    expect(keyPair.privateKey).toBeTruthy();
  });

  test('message signature is valid', async () => {
    const identity = await ECDSAKeyIdentity.generate();
    const message = 'Hello world. ECDSA test here';
    const challenge = new TextEncoder().encode(message);
    const signature = await identity.sign(challenge);
    const isValid = await globalThis.crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      identity.getKeyPair().publicKey,
      signature,
      challenge,
    );
    expect(isValid).toBe(true);
  });
});
