import { getCrc32 } from './getCrc.ts';

describe('crc', () => {
  it('works', () => {
    expect(getCrc32(new Uint8Array([]))).toBe(0);
    expect(getCrc32(new Uint8Array([1, 2, 3]))).toBe(0x55bc801d);
    expect(getCrc32(new Uint8Array([100, 99, 98, 1, 2, 3]))).toBe(0xc7e787f5);
  });
});
