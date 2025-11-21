/**
 * Generates a random unsigned 32-bit integer between 0 and 0xffffffff
 * @returns {number} a random number
 */
export const randomNumber = (): number => {
  // determine whether browser crypto is available
  if (typeof window !== 'undefined' && !!window.crypto && !!window.crypto.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0];
  }
  // A second check for webcrypto, in case it is loaded under global instead of window
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0];
  }

  type nodeCrypto = {
    randomInt: (min: number, max: number) => number;
  };

  // determine whether node crypto is available
  if (typeof crypto !== 'undefined' && (crypto as unknown as nodeCrypto).randomInt) {
    return (crypto as unknown as nodeCrypto).randomInt(0, 0xffffffff);
  }

  // fall back to Math.random
  return Math.floor(Math.random() * 0xffffffff);
};
