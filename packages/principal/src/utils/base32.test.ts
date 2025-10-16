import { base32Encode, base32Decode } from './base32.ts';

describe('base32', () => {
    it('works', () => {
        // Test Vectors (without padding) from RFC 4648.
        expect(base32Encode(new Uint8Array([]))).toBe('');
        expect(base32Encode(new Uint8Array([102]))).toBe('my');
        expect(base32Encode(new Uint8Array([102, 111]))).toBe('mzxq');
        expect(base32Encode(new Uint8Array([102, 111, 111]))).toBe('mzxw6');
        expect(base32Encode(new Uint8Array([102, 111, 111, 98]))).toBe('mzxw6yq');
        expect(base32Encode(new Uint8Array([102, 111, 111, 98, 97]))).toBe('mzxw6ytb');
        expect(base32Encode(new Uint8Array([102, 111, 111, 98, 97, 114]))).toBe('mzxw6ytboi');

        expect(base32Decode('')).toEqual(new Uint8Array([]));
        expect(base32Decode('my')).toEqual(new Uint8Array([102]));
        expect(base32Decode('mzxq')).toEqual(new Uint8Array([102, 111]));
        expect(base32Decode('mzxw6')).toEqual(new Uint8Array([102, 111, 111]));
        expect(base32Decode('mzxw6yq')).toEqual(new Uint8Array([102, 111, 111, 98]));
        expect(base32Decode('mzxw6ytb')).toEqual(new Uint8Array([102, 111, 111, 98, 97]));
        expect(base32Decode('mzxw6ytboi')).toEqual(new Uint8Array([102, 111, 111, 98, 97, 114]));
    });
});
