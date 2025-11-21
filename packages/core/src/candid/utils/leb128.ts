// Note: this file uses buffer-pipe, which on Node only, uses the Node Buffer
//       implementation, which isn't compatible with the NPM buffer package
//       which we use everywhere else. This means that we have to transform
//       one into the other, hence why every function that returns a Buffer
//       actually return `new Buffer(pipe.buffer)`.
// TODO: The best solution would be to have our own buffer type around
//       Uint8Array which is standard.
import { PipeArrayBuffer as Pipe } from './buffer.ts';
import { ilog2 } from './bigint-math.ts';

function eob(): never {
  throw new Error('unexpected end of buffer');
}

/**
 *
 * @param pipe Pipe from buffer-pipe
 * @param num number
 * @returns Uint8Array
 */
export function safeRead(pipe: Pipe, num: number): Uint8Array {
  if (pipe.byteLength < num) {
    eob();
  }
  return pipe.read(num);
}

/**
 * @param pipe - PipeArrayBuffer simulating buffer-pipe api
 */
export function safeReadUint8(pipe: Pipe): number {
  const byte = pipe.readUint8();
  if (byte === undefined) {
    eob();
  }
  return byte;
}

/**
 * Encode a positive number (or bigint) into a Buffer. The number will be floored to the
 * nearest integer.
 * @param value The number to encode.
 */
export function lebEncode(value: bigint | number): Uint8Array {
  if (typeof value === 'number') {
    value = BigInt(value);
  }

  if (value < BigInt(0)) {
    throw new Error('Cannot leb encode negative values.');
  }

  const byteLength = (value === BigInt(0) ? 0 : ilog2(value)) + 1;
  const pipe = new Pipe(new Uint8Array(byteLength), 0);
  while (true) {
    const i = Number(value & BigInt(0x7f));
    value /= BigInt(0x80);
    if (value === BigInt(0)) {
      pipe.write(new Uint8Array([i]));
      break;
    } else {
      pipe.write(new Uint8Array([i | 0x80]));
    }
  }

  return pipe.buffer;
}

/**
 * Decode a leb encoded buffer into a bigint. The number will always be positive (does not
 * support signed leb encoding).
 * @param pipe A Buffer containing the leb encoded bits.
 */
export function lebDecode(pipe: Pipe): bigint {
  let weight = BigInt(1);
  let value = BigInt(0);
  let byte;

  do {
    byte = safeReadUint8(pipe);
    value += BigInt(byte & 0x7f).valueOf() * weight;
    weight *= BigInt(128);
  } while (byte >= 0x80);

  return value;
}

/**
 * Encode a number (or bigint) into a Buffer, with support for negative numbers. The number
 * will be floored to the nearest integer.
 * @param value The number to encode.
 */
export function slebEncode(value: bigint | number): Uint8Array {
  if (typeof value === 'number') {
    value = BigInt(value);
  }

  const isNeg = value < BigInt(0);
  if (isNeg) {
    value = -value - BigInt(1);
  }
  const byteLength = (value === BigInt(0) ? 0 : ilog2(value)) + 1;
  const pipe = new Pipe(new Uint8Array(byteLength), 0);
  while (true) {
    const i = getLowerBytes(value);
    value /= BigInt(0x80);

    // prettier-ignore
    if (   ( isNeg && value === BigInt(0) && (i & 0x40) !== 0)
          || (!isNeg && value === BigInt(0) && (i & 0x40) === 0)) {
        pipe.write(new Uint8Array([i]));
        break;
      } else {
        pipe.write(new Uint8Array([i | 0x80]));
      }
  }

  function getLowerBytes(num: bigint): number {
    const bytes = num % BigInt(0x80);
    if (isNeg) {
      // We swap the bits here again, and remove 1 to do two's complement.
      return Number(BigInt(0x80) - bytes - BigInt(1));
    } else {
      return Number(bytes);
    }
  }
  return pipe.buffer;
}

/**
 * Decode a leb encoded buffer into a bigint. The number is decoded with support for negative
 * signed-leb encoding.
 * @param pipe A Buffer containing the signed leb encoded bits.
 */
export function slebDecode(pipe: Pipe): bigint {
  // Get the size of the buffer, then cut a buffer of that size.
  const pipeView = new Uint8Array(pipe.buffer);
  let len = 0;
  for (; len < pipeView.byteLength; len++) {
    if (pipeView[len] < 0x80) {
      // If it's a positive number, we reuse lebDecode.
      if ((pipeView[len] & 0x40) === 0) {
        return lebDecode(pipe);
      }
      break;
    }
  }

  const bytes = new Uint8Array(safeRead(pipe, len + 1));
  let value = BigInt(0);
  for (let i = bytes.byteLength - 1; i >= 0; i--) {
    value = value * BigInt(0x80) + BigInt(0x80 - (bytes[i] & 0x7f) - 1);
  }
  return -value - BigInt(1);
}

/**
 *
 * @param value bigint or number
 * @param byteLength number
 * @returns Uint8Array
 */
export function writeUIntLE(value: bigint | number, byteLength: number): Uint8Array {
  if (BigInt(value) < BigInt(0)) {
    throw new Error('Cannot write negative values.');
  }
  return writeIntLE(value, byteLength);
}

/**
 *
 * @param value - bigint or number
 * @param byteLength - number
 * @returns Uint8Array
 */
export function writeIntLE(value: bigint | number, byteLength: number): Uint8Array {
  value = BigInt(value);

  const pipe = new Pipe(new Uint8Array(Math.min(1, byteLength)), 0);
  let i = 0;
  let mul = BigInt(256);
  let sub = BigInt(0);
  let byte = Number(value % mul);
  pipe.write(new Uint8Array([byte]));
  while (++i < byteLength) {
    if (value < 0 && sub === BigInt(0) && byte !== 0) {
      sub = BigInt(1);
    }
    byte = Number((value / mul - sub) % BigInt(256));
    pipe.write(new Uint8Array([byte]));
    mul *= BigInt(256);
  }

  return pipe.buffer;
}

/**
 *
 * @param pipe Pipe from buffer-pipe
 * @param byteLength number
 * @returns bigint
 */
export function readUIntLE(pipe: Pipe, byteLength: number): bigint {
  if (byteLength <= 0 || !Number.isInteger(byteLength)) {
    throw new Error('Byte length must be a positive integer');
  }
  let val = BigInt(safeReadUint8(pipe));
  let mul = BigInt(1);
  let i = 0;
  while (++i < byteLength) {
    mul *= BigInt(256);
    const byte = BigInt(safeReadUint8(pipe));
    val = val + mul * byte;
  }
  return val;
}

/**
 *
 * @param pipe Pipe from buffer-pipe
 * @param byteLength number
 * @returns bigint
 */
export function readIntLE(pipe: Pipe, byteLength: number): bigint {
  if (byteLength <= 0 || !Number.isInteger(byteLength)) {
    throw new Error('Byte length must be a positive integer');
  }
  let val = readUIntLE(pipe, byteLength);
  const mul = BigInt(2) ** (BigInt(8) * BigInt(byteLength - 1) + BigInt(7));
  if (val >= mul) {
    val -= mul * BigInt(2);
  }
  return val;
}
