import { Principal } from './principal.ts';
import { jsonReviver } from '@dfinity/utils';

describe('Principal', () => {
  it('encodes properly', () => {
    expect(Principal.fromHex('efcdab000000000001').toText()).toBe('2chl6-4hpzw-vqaaa-aaaaa-c');
    expect(Principal.fromHex('').toText()).toBe('aaaaa-aa');
    expect(Principal.anonymous().toText()).toBe('2vxsx-fae');
  });

  it('parses properly', () => {
    expect(Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c').toHex()).toBe('EFCDAB000000000001');
    expect(Principal.fromText('aaaaa-aa').toHex()).toBe('');
    expect(Principal.fromText('2vxsx-fae').toHex()).toBe('04');
    expect(Principal.fromText('2vxsx-fae').isAnonymous()).toBe(true);
  });

  it('errors out on invalid checksums', () => {
    // These are taken from above with the first character changed to make an invalid crc32.
    expect(() => Principal.fromText('0chl6-4hpzw-vqaaa-aaaaa-c').toHex()).toThrow();
    expect(() => Principal.fromText('0aaaa-aa').toHex()).toThrow();
    expect(() => Principal.fromText('0vxsx-fae').toHex()).toThrow();
  });

  it('errors out on parsing invalid characters', () => {
    expect(() => Principal.fromText('Hello world!')).toThrow();
  });

  it('compares principals correctly', () => {
    const anonymous = Principal.anonymous();
    const principal1 = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
    const principal2 = Principal.fromText('ivg37-qiaaa-aaaab-aaaga-cai');
    for (const p of [anonymous, principal1, principal2]) {
      expect(p.compareTo(p)).toBe('eq');
      expect(p.ltEq(p)).toBe(true);
      expect(p.gtEq(p)).toBe(true);
    }
    expect(principal1.compareTo(principal2)).toBe('lt');
    expect(principal1.compareTo(anonymous)).toBe('lt');
    expect(principal2.compareTo(principal1)).toBe('gt');
    expect(principal2.compareTo(anonymous)).toBe('lt');
    expect(anonymous.compareTo(principal1)).toBe('gt');
    expect(anonymous.compareTo(principal2)).toBe('gt');
  });

  it('serializes to String constructor', () => {
    const principal = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
    expect(principal.toString()).toBe('ryjl3-tyaaa-aaaaa-aaaba-cai');
    expect(String(principal)).toBe('ryjl3-tyaaa-aaaaa-aaaba-cai');
  });

  it('serializes to JSON', () => {
    const principal = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');

    const json = principal.toJSON();
    expect(json).toEqual({ __principal__: 'ryjl3-tyaaa-aaaaa-aaaba-cai' });

    const stringified = JSON.stringify(principal);
    expect(stringified).toEqual('{"__principal__":"ryjl3-tyaaa-aaaaa-aaaba-cai"}');

    expect(JSON.parse(stringified, jsonReviver)).toEqual(principal);
  });

  it('serializes from JSON string', () => {
    const principal = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
    const json = JSON.stringify(principal);
    expect(Principal.from(json)).toEqual(principal);
  });

  it('returns the management canister principal', () => {
    const principal = Principal.fromText('aaaaa-aa');
    expect(Principal.managementCanister()).toEqual(principal);
  });

  it('isPrincipal', () => {
    expect(Principal.isPrincipal(Principal.anonymous())).toBe(true);
    expect(Principal.isPrincipal(Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai'))).toBe(true);
    expect(Principal.isPrincipal(Principal.fromText('aaaaa-aa'))).toBe(true);
    expect(Principal.isPrincipal(Principal.fromText('2vxsx-fae'))).toBe(true);
    expect(Principal.isPrincipal({ _isPrincipal: true, _arr: new Uint8Array([0x04]) })).toBe(true);

    expect(Principal.isPrincipal({ _isPrincipal: true, _arr: 'not a Uint8Array' })).toBe(false);
    expect(Principal.isPrincipal({ _isPrincipal: true, _arr: new ArrayBuffer(1) })).toBe(false);
    expect(Principal.isPrincipal({ _isPrincipal: true })).toBe(false);
    expect(Principal.isPrincipal({})).toBe(false);
    expect(Principal.isPrincipal(new Uint8Array([0x04]))).toBe(false);
    expect(Principal.isPrincipal('')).toBe(false);
    expect(Principal.isPrincipal(null)).toBe(false);
  });
});
