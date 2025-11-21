const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';

// Build a lookup table for decoding.
const lookupTable: Record<string, number> = Object.create(null);
for (let i = 0; i < alphabet.length; i++) {
  lookupTable[alphabet[i]] = i;
}

// Add aliases for rfc4648.
lookupTable['0'] = lookupTable.o;
lookupTable['1'] = lookupTable.i;

/**
 * @param input The Uint8Array to encode.
 * @returns A Base32 string encoding the input.
 */
export function base32Encode(input: Uint8Array): string {
  // How many bits will we skip from the first byte.
  let skip = 0;
  // 5 high bits, carry from one byte to the next.
  let bits = 0;

  // The output string in base32.
  let output = '';

  function encodeByte(byte: number) {
    if (skip < 0) {
      // we have a carry from the previous byte
      bits |= byte >> -skip;
    } else {
      // no carry
      bits = (byte << skip) & 248;
    }

    if (skip > 3) {
      // Not enough data to produce a character, get us another one
      skip -= 8;
      return 1;
    }

    if (skip < 4) {
      // produce a character
      output += alphabet[bits >> 3];
      skip += 5;
    }

    return 0;
  }

  for (let i = 0; i < input.length; ) {
    i += encodeByte(input[i]);
  }

  return output + (skip < 0 ? alphabet[bits >> 3] : '');
}

/**
 * @param input The base32 encoded string to decode.
 */
export function base32Decode(input: string): Uint8Array {
  // how many bits we have from the previous character.
  let skip = 0;
  // current byte we're producing.
  let byte = 0;

  const output = new Uint8Array(((input.length * 4) / 3) | 0);
  let o = 0;

  function decodeChar(char: string) {
    // Consume a character from the stream, store
    // the output in this.output. As before, better
    // to use update().
    let val = lookupTable[char.toLowerCase()];
    if (val === undefined) {
      throw new Error(`Invalid character: ${JSON.stringify(char)}`);
    }

    // move to the high bits
    val <<= 3;
    byte |= val >>> skip;
    skip += 5;

    if (skip >= 8) {
      // We have enough bytes to produce an output
      output[o++] = byte;
      skip -= 8;

      if (skip > 0) {
        byte = (val << (5 - skip)) & 255;
      } else {
        byte = 0;
      }
    }
  }

  for (const c of input) {
    decodeChar(c);
  }

  return output.slice(0, o);
}
