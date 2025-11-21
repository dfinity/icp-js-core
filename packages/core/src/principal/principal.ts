import { base32Decode, base32Encode } from './utils/base32.ts';
import { getCrc32 } from './utils/getCrc.ts';
import { sha224 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export const JSON_KEY_PRINCIPAL = '__principal__';
const SELF_AUTHENTICATING_SUFFIX = 2;
const ANONYMOUS_SUFFIX = 4;

const MANAGEMENT_CANISTER_PRINCIPAL_TEXT_STR = 'aaaaa-aa';

export type JsonnablePrincipal = {
  [JSON_KEY_PRINCIPAL]: string;
};

export class Principal {
  public static anonymous(): Principal {
    return new this(new Uint8Array([ANONYMOUS_SUFFIX]));
  }

  /**
   * Utility method, returning the principal representing the management canister, decoded from the hex string `'aaaaa-aa'`
   * @returns {Principal} principal of the management canister
   */
  public static managementCanister(): Principal {
    return this.fromText(MANAGEMENT_CANISTER_PRINCIPAL_TEXT_STR);
  }

  public static selfAuthenticating(publicKey: Uint8Array): Principal {
    const sha = sha224(publicKey);
    return new this(new Uint8Array([...sha, SELF_AUTHENTICATING_SUFFIX]));
  }

  public static from(other: unknown): Principal {
    if (typeof other === 'string') {
      return Principal.fromText(other);
    } else if (Object.getPrototypeOf(other) === Uint8Array.prototype) {
      return new Principal(other as Uint8Array);
    } else if (Principal.isPrincipal(other)) {
      return new Principal(other._arr);
    }

    throw new Error(`Impossible to convert ${JSON.stringify(other)} to Principal.`);
  }

  public static fromHex(hex: string): Principal {
    return new this(hexToBytes(hex));
  }

  public static fromText(text: string): Principal {
    let maybePrincipal = text;
    // If formatted as JSON string, parse it first
    if (text.includes(JSON_KEY_PRINCIPAL)) {
      const obj = JSON.parse(text);
      if (JSON_KEY_PRINCIPAL in obj) {
        maybePrincipal = obj[JSON_KEY_PRINCIPAL];
      }
    }

    const canisterIdNoDash = maybePrincipal.toLowerCase().replace(/-/g, '');

    let arr = base32Decode(canisterIdNoDash);
    arr = arr.slice(4, arr.length);

    const principal = new this(arr);
    if (principal.toText() !== maybePrincipal) {
      throw new Error(
        `Principal "${principal.toText()}" does not have a valid checksum (original value "${maybePrincipal}" may not be a valid Principal ID).`,
      );
    }

    return principal;
  }

  public static fromUint8Array(arr: Uint8Array): Principal {
    return new this(arr);
  }

  public static isPrincipal(other: unknown): other is Principal {
    return (
      other instanceof Principal ||
      (typeof other === 'object' &&
        other !== null &&
        '_isPrincipal' in other &&
        (other as { _isPrincipal: boolean })['_isPrincipal'] === true &&
        '_arr' in other &&
        (other as { _arr: Uint8Array })['_arr'] instanceof Uint8Array)
    );
  }

  public readonly _isPrincipal = true;

  protected constructor(private _arr: Uint8Array) {}

  public isAnonymous(): boolean {
    return this._arr.byteLength === 1 && this._arr[0] === ANONYMOUS_SUFFIX;
  }

  public toUint8Array(): Uint8Array {
    return this._arr;
  }

  public toHex(): string {
    return bytesToHex(this._arr).toUpperCase();
  }

  public toText(): string {
    const checksumArrayBuf = new ArrayBuffer(4);
    const view = new DataView(checksumArrayBuf);
    view.setUint32(0, getCrc32(this._arr));
    const checksum = new Uint8Array(checksumArrayBuf);

    const array = new Uint8Array([...checksum, ...this._arr]);

    const result = base32Encode(array);
    const matches = result.match(/.{1,5}/g);
    if (!matches) {
      // This should only happen if there's no character, which is unreachable.
      throw new Error();
    }
    return matches.join('-');
  }

  public toString(): string {
    return this.toText();
  }

  /**
   * Serializes to JSON
   * @returns {JsonnablePrincipal} a JSON object with a single key, {@link JSON_KEY_PRINCIPAL}, whose value is the principal as a string
   */
  public toJSON(): JsonnablePrincipal {
    return { [JSON_KEY_PRINCIPAL]: this.toText() };
  }

  /**
   * Utility method taking a Principal to compare against. Used for determining canister ranges in certificate verification
   * @param {Principal} other - a {@link Principal} to compare
   * @returns {'lt' | 'eq' | 'gt'} `'lt' | 'eq' | 'gt'` a string, representing less than, equal to, or greater than
   */
  public compareTo(other: Principal): 'lt' | 'eq' | 'gt' {
    for (let i = 0; i < Math.min(this._arr.length, other._arr.length); i++) {
      if (this._arr[i] < other._arr[i]) return 'lt';
      else if (this._arr[i] > other._arr[i]) return 'gt';
    }
    // Here, at least one principal is a prefix of the other principal (they could be the same)
    if (this._arr.length < other._arr.length) return 'lt';
    if (this._arr.length > other._arr.length) return 'gt';
    return 'eq';
  }

  /**
   * Utility method checking whether a provided Principal is less than or equal to the current one using the {@link Principal.compareTo} method
   * @param other a {@link Principal} to compare
   * @returns {boolean} boolean
   */
  public ltEq(other: Principal): boolean {
    const cmp = this.compareTo(other);
    return cmp == 'lt' || cmp == 'eq';
  }

  /**
   * Utility method checking whether a provided Principal is greater than or equal to the current one using the {@link Principal.compareTo} method
   * @param other a {@link Principal} to compare
   * @returns {boolean} boolean
   */
  public gtEq(other: Principal): boolean {
    const cmp = this.compareTo(other);
    return cmp == 'gt' || cmp == 'eq';
  }
}
