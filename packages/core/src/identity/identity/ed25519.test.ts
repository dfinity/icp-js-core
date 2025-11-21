import { DerEncodedPublicKey, PublicKey } from '#agent';
import { Ed25519KeyIdentity, Ed25519PublicKey } from './ed25519.ts';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';

const testVectors: Array<[string, string]> = [
  [
    'B3997656BA51FF6DA37B61D8D549EC80717266ECF48FB5DA52B654412634844C',
    '302A300506032B6570032100B3997656BA51FF6DA37B61D8D549EC80717266ECF48FB5DA52B654412634844C',
  ],
  [
    'A5AFB5FEB6DFB6DDF5DD6563856FFF5484F5FE304391D9ED06697861F220C610',
    '302A300506032B6570032100A5AFB5FEB6DFB6DDF5DD6563856FFF5484F5FE304391D9ED06697861F220C610',
  ],
  [
    'C8413108F121CB794A10804D15F613E40ECC7C78A4EC567040DDF78467C71DFF',
    '302A300506032B6570032100C8413108F121CB794A10804D15F613E40ECC7C78A4EC567040DDF78467C71DFF',
  ],
];

describe('Ed25519PublicKey Tests', () => {
  test('DER encoding of ED25519 keys', async () => {
    testVectors.forEach(([rawPublicKeyHex, derEncodedPublicKeyHex]) => {
      const publicKey = Ed25519PublicKey.fromRaw(hexToBytes(rawPublicKeyHex));
      const expectedDerPublicKey = hexToBytes(derEncodedPublicKeyHex);
      expect(publicKey.toDer().toString()).toEqual(expectedDerPublicKey.toString());
    });
  });

  test('DER decoding of ED25519 keys', async () => {
    testVectors.forEach(([rawPublicKeyHex, derEncodedPublicKeyHex]) => {
      const derPublicKey = hexToBytes(derEncodedPublicKeyHex) as DerEncodedPublicKey;
      const expectedPublicKey = hexToBytes(rawPublicKeyHex);
      expect(new Uint8Array(Ed25519PublicKey.fromDer(derPublicKey).toRaw())).toEqual(
        new Uint8Array(expectedPublicKey),
      );
    });
  });

  test('DER decoding of invalid keys', async () => {
    // Too short.
    expect(() => {
      Ed25519PublicKey.fromDer(
        hexToBytes(
          '302A300506032B6570032100B3997656BA51FF6DA37B61D8D549EC80717266ECF48FB5DA52B65441263484',
        ) as DerEncodedPublicKey,
      );
    }).toThrow();
    // Too long.
    expect(() => {
      Ed25519PublicKey.fromDer(
        hexToBytes(
          '302A300506032B6570032100B3997656BA51FF6DA37B61D8D549EC8071726' +
            '6ECF48FB5DA52B654412634844C00',
        ) as DerEncodedPublicKey,
      );
    }).toThrow();

    // Invalid DER-encoding.
    expect(() => {
      Ed25519PublicKey.fromDer(
        hexToBytes(
          '002A300506032B6570032100B3997656BA51FF6DA37B61D8D549EC80717266ECF48FB5DA52B654412634844C',
        ) as DerEncodedPublicKey,
      );
    }).toThrow();
  });
});

describe('Ed25519KeyIdentity tests', () => {
  test('fails with improper seed', () => {
    expect(() => Ed25519KeyIdentity.generate(new Uint8Array(new Array(31).fill(0)))).toThrow();
    expect(() => Ed25519KeyIdentity.generate(new Uint8Array(new Array(33).fill(0)))).toThrow();
  });

  test('fromSecretKey should generate an identity', () => {
    const identity = Ed25519KeyIdentity.generate();
    const { secretKey } = identity.getKeyPair();

    const key2 = Ed25519KeyIdentity.fromSecretKey(secretKey);

    expect(new Uint8Array(identity.getPublicKey().toDer())).toEqual(
      new Uint8Array(key2.getPublicKey().toDer()),
    );
  });

  test('fromSecretKey throws if bytelength is off', () => {
    const shouldFail = () => {
      const identity = Ed25519KeyIdentity.generate();
      const { secretKey } = identity.getKeyPair();
      const shortArray = new Uint8Array(secretKey).subarray(1, 32);
      Ed25519KeyIdentity.fromSecretKey(Uint8Array.from(shortArray).subarray(1, 32));
    };
    expect(shouldFail).toThrow('private key of length 32 expected, got 30'); // this error comes from @noble/curves
  });

  test('can encode and decode to/from JSON', async () => {
    const identity = Ed25519KeyIdentity.generate();

    const json = JSON.stringify(identity);
    const key2 = Ed25519KeyIdentity.fromJSON(json);

    expect(new Uint8Array(identity.getPublicKey().toDer())).toEqual(
      new Uint8Array(key2.getPublicKey().toDer()),
    );
  });

  test('produces a valid signature', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const message = new TextEncoder().encode('Hello, World!');

    const signature = await identity.sign(message);
    const pubkey = identity.getPublicKey();

    const isValid = Ed25519KeyIdentity.verify(signature, message, pubkey.rawKey);

    expect(isValid).toBe(true);
  });

  it('generates random private keys', () => {
    const key1 = Ed25519KeyIdentity.generate();
    const key2 = Ed25519KeyIdentity.generate();
    expect(key1.toJSON().toString()).not.toEqual(key2.toJSON().toString());
  });

  it('should warn if the key is an Uint8Array consisting of all zeroes', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const baseKey = new Uint8Array(new Array(32).fill(0));
    Ed25519KeyIdentity.generate(baseKey);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Seed is all zeros. This is not a secure seed. Please provide a seed with sufficient entropy if this is a production environment.',
    );
  });
});

test('from JSON', async () => {
  const testSecrets = [
    '302a300506032b6570032100d1fa89134802051c8b5d4e53c08b87381b87097bca4c4f348611eb8ce6c91809',
    '4bbff6b476463558d7be318aa342d1a97778d70833038680187950e9e02486c0d1fa89134802051c8b5d4e53c08b87381b87097bca4c4f348611eb8ce6c91809',
  ];

  const identity = Ed25519KeyIdentity.fromJSON(JSON.stringify(testSecrets));

  const msg = new TextEncoder().encode('Hello, World!');
  const signature = await identity.sign(msg);
  const isValid = Ed25519KeyIdentity.verify(signature, msg, identity.getPublicKey().rawKey);
  expect(isValid).toBe(true);
});

describe('public key serialization from various types', () => {
  it('should serialize from an existing public key', () => {
    const baseKey = Ed25519KeyIdentity.generate();
    const publicKey: PublicKey = baseKey.getPublicKey();
    const newKey = Ed25519PublicKey.from(publicKey);
    expect(newKey).toBeDefined();
  });
  it('should serialize from a raw key', () => {
    const baseKey = Ed25519KeyIdentity.generate();
    const publicKey = baseKey.getPublicKey().rawKey;
    const newKey = Ed25519PublicKey.from(publicKey);
    expect(newKey).toBeDefined();
  });
  it('should serialize from a DER key', () => {
    const baseKey = Ed25519KeyIdentity.generate();
    const publicKey = baseKey.getPublicKey().derKey;
    const newKey = Ed25519PublicKey.from(publicKey);
    expect(newKey).toBeDefined();
  });
  it('should serialize from a Uint8Array', () => {
    const baseKey = Ed25519KeyIdentity.generate();
    const publicKey = new Uint8Array(baseKey.getPublicKey().toRaw());
    const newKey = Ed25519PublicKey.from(publicKey);
    expect(newKey).toBeDefined();
  });
  it('should serialize from a hex string', () => {
    const baseKey = Ed25519KeyIdentity.generate();
    const publicKey = bytesToHex(baseKey.getPublicKey().toRaw());
    const newKey = Ed25519PublicKey.from(publicKey);
    expect(newKey).toBeDefined();
  });
  it('should fail to parse an invalid key', () => {
    const baseKey = 7;
    const shouldFail = () => Ed25519PublicKey.from(baseKey as unknown);
    expect(shouldFail).toThrow('Cannot construct Ed25519PublicKey from the provided key.');

    const shouldFailHex = () => Ed25519PublicKey.from('not a hex string');
    expect(shouldFailHex).toThrow('hex string expected');
  });
});
