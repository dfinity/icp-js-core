import { randomNumber } from './random.ts';
import { Crypto } from '@peculiar/webcrypto';
import { randomInt } from 'node:crypto';

const webcrypto = new Crypto();

function isInteger(num: number) {
  if (typeof num !== 'number') return false;
  if (isNaN(num)) return false;
  if (num % 1 !== 0) {
    return false;
  }
  if (num <= 0) {
    return false;
  }
  return true;
}

describe('randomNumber', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'crypto', {
      value: undefined,
      writable: true,
    });
    Object.defineProperty(global, 'window', {
      value: undefined,
      writable: true,
    });
  });

  it('should use window.crypto if available', () => {
    global.window = {
      crypto: {
        getRandomValues: webcrypto.getRandomValues,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const result = randomNumber();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(isInteger(result)).toBe(true);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
  it('should use globabl webcrypto if available', () => {
    global.crypto = {
      getRandomValues: webcrypto.getRandomValues,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const result = randomNumber();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(isInteger(result)).toBe(true);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
  it('should use node crypto if available', () => {
    global.crypto = {
      randomInt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const result = randomNumber();
    expect(isInteger(result)).toBe(true);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
  it('should use Math.random if nothing else is available', () => {
    const result = randomNumber();
    expect(isInteger(result)).toBe(true);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
});
