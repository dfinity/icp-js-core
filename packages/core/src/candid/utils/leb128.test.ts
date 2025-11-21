import { PipeArrayBuffer as Pipe } from './buffer.ts';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import {
  lebDecode,
  lebEncode,
  readIntLE,
  readUIntLE,
  slebDecode,
  slebEncode,
  writeIntLE,
  writeUIntLE,
} from './leb128.ts';

test('leb', () => {
  expect(bytesToHex(lebEncode(0))).toBe('00');
  expect(bytesToHex(lebEncode(7))).toBe('07');
  expect(bytesToHex(lebEncode(127))).toBe('7f');
  expect(() => lebEncode(-1)).toThrow();
  expect(bytesToHex(lebEncode(1))).toBe('01');
  expect(bytesToHex(lebEncode(624485))).toBe('e58e26');
  expect(bytesToHex(lebEncode(BigInt('0x1234567890abcdef1234567890abcdef')))).toBe(
    'ef9baf8589cf959a92deb7de8a929eabb424',
  );
  expect(bytesToHex(lebEncode(BigInt(2000000)))).toBe('80897a');
  expect(bytesToHex(lebEncode(BigInt(60000000000000000)))).toBe('808098f4e9b5ca6a');
  expect(bytesToHex(lebEncode(BigInt(60000000000000000)))).toBe('808098f4e9b5ca6a');

  expect(lebDecode(new Pipe(new Uint8Array([0])))).toBe(BigInt(0));
  expect(lebDecode(new Pipe(new Uint8Array([1])))).toBe(BigInt(1));
  expect(lebDecode(new Pipe(new Uint8Array([0xe5, 0x8e, 0x26])))).toBe(BigInt(624485));
  expect(lebDecode(new Pipe(hexToBytes('ef9baf8589cf959a92deb7de8a929eabb424'))).toString(16)).toBe(
    '1234567890abcdef1234567890abcdef',
  );
});

test('sleb', () => {
  expect(bytesToHex(slebEncode(-1))).toBe('7f');
  expect(bytesToHex(slebEncode(-123456))).toBe('c0bb78');
  expect(bytesToHex(slebEncode(42))).toBe('2a');
  expect(bytesToHex(slebEncode(BigInt('0x1234567890abcdef1234567890abcdef')))).toBe(
    'ef9baf8589cf959a92deb7de8a929eabb424',
  );
  expect(bytesToHex(slebEncode(-BigInt('0x1234567890abcdef1234567890abcdef')))).toBe(
    '91e4d0faf6b0eae5eda1c8a1f5ede1d4cb5b',
  );
  expect(bytesToHex(slebEncode(BigInt('2000000')))).toBe('8089fa00');
  expect(bytesToHex(slebEncode(BigInt('60000000000000000')))).toBe('808098f4e9b5caea00');

  expect(slebDecode(new Pipe(new Uint8Array([0x7f])))).toBe(BigInt(-1));
  expect(Number(slebDecode(new Pipe(new Uint8Array([0xc0, 0xbb, 0x78]))))).toBe(-123456);
  expect(slebDecode(new Pipe(new Uint8Array([0x2a])))).toBe(BigInt(42));
  expect(
    slebDecode(new Pipe(hexToBytes('91e4d0faf6b0eae5eda1c8a1f5ede1d4cb5b'))).toString(16),
  ).toBe('-1234567890abcdef1234567890abcdef');
  expect(slebDecode(new Pipe(hexToBytes('808098f4e9b5caea00'))).toString()).toBe(
    '60000000000000000',
  );
});

test('IntLE', () => {
  expect(bytesToHex(writeIntLE(42, 2))).toBe('2a00');
  expect(bytesToHex(writeIntLE(-42, 3))).toBe('d6ffff');
  expect(bytesToHex(writeIntLE(1234567890, 5))).toBe('d202964900');
  expect(bytesToHex(writeUIntLE(1234567890, 5))).toBe('d202964900');
  expect(bytesToHex(writeIntLE(-1234567890, 5))).toBe('2efd69b6ff');
  expect(readIntLE(new Pipe(hexToBytes('d202964900')), 5).toString()).toBe('1234567890');
  expect(readUIntLE(new Pipe(hexToBytes('d202964900')), 5).toString()).toBe('1234567890');
  expect(readIntLE(new Pipe(hexToBytes('2efd69b6ff')), 5).toString()).toBe('-1234567890');
  expect(readIntLE(new Pipe(hexToBytes('d6ffffffff')), 5).toString()).toBe('-42');
  expect(readUIntLE(new Pipe(hexToBytes('d6ffffffff')), 5).toString()).toBe('1099511627734');
});
