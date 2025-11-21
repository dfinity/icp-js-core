import {
  PipeArrayBuffer,
  concat,
  uint8FromBufLike,
  compare,
  uint8Equals,
  uint8ToDataView,
} from './buffer.ts';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';

describe('PipeArrayBuffer', () => {
  test('can read', () => {
    const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const pipe = new PipeArrayBuffer(buffer);

    expect([...new Uint8Array(pipe.read(3))]).toEqual([1, 2, 3]);
    expect([...new Uint8Array(pipe.read(2))]).toEqual([4, 5]);
    expect([...new Uint8Array(pipe.read(0))]).toEqual([]);
    expect(pipe.readUint8()).toEqual(6);
    expect([...new Uint8Array(pipe.buffer)]).toEqual([7, 8, 9, 10]);

    // Verify it doesn't change the original buffer.
    expect([...buffer]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    expect(pipe.end).toEqual(false);
    expect([...new Uint8Array(pipe.read(999))]).toEqual([7, 8, 9, 10]);
    expect([...new Uint8Array(pipe.read(999))]).toEqual([]);
    expect(pipe.end).toEqual(true);
  });

  test('can write', () => {
    const pipe = new PipeArrayBuffer(undefined);

    expect([...new Uint8Array(pipe.read(1))]).toEqual([]);
    pipe.write(new Uint8Array([1]));
    pipe.write(new Uint8Array([2, 3]));
    expect([...new Uint8Array(pipe.read(3))]).toEqual([1, 2, 3]);
    expect([...new Uint8Array(pipe.read(1))]).toEqual([]);

    pipe.write(new Uint8Array([4, 5]));
    expect([...new Uint8Array(pipe.read(1))]).toEqual([4]);
    expect([...new Uint8Array(pipe.read(1))]).toEqual([5]);
    expect([...new Uint8Array(pipe.read(1))]).toEqual([]);
  });

  test('invalid constructor parameters', () => {
    // @ts-expect-error: testing with invalid buffer type
    expect(() => new PipeArrayBuffer('not a buffer')).toThrow('Buffer must be a Uint8Array');
    expect(() => new PipeArrayBuffer(new Uint8Array(5), -1)).toThrow(
      'Length must be a non-negative integer',
    );
    expect(() => new PipeArrayBuffer(new Uint8Array(5), 1.5)).toThrow(
      'Length must be a non-negative integer',
    );
    expect(() => new PipeArrayBuffer(new Uint8Array(5), 10)).toThrow(
      'Length cannot exceed buffer length',
    );
  });

  test('save and restore', () => {
    const buffer = new Uint8Array([1, 2, 3, 4, 5]);
    const pipe = new PipeArrayBuffer(buffer);

    pipe.read(2); // Read [1, 2]
    const checkpoint = pipe.save();

    pipe.read(2); // Read [3, 4]
    expect([...new Uint8Array(pipe.buffer)]).toEqual([5]);

    pipe.restore(checkpoint);
    expect([...new Uint8Array(pipe.buffer)]).toEqual([3, 4, 5]);

    // Invalid restore
    expect(() => pipe.restore('not a uint8array' as unknown as Uint8Array)).toThrow(
      'Checkpoint must be a Uint8Array',
    );
  });

  test('readUint8 with empty buffer', () => {
    const pipe = new PipeArrayBuffer(new Uint8Array(0));
    expect(pipe.readUint8()).toBeUndefined();
  });

  test('write with invalid buffer', () => {
    const pipe = new PipeArrayBuffer();
    // @ts-expect-error: testing with invalid argument
    expect(() => pipe.write('not a buffer')).toThrow('Buffer must be a Uint8Array');
  });

  test('alloc with invalid amounts', () => {
    const pipe = new PipeArrayBuffer();
    expect(() => pipe.alloc(0)).toThrow('Amount must be a positive integer');
    expect(() => pipe.alloc(-1)).toThrow('Amount must be a positive integer');
    expect(() => pipe.alloc(1.5)).toThrow('Amount must be a positive integer');
  });

  test('alloc growth', () => {
    const pipe = new PipeArrayBuffer();

    // Initial empty buffer
    expect(pipe.byteLength).toBe(0);

    // Write data requiring allocation
    pipe.alloc(10);
    expect(pipe.byteLength).toBe(10);

    // Write more data to test exponential growth
    pipe.write(new Uint8Array(10).fill(1));
    expect(pipe.byteLength).toBe(20);
  });
});

describe('fromHex and toHex', () => {
  test('fromHex', () => {
    expect(new Uint8Array(hexToBytes('000102030405060708090A0B0C0D0E0F10'))).toEqual(
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    );
  });

  test('fromHex (2)', () => {
    expect(new Uint8Array(hexToBytes('FFFEFDFCFBFAF9F8F7F6F5F4F3F2F1F0'))).toEqual(
      new Uint8Array([
        255, 254, 253, 252, 251, 250, 249, 248, 247, 246, 245, 244, 243, 242, 241, 240,
      ]),
    );
  });

  test('toHex', () => {
    expect(
      bytesToHex(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])),
    ).toEqual('000102030405060708090a0b0c0d0e0f10');
  });

  test('fromHex with invalid input', () => {
    expect(() => hexToBytes('not a hex string')).toThrow();
    expect(() => hexToBytes('0102ZX')).toThrow();
  });

  test('fromHex with empty string', () => {
    expect(new Uint8Array(hexToBytes(''))).toEqual(new Uint8Array([]));
  });

  test('toHex with empty array', () => {
    expect(bytesToHex(new Uint8Array([]))).toEqual('');
  });

  test('roundtrip conversion', () => {
    const original = new Uint8Array([42, 255, 0, 127, 128]);
    const hex = bytesToHex(original);
    const converted = hexToBytes(hex);
    expect(new Uint8Array(converted)).toEqual(original);
  });
});

describe('concat', () => {
  test('concat multiple arrays', () => {
    const a1 = new Uint8Array([1, 2]);
    const a2 = new Uint8Array([3, 4, 5]);
    const a3 = new Uint8Array([6]);

    expect([...concat(a1, a2, a3)]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('concat with empty arrays', () => {
    const a1 = new Uint8Array([]);
    const a2 = new Uint8Array([1, 2]);
    const a3 = new Uint8Array([]);

    expect([...concat(a1, a2, a3)]).toEqual([1, 2]);
    expect([...concat(a1, a3)]).toEqual([]);
  });

  test('concat with no arrays', () => {
    expect([...concat()]).toEqual([]);
  });
});

describe('uint8FromBufLike', () => {
  test('from Uint8Array', () => {
    const original = new Uint8Array([1, 2, 3]);
    const result = uint8FromBufLike(original);
    expect(result).toBe(original); // Should return the same instance
  });

  test('from ArrayBuffer', () => {
    const buffer = new ArrayBuffer(3);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3]);

    const result = uint8FromBufLike(buffer);
    expect([...result]).toEqual([1, 2, 3]);
  });

  test('from array', () => {
    const array = [1, 2, 3];
    const result = uint8FromBufLike(array);
    expect([...result]).toEqual([1, 2, 3]);
  });

  test('from DataView', () => {
    const buffer = new ArrayBuffer(3);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3]);
    const dataView = new DataView(buffer);

    const result = uint8FromBufLike(dataView);
    expect([...result]).toEqual([1, 2, 3]);
  });

  test('from object with buffer', () => {
    const buffer = new ArrayBuffer(3);
    const view = new Uint8Array(buffer);
    view.set([1, 2, 3]);
    const obj = { buffer };

    const result = uint8FromBufLike(obj);
    expect([...result]).toEqual([1, 2, 3]);
  });
});

describe('compare', () => {
  test('equal arrays', () => {
    const a1 = new Uint8Array([1, 2, 3]);
    const a2 = new Uint8Array([1, 2, 3]);

    expect(compare(a1, a2)).toBe(0);
  });

  test('different length arrays', () => {
    const a1 = new Uint8Array([1, 2, 3]);
    const a2 = new Uint8Array([1, 2]);
    const a3 = new Uint8Array([1, 2, 3, 4]);

    expect(compare(a1, a2)).toBeGreaterThan(0);
    expect(compare(a2, a1)).toBeLessThan(0);
    expect(compare(a1, a3)).toBeLessThan(0);
  });

  test('same length but different content', () => {
    const a1 = new Uint8Array([1, 2, 3]);
    const a2 = new Uint8Array([1, 2, 4]);
    const a3 = new Uint8Array([1, 3, 2]);

    expect(compare(a1, a2)).toBeLessThan(0);
    expect(compare(a2, a1)).toBeGreaterThan(0);
    expect(compare(a1, a3)).toBeLessThan(0);
  });

  test('empty arrays', () => {
    const a1 = new Uint8Array([]);
    const a2 = new Uint8Array([]);

    expect(compare(a1, a2)).toBe(0);
  });
});

describe('uint8Equals', () => {
  test('equal arrays', () => {
    const a1 = new Uint8Array([1, 2, 3]);
    const a2 = new Uint8Array([1, 2, 3]);

    expect(uint8Equals(a1, a2)).toBe(true);
  });

  test('different arrays', () => {
    const a1 = new Uint8Array([1, 2, 3]);
    const a2 = new Uint8Array([1, 2, 4]);
    const a3 = new Uint8Array([1, 2]);

    expect(uint8Equals(a1, a2)).toBe(false);
    expect(uint8Equals(a1, a3)).toBe(false);
  });

  test('empty arrays', () => {
    const a1 = new Uint8Array([]);
    const a2 = new Uint8Array([]);

    expect(uint8Equals(a1, a2)).toBe(true);
  });
});

describe('uint8ToDataView', () => {
  test('convert Uint8Array to DataView', () => {
    const array = new Uint8Array([1, 2, 3, 4]);
    const view = uint8ToDataView(array);

    expect(view instanceof DataView).toBe(true);
    expect(view.byteLength).toBe(4);
    expect(view.getUint8(0)).toBe(1);
    expect(view.getUint8(1)).toBe(2);
    expect(view.getUint8(2)).toBe(3);
    expect(view.getUint8(3)).toBe(4);
  });

  test('with invalid input', () => {
    expect(() => uint8ToDataView('not a uint8array' as unknown as Uint8Array)).toThrow(
      'Input must be a Uint8Array',
    );
    expect(() => uint8ToDataView(null as unknown as Uint8Array)).toThrow(
      'Input must be a Uint8Array',
    );
  });

  test('with empty array', () => {
    const array = new Uint8Array([]);
    const view = uint8ToDataView(array);

    expect(view instanceof DataView).toBe(true);
    expect(view.byteLength).toBe(0);
  });

  test('with offset array', () => {
    const buffer = new ArrayBuffer(6);
    const array = new Uint8Array(buffer, 2, 3);
    array.set([1, 2, 3]);

    const view = uint8ToDataView(array);

    expect(view instanceof DataView).toBe(true);
    expect(view.byteLength).toBe(3);
    expect(view.getUint8(0)).toBe(1);
    expect(view.getUint8(1)).toBe(2);
    expect(view.getUint8(2)).toBe(3);
  });
});
