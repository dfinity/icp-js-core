/**
 * Concatenate multiple Uint8Arrays.
 * @param uint8Arrays The Uint8Arrays to concatenate.
 */
export function concat(...uint8Arrays: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(uint8Arrays.reduce((acc, curr) => acc + curr.byteLength, 0));
  let index = 0;
  for (const b of uint8Arrays) {
    result.set(b, index);
    index += b.byteLength;
  }
  return result;
}

/**
 * A class that abstracts a pipe-like Uint8Array.
 */
export class PipeArrayBuffer {
  /**
   * The reading view. It's a sliding window as we read and write, pointing to the buffer.
   * @private
   */
  private _view: Uint8Array;

  /**
   * Save a checkpoint of the reading view (for backtracking)
   */
  public save(): Uint8Array {
    return this._view;
  }

  /**
   * Restore a checkpoint of the reading view (for backtracking)
   * @param checkPoint a previously saved checkpoint
   */
  public restore(checkPoint: Uint8Array) {
    if (!(checkPoint instanceof Uint8Array)) {
      throw new Error('Checkpoint must be a Uint8Array');
    }
    this._view = checkPoint;
  }

  /**
   * The actual buffer containing the bytes.
   * @private
   */
  private _buffer: Uint8Array;

  /**
   * Creates a new instance of a pipe
   * @param buffer an optional buffer to start with
   * @param length an optional amount of bytes to use for the length.
   */
  constructor(buffer?: Uint8Array, length = buffer?.byteLength || 0) {
    if (buffer && !(buffer instanceof Uint8Array)) {
      try {
        buffer = uint8FromBufLike(buffer);
      } catch {
        throw new Error('Buffer must be a Uint8Array');
      }
    }
    if (length < 0 || !Number.isInteger(length)) {
      throw new Error('Length must be a non-negative integer');
    }
    if (buffer && length > buffer.byteLength) {
      throw new Error('Length cannot exceed buffer length');
    }
    this._buffer = buffer || new Uint8Array(0);
    this._view = new Uint8Array(this._buffer.buffer, 0, length);
  }

  get buffer(): Uint8Array {
    // Return a copy of the buffer.
    return this._view.slice();
  }

  get byteLength(): number {
    return this._view.byteLength;
  }

  /**
   * Read `num` number of bytes from the front of the pipe.
   * @param num The number of bytes to read.
   */
  public read(num: number): Uint8Array {
    const result = this._view.subarray(0, num);
    this._view = this._view.subarray(num);
    return result.slice();
  }

  public readUint8(): number | undefined {
    if (this._view.byteLength === 0) {
      return undefined;
    }
    const result = this._view[0];
    this._view = this._view.subarray(1);
    return result;
  }

  /**
   * Write a buffer to the end of the pipe.
   * @param buf The bytes to write.
   */
  public write(buf: Uint8Array): void {
    if (!(buf instanceof Uint8Array)) {
      throw new Error('Buffer must be a Uint8Array');
    }
    const offset = this._view.byteLength;
    if (this._view.byteOffset + this._view.byteLength + buf.byteLength >= this._buffer.byteLength) {
      // Alloc grow the view to include the new bytes.
      this.alloc(buf.byteLength);
    } else {
      // Update the view to include the new bytes.
      this._view = new Uint8Array(
        this._buffer.buffer,
        this._view.byteOffset,
        this._view.byteLength + buf.byteLength,
      );
    }

    this._view.set(buf, offset);
  }

  /**
   * Whether or not there is more data to read from the buffer
   */
  public get end(): boolean {
    return this._view.byteLength === 0;
  }

  /**
   * Allocate a fixed amount of memory in the buffer. This does not affect the view.
   * @param amount A number of bytes to add to the buffer.
   */
  public alloc(amount: number) {
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Amount must be a positive integer');
    }
    // Add a little bit of exponential growth.
    const b = new Uint8Array(((this._buffer.byteLength + amount) * 1.2) | 0);
    const v = new Uint8Array(b.buffer, 0, this._view.byteLength + amount);
    v.set(this._view);
    this._buffer = b;
    this._view = v;
  }
}

/**
 * Returns a true Uint8Array from an ArrayBufferLike object.
 * @param bufLike a buffer-like object
 * @returns Uint8Array
 */
export function uint8FromBufLike(
  bufLike:
    | ArrayBuffer
    | Uint8Array
    | DataView
    | ArrayBufferView
    | ArrayBufferLike
    | [number]
    | number[]
    | { buffer: ArrayBuffer },
): Uint8Array {
  if (!bufLike) {
    throw new Error('Input cannot be null or undefined');
  }

  if (bufLike instanceof Uint8Array) {
    return bufLike;
  }
  if (bufLike instanceof ArrayBuffer) {
    return new Uint8Array(bufLike);
  }
  if (Array.isArray(bufLike)) {
    return new Uint8Array(bufLike);
  }
  if ('buffer' in bufLike) {
    return uint8FromBufLike(bufLike.buffer);
  }
  return new Uint8Array(bufLike);
}

/**
 *
 * @param u1 uint8Array 1
 * @param u2 uint8Array 2
 * @returns number - negative if u1 < u2, positive if u1 > u2, 0 if u1 === u2
 */
export function compare(u1: Uint8Array, u2: Uint8Array): number {
  if (u1.byteLength !== u2.byteLength) {
    return u1.byteLength - u2.byteLength;
  }
  for (let i = 0; i < u1.length; i++) {
    if (u1[i] !== u2[i]) {
      return u1[i] - u2[i];
    }
  }
  return 0;
}

/**
 * Checks two uint8Arrays for equality.
 * @param u1 uint8Array 1
 * @param u2 uint8Array 2
 * @returns boolean
 */
export function uint8Equals(u1: Uint8Array, u2: Uint8Array): boolean {
  return compare(u1, u2) === 0;
}

/**
 * Helpers to convert a Uint8Array to a DataView.
 * @param uint8 Uint8Array
 * @returns DataView
 */
export function uint8ToDataView(uint8: Uint8Array): DataView {
  if (!(uint8 instanceof Uint8Array)) {
    throw new Error('Input must be a Uint8Array');
  }
  return new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
}
