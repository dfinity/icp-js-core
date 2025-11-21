import { PipeArrayBuffer, lebDecode } from '#candid';

const MILLISECOND_TO_NANOSECONDS = BigInt(1_000_000);

export const decodeLeb128 = (buf: Uint8Array): bigint => {
  return lebDecode(new PipeArrayBuffer(buf));
};

// time is a LEB128-encoded Nat
export const decodeTime = (buf: Uint8Array): Date => {
  const timestampNs = decodeLeb128(buf);
  const timestampMs = timestampNs / MILLISECOND_TO_NANOSECONDS;
  return new Date(Number(timestampMs));
};
