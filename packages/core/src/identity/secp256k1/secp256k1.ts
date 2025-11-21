import {
  type DerEncodedPublicKey,
  type KeyPair,
  type Signature,
  type PublicKey,
  SignIdentity,
} from '#agent';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';
import * as bip39 from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { SECP256K1_OID, unwrapDER, wrapDER } from './der.ts';
import { pemToSecretKey } from './pem.ts';
import { uint8FromBufLike } from '#candid';

declare type PublicKeyHex = string;
declare type SecretKeyHex = string;
export declare type JsonableSecp256k1Identity = [PublicKeyHex, SecretKeyHex];

declare type KeyLike = PublicKey | DerEncodedPublicKey | ArrayBuffer | ArrayBufferView | Uint8Array;

function isObject(value: unknown) {
  return value !== null && typeof value === 'object';
}

export class Secp256k1PublicKey implements PublicKey {
  public static fromRaw(rawKey: Uint8Array): Secp256k1PublicKey {
    return new Secp256k1PublicKey(rawKey);
  }

  public static fromDer(derKey: DerEncodedPublicKey): Secp256k1PublicKey {
    return new Secp256k1PublicKey(this.derDecode(derKey));
  }

  /**
   * Construct Secp256k1PublicKey from an existing PublicKey
   * @param {unknown} maybeKey - existing PublicKey, ArrayBuffer, DerEncodedPublicKey, or hex string
   * @returns {Secp256k1PublicKey} Instance of Secp256k1PublicKey
   */
  public static from(maybeKey: unknown): Secp256k1PublicKey {
    if (typeof maybeKey === 'string') {
      const key = hexToBytes(maybeKey);
      return this.fromRaw(key);
    } else if (isObject(maybeKey)) {
      const key = maybeKey as KeyLike;
      if (isObject(key) && Object.hasOwnProperty.call(key, '__derEncodedPublicKey__')) {
        return this.fromDer(key as DerEncodedPublicKey);
      } else if (ArrayBuffer.isView(key)) {
        const view = key as ArrayBufferView;
        return this.fromRaw(uint8FromBufLike(view.buffer));
      } else if (key instanceof ArrayBuffer) {
        return this.fromRaw(uint8FromBufLike(key));
      } else if ('rawKey' in key && key['rawKey'] !== undefined) {
        return this.fromRaw(key.rawKey);
      } else if ('derKey' in key) {
        return this.fromDer(key.derKey as DerEncodedPublicKey);
      } else if ('toDer' in key) {
        return this.fromDer(key.toDer());
      }
    }
    throw new Error('Cannot construct Secp256k1PublicKey from the provided key.');
  }

  private static derEncode(publicKey: Uint8Array): DerEncodedPublicKey {
    const key = uint8FromBufLike(wrapDER(publicKey, SECP256K1_OID).buffer) as DerEncodedPublicKey;
    key.__derEncodedPublicKey__ = undefined;
    return key;
  }

  private static derDecode(key: DerEncodedPublicKey): Uint8Array {
    return unwrapDER(key, SECP256K1_OID);
  }

  #rawKey: Uint8Array;

  public get rawKey(): Uint8Array {
    return this.#rawKey;
  }

  #derKey: DerEncodedPublicKey;

  public get derKey(): DerEncodedPublicKey {
    return this.#derKey;
  }

  // `fromRaw` and `fromDer` should be used for instantiation, not this constructor.
  private constructor(key: Uint8Array) {
    this.#rawKey = key;
    this.#derKey = Secp256k1PublicKey.derEncode(key);
  }

  public toDer(): DerEncodedPublicKey {
    return this.derKey;
  }

  public toRaw(): Uint8Array {
    return this.rawKey;
  }
}

export class Secp256k1KeyIdentity extends SignIdentity {
  /**
   * Generates an identity. If a seed is provided, the keys are generated from the
   * seed according to BIP 0032. Otherwise, the key pair is randomly generated.
   * This method throws an error in case the seed is not 32 bytes long or invalid
   * for use as a private key.
   * @param {Uint8Array} seed the optional seed
   * @returns {Secp256k1KeyIdentity} Secp256k1KeyIdentity
   */
  public static generate(seed?: Uint8Array): Secp256k1KeyIdentity {
    if (seed && seed.byteLength !== 32) {
      throw new Error('Secp256k1 Seed needs to be 32 bytes long.');
    }
    let privateKey: Uint8Array;

    if (seed) {
      // private key from seed according to https://en.bitcoin.it/wiki/BIP_0032
      // master key generation:
      privateKey = seed;
      if (!secp256k1.utils.isValidPrivateKey(privateKey)) {
        throw new Error('The seed is invalid.');
      }
    } else {
      privateKey = randomBytes(32);
      while (!secp256k1.utils.isValidPrivateKey(privateKey)) {
        privateKey = randomBytes(32);
      }
    }

    const publicKeyRaw = secp256k1.getPublicKey(privateKey, false);

    const publicKey = Secp256k1PublicKey.fromRaw(publicKeyRaw);
    return new this(publicKey, privateKey);
  }

  public static fromParsedJson(obj: JsonableSecp256k1Identity): Secp256k1KeyIdentity {
    const [publicKeyRaw, privateKeyRaw] = obj;
    return new Secp256k1KeyIdentity(
      Secp256k1PublicKey.fromRaw(hexToBytes(publicKeyRaw)),
      hexToBytes(privateKeyRaw),
    );
  }

  public static fromJSON(json: string): Secp256k1KeyIdentity {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      if (typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
        return this.fromParsedJson([parsed[0], parsed[1]]);
      }
      throw new Error('Deserialization error: JSON must have at least 2 items.');
    }
    throw new Error(`Deserialization error: Invalid JSON type for string: ${JSON.stringify(json)}`);
  }

  /**
   * generates an identity from a public and private key. Please ensure that you are generating these keys securely and protect the user's private key
   * @param {Uint8Array} publicKey - Uint8Array
   * @param {Uint8Array} privateKey - Uint8Array
   * @returns {Secp256k1KeyIdentity} Secp256k1KeyIdentity
   */
  public static fromKeyPair(publicKey: Uint8Array, privateKey: Uint8Array): Secp256k1KeyIdentity {
    return new Secp256k1KeyIdentity(Secp256k1PublicKey.fromRaw(publicKey), privateKey);
  }

  /**
   * generates an identity from an existing secret key, and is the correct method to generate an identity from a seed phrase. Please ensure you protect the user's private key.
   * @param {Uint8Array} secretKey - Uint8Array
   * @returns {Secp256k1KeyIdentity} - Secp256k1KeyIdentity
   */
  public static fromSecretKey(secretKey: Uint8Array): Secp256k1KeyIdentity {
    const publicKey = secp256k1.getPublicKey(secretKey, false);
    const identity = Secp256k1KeyIdentity.fromKeyPair(publicKey, secretKey);
    return identity;
  }

  /**
   * Generates an identity from a seed phrase. Use carefully - seed phrases should only be used in secure contexts, and you should avoid having users copying and pasting seed phrases as much as possible.
   * @param {string | string[]} seedPhrase - either an array of words or a string of words separated by spaces.
   * @param password - optional password to be used by bip39
   * @returns Secp256k1KeyIdentity
   */
  public static fromSeedPhrase(
    seedPhrase: string | string[],
    password?: string | undefined,
  ): Secp256k1KeyIdentity {
    // Convert to string for convenience
    const phrase = Array.isArray(seedPhrase) ? seedPhrase.join(' ') : seedPhrase;
    // Warn if provided phrase is not conventional
    if (phrase.split(' ').length < 12 || phrase.split(' ').length > 24) {
      console.warn(
        'Warning - an unusually formatted seed phrase has been provided. Decoding may not work as expected',
      );
    }

    const seed = bip39.mnemonicToSeedSync(phrase, password);
    // Ensure the seed is 64 bytes long
    if (seed.byteLength !== 64) {
      throw new Error('Derived seed must be 64 bytes long.');
    }
    const root = HDKey.fromMasterSeed(seed);
    const addrnode = root.derive("m/44'/223'/0'/0/0");

    if (!addrnode.privateKey) {
      throw new Error('Failed to derive private key from seed phrase');
    }

    return Secp256k1KeyIdentity.fromSecretKey(addrnode.privateKey);
  }

  /**
   * Utility method to create a Secp256k1KeyIdentity from a PEM-encoded key.
   * @param pemKey - PEM-encoded key as a string
   * @returns - Secp256k1KeyIdentity
   */
  public static fromPem(pemKey: string): Secp256k1KeyIdentity {
    const secretKey = pemToSecretKey(pemKey);
    return this.fromSecretKey(secretKey);
  }

  _publicKey: Secp256k1PublicKey;

  protected constructor(
    publicKey: Secp256k1PublicKey,
    protected _privateKey: Uint8Array,
  ) {
    super();
    this._publicKey = publicKey;
  }

  /**
   * Serialize this key to JSON-serializable object.
   * @returns {JsonableSecp256k1Identity} JsonableSecp256k1Identity
   */
  public toJSON(): JsonableSecp256k1Identity {
    return [bytesToHex(this._publicKey.toRaw()), bytesToHex(this._privateKey)];
  }

  /**
   * Return a copy of the key pair.
   * @returns {KeyPair} KeyPair
   */
  public getKeyPair(): KeyPair {
    return {
      secretKey: this._privateKey,
      publicKey: this._publicKey,
    };
  }

  /**
   * Return the public key.
   * @returns {Required<PublicKey>} Required<PublicKey>
   */
  public getPublicKey(): Required<PublicKey> {
    return this._publicKey;
  }

  /**
   * Signs a blob of data, with this identity's private key.
   * @param {Uint8Array} data - bytes to hash and sign with this identity's secretKey, producing a signature
   * @returns {Promise<Signature>} signature
   */
  public async sign(data: Uint8Array): Promise<Signature> {
    const challenge = sha256(data);
    const signature = secp256k1.sign(challenge, this._privateKey).toCompactRawBytes();
    return signature as Signature;
  }
}

export default Secp256k1KeyIdentity;
