import { Principal } from '@dfinity/principal';
import { DelegationChain, DelegationIdentity, PartialDelegationIdentity } from './delegation.ts';
import { Ed25519KeyIdentity } from './ed25519.ts';
import { Ed25519PublicKey } from '@dfinity/agent';

function createIdentity(seed: number): Ed25519KeyIdentity {
  const s = new Uint8Array([seed, ...new Array(31).fill(0)]);
  return Ed25519KeyIdentity.generate(s);
}

expect.extend({
  toBeHex(received: unknown) {
    const pass = typeof received === 'string' &&
                 received.length > 0 &&
                 /^[0-9a-f]+$/i.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid hex string`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid hex string`,
        pass: false,
      };
    }
  },
});

declare module '@jest/expect' {
  interface Matchers<R> {
    toBeHex(): R;
  }
}

test('delegation signs with proper keys (3)', async () => {
  const root = createIdentity(2);
  const middle = createIdentity(1);
  const bottom = createIdentity(0);

  const rootToMiddle = await DelegationChain.create(
    root,
    middle.getPublicKey(),
    new Date(1609459200000),
  );
  const middleToBottom = await DelegationChain.create(
    middle,
    bottom.getPublicKey(),
    new Date(1609459200000),
    {
      previous: rootToMiddle,
    },
  );

  const golden = {
    delegations: [
      {
        delegation: {
          expiration: '1655f29d787c0000',
          pubkey:
            '302a300506032b6570032100cecc1507dc1ddd7295951c290888f095adb9044d1b73d696e6df065d683bd4fc',
        },
        signature:
          'b106d135e5ad7459dc67db68a4946fdbe603e650df4035957db7f0fb54e7467bb463116a2ad025e1887cd1f29025e0f3607b09924abbbbebfaf921b675c8ff08',
      },
      {
        delegation: {
          expiration: '1655f29d787c0000',
          pubkey:
            '302a300506032b65700321003b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29',
        },
        signature:
          '5e40f3d171e499a691092e5b961b5447921091bcf8c6409cb5641541f4dc1390f501c5dfb16b10df29d429cd153b9e396af4e883ed3cfa090d28e214db14c308',
      },
    ],
    publicKey:
      '302a300506032b65700321006b79c57e6a095239282c04818e96112f3f03a4001ba97a564c23852a3f1ea5fc',
  };

  expect(middleToBottom.toJSON()).toEqual(golden);
});

test('DelegationChain can be serialized to and from JSON', async () => {
  const root = createIdentity(2);
  const middle = createIdentity(1);
  const bottom = createIdentity(0);

  const rootToMiddle = await DelegationChain.create(
    root,
    middle.getPublicKey(),
    new Date(1609459200000),
    {
      targets: [Principal.fromText('jyi7r-7aaaa-aaaab-aaabq-cai')],
    },
  );
  const middleToBottom = await DelegationChain.create(
    middle,
    bottom.getPublicKey(),
    new Date(1609459200000),
    {
      previous: rootToMiddle,
      targets: [Principal.fromText('u76ha-lyaaa-aaaab-aacha-cai')],
    },
  );

  const rootToMiddleJson = JSON.stringify(rootToMiddle);
  // All strings in the JSON should be hex so it is clear how to decode this as different versions
  // of `toJSON` evolve.
  JSON.parse(rootToMiddleJson, (_key, value) => {
    if (typeof value === 'string') {
      const byte = parseInt(value, 16);
      if (isNaN(byte)) {
        throw new Error(`expected all strings to be hex, but got: ${value}`);
      }
    }
    return value;
  });
  const rootToMiddleActual = DelegationChain.fromJSON(rootToMiddleJson);
  expect(rootToMiddleActual.toJSON()).toMatchObject(rootToMiddle.toJSON());

  const middleToBottomJson = JSON.stringify(middleToBottom);
  const middleToBottomActual = DelegationChain.fromJSON(middleToBottomJson);
  expect(middleToBottomActual.toJSON()).toEqual(middleToBottom.toJSON());
});

test('Delegation Chain can sign', async () => {
  const root = createIdentity(2);
  const middle = createIdentity(1);

  const rootToMiddle = await DelegationChain.create(
    root,
    middle.getPublicKey(),
    new Date(1609459200000),
    {
      targets: [Principal.fromText('jyi7r-7aaaa-aaaab-aaabq-cai')],
    },
  );

  const identity = DelegationIdentity.fromDelegation(middle, rootToMiddle);

  const signature = await identity.sign(new Uint8Array([1, 2, 3]));

  const isValid = Ed25519KeyIdentity.verify(
    signature,
    new Uint8Array([1, 2, 3]),
    middle.getPublicKey().rawKey,
  );
  expect(isValid).toBe(true);
  expect(middle.toJSON()[1].length).toBe(64);
});

describe('PartialDelegationIdentity', () => {
  it('should create a partial identity from a public key and a delegation chain', async () => {
    const key = Ed25519PublicKey.fromRaw(new Uint8Array(32).fill(0));
    const signingIdentity = Ed25519KeyIdentity.generate(new Uint8Array(32).fill(1));
    const chain = await DelegationChain.create(signingIdentity, key, new Date(1609459200000));

    const partial = PartialDelegationIdentity.fromDelegation(key, chain);

    const partialDelegation = partial.delegation;
    expect(partialDelegation).toBeDefined();

    const rawKey = partial.rawKey;
    expect(rawKey).toBeDefined();

    const principal = partial.getPrincipal();
    expect(principal).toBeDefined();
    expect(principal.toText()).toEqual(
      'deffl-liaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaaaa-aaa',
    );
  });
  it('should throw an error if one attempts to sign', async () => {
    const key = Ed25519PublicKey.fromRaw(new Uint8Array(32).fill(0));
    const signingIdentity = Ed25519KeyIdentity.generate(new Uint8Array(32).fill(1));
    const chain = await DelegationChain.create(signingIdentity, key, new Date(1609459200000));

    const partial = PartialDelegationIdentity.fromDelegation(key, chain);
    await partial.transformRequest().catch(e => {
      expect(e).toContain('Not implemented.');
    });
  });
});

describe('DelegationChain with ArrayBuffers', () => {
  it('should handle ArrayBuffer binary data in toJSON without throwing', async () => {
    const root = createIdentity(2);
    const middle = createIdentity(1);

    // Create a normal delegation chain
    const chain = await DelegationChain.create(
      root,
      middle.getPublicKey(),
      new Date(1609459200000),
    );

    // Get the JSON representation first
    const originalJson = chain.toJSON();

    // Create a new chain from JSON, then manipulate it to simulate the bug condition
    // The bug occurred when binary data was ArrayBuffer instead of Uint8Array
    const recreated = DelegationChain.fromJSON(originalJson);

    // Access the internal delegations and simulate ArrayBuffer conversion
    // This simulates what happened in real-world usage when crypto APIs
    // or serialization processes returned ArrayBuffer instead of Uint8Array
    const delegationsWithArrayBuffer = recreated.delegations.map(signedDelegation => {
      // Convert signature Uint8Array to ArrayBuffer (the bug condition)
      const signature = signedDelegation.signature;
      const arrayBufferSignature = signature.buffer.slice(
        signature.byteOffset,
        signature.byteOffset + signature.byteLength
      );

      return {
        delegation: signedDelegation.delegation,
        signature: arrayBufferSignature as ArrayBuffer // This would cause the original error
      };
    });

    // Create a chain using fromDelegations with ArrayBuffer publicKey too
    const publicKeyArrayBuffer = recreated.publicKey.buffer.slice(
      recreated.publicKey.byteOffset,
      recreated.publicKey.byteOffset + recreated.publicKey.byteLength
    );

    const chainWithArrayBuffers = DelegationChain.fromDelegations(
      delegationsWithArrayBuffer,
      publicKeyArrayBuffer as ArrayBuffer
    );

    expect.assertions(3)
    // This would throw "Uint8Array expected" before the safeBytesToHex fix
    // but should work fine after the fix
    expect(() => {
      const json = chainWithArrayBuffers.toJSON();
      // Verify the output is still valid hex
      expect(json.delegations[0].signature).toBeHex();
      expect(json.publicKey).toBeHex();
    }).not.toThrow();
  });

  it('should handle ArrayBuffer in delegation pubkey during toJSON', async () => {
    const root = createIdentity(3);
    const middle = createIdentity(1);

    const chain = await DelegationChain.create(
      root,
      middle.getPublicKey(),
      new Date(1609459200000),
    );

    // Simulate the scenario where delegation.pubkey is ArrayBuffer
    const delegationsWithArrayBufferPubkey = chain.delegations.map(signedDelegation => {
      const pubkey = signedDelegation.delegation.pubkey;
      const arrayBufferPubkey = pubkey.buffer.slice(
        pubkey.byteOffset,
        pubkey.byteOffset + pubkey.byteLength
      );

      // Create new delegation with ArrayBuffer pubkey
      const delegationWithArrayBuffer = {
        pubkey: arrayBufferPubkey as Record<string, unknown>,
        expiration: signedDelegation.delegation.expiration,
        targets: signedDelegation.delegation.targets
      };

      return {
        delegation: delegationWithArrayBuffer as ArrayBuffer,
        signature: signedDelegation.signature
      };
    });

    const chainWithArrayBufferPubkey = DelegationChain.fromDelegations(
      delegationsWithArrayBufferPubkey,
      chain.publicKey
    );

    expect.assertions(2);
    // This tests another code path that could fail with ArrayBuffer
    expect(() => {
      const json = chainWithArrayBufferPubkey.toJSON();
      expect(json.delegations[0].delegation.pubkey).toBeHex();
    }).not.toThrow();
  });
});
