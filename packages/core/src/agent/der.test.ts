import { encodeLenBytes, encodeLen, decodeLenBytes, decodeLen } from './der.ts';
import { uint8Equals } from './utils/buffer.ts';

describe('uint8Equals tests', () => {
  test('equal buffers', () => {
    const buf1 = Uint8Array.from([0, 0, 0, 1]);
    const buf2 = Uint8Array.from([0, 0, 0, 1]);
    expect(uint8Equals(buf1, buf2)).toBe(true);
  });
  test('rejects buffers with different lengths', () => {
    const buf1 = Uint8Array.from([0, 0, 0, 0, 1]);
    const buf2 = Uint8Array.from([0, 0, 0, 1]);
    expect(uint8Equals(buf1, buf2)).toBe(false);
  });
  test('rejects buffers with different values', () => {
    const buf1 = Uint8Array.from([0, 0, 0, 2]);
    const buf2 = Uint8Array.from([0, 0, 0, 1]);
    expect(uint8Equals(buf1, buf2)).toBe(false);
  });
});

describe('encodeLenBytes', () => {
  test('Length of up to 127', () => {
    const byteLength = Uint8Array.from(new Array(127)).byteLength;
    expect(encodeLenBytes(byteLength)).toEqual(1);
  });
  test('Length of up to 255', () => {
    const min = Uint8Array.from(new Array(128)).byteLength;
    expect(encodeLenBytes(min)).toEqual(2);
    const max = Uint8Array.from(new Array(255)).byteLength;
    expect(encodeLenBytes(max)).toEqual(2);
  });
  test('Length of up to 65536', () => {
    const min = Uint8Array.from(new Array(256)).byteLength;
    expect(encodeLenBytes(min)).toEqual(3);
    const max = Uint8Array.from(new Array(65535)).byteLength;
    expect(encodeLenBytes(max)).toEqual(3);
  });
  test('Length of up to 16777215', () => {
    // Using numbers directly for performance
    const min = 65536;
    expect(encodeLenBytes(min)).toEqual(4);
    const max = 16777215;
    expect(encodeLenBytes(max)).toEqual(4);
  });
  test('Over maximum length', () => {
    const shouldFail = () => encodeLenBytes(16777216);
    expect(shouldFail).toThrow('Length too long (> 4 bytes)');
  });
});

describe('encodeLen', () => {
  const buf = Uint8Array.from(new Array(256));
  test('Length of up to 127', () => {
    const min = encodeLen(buf, 0, 1);
    const max = encodeLen(buf, 0, 127);
    expect(min).toEqual(1);
    expect(max).toEqual(1);
  });
  test('Length of up to 255', () => {
    const min = encodeLen(buf, 0, 128);
    const max = encodeLen(buf, 0, 255);
    expect(min).toEqual(2);
    expect(max).toEqual(2);
  });
  test('Length of up to 65535', () => {
    const min = encodeLen(buf, 0, 256);
    const max = encodeLen(buf, 0, 65535);
    expect(min).toEqual(3);
    expect(max).toEqual(3);
  });
  test('Length of up to 16777215', () => {
    const min = encodeLen(buf, 0, 65536);
    const max = encodeLen(buf, 0, 16777215);
    expect(min).toEqual(4);
    expect(max).toEqual(4);
  });
  test('Length of up to 16777215', () => {
    const min = encodeLen(buf, 0, 65536);
    const max = encodeLen(buf, 0, 16777215);
    expect(min).toEqual(4);
    expect(max).toEqual(4);
  });
  test('Over maximum length', () => {
    const shouldFail = () => encodeLen(buf, 0, 16777216);
    expect(shouldFail).toThrow('Length too long (> 4 bytes)');
  });
});

describe('DecodeLenBytes', () => {
  test('encoded length of zero', () => {
    // length of buf doesn't matter
    const buf = Uint8Array.from(new Array(2));
    // 129 signifies a DER length of 2
    buf[0] = 128;
    const shouldFail = () => decodeLenBytes(buf, 0);
    expect(shouldFail).toThrow('Invalid length 0');
  });
  test('encoded length of 1', () => {
    const buf = Uint8Array.of(100);
    expect(decodeLenBytes(buf, 0)).toBe(1);
  });
  test('encoded length of 2', () => {
    const buf = Uint8Array.from(new Array(2));
    // 129 signifies a DER length of 2
    buf[0] = 129;
    expect(decodeLenBytes(buf, 0)).toBe(2);
  });
  test('encoded length of 3', () => {
    const buf = Uint8Array.from(new Array(2));
    // 130 signifies a DER length of 3
    buf[0] = 130;
    expect(decodeLenBytes(buf, 0)).toBe(3);
  });
  test('encoded length of 4', () => {
    const buf = Uint8Array.from(new Array(2));
    // 131 signifies a DER length of 4
    buf[0] = 131;
    expect(decodeLenBytes(buf, 0)).toBe(4);
  });
  test('encoded length of 4', () => {
    const buf = Uint8Array.from(new Array(2));
    buf[0] = 132;
    const shouldFail = () => decodeLenBytes(buf, 0);
    expect(shouldFail).toThrow('Length too long');
  });
});

describe('decodeLen', () => {
  test('encoded length of 1', () => {
    const buf = Uint8Array.of(1);
    expect(decodeLen(buf, 0)).toBe(1);
  });
  test('encoded length of 2', () => {
    const buf = Uint8Array.from(new Array(10));
    buf[0] = 129;
    // returns value stored at index 1
    buf[1] = 5;

    expect(decodeLen(buf, 0)).toBe(5);
  });
  test('encoded length of 3', () => {
    const buf = Uint8Array.from(new Array(10));
    buf[0] = 130;
    buf[1] = 1;
    buf[2] = 1;
    expect(decodeLen(buf, 0)).toBe(257);
  });
  test('encoded length of 4', () => {
    const buf = Uint8Array.from(new Array(10));
    buf[0] = 131;
    buf[1] = 1;
    buf[2] = 1;
    buf[3] = 1;
    // returns value encoded by summing buf[offset + 3] and left-shifts of the values at index 1, and 2
    expect(decodeLen(buf, 0)).toBe(65793);
  });
  test('length of over 4 bytes', () => {
    const buf = Uint8Array.from(new Array(10));
    buf[0] = 133;
    const shouldFail = () => decodeLen(buf, 0);
    expect(shouldFail).toThrow('Length too long');
  });
});
