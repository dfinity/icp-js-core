import { IDL } from './index.ts';

/**
 * Decoder resource limits (ICPBB-426).
 *
 * A `vec` length and a record field count are attacker-controlled and
 * independent of the wire size, so a tiny reply can ask the decoder to
 * materialise an unbounded number of values. These are the messages that must
 * be rejected before anything is allocated.
 */

/**
 * Decode candid's `.did` test-fixture blob syntax: literal characters, with
 * `\xx` hex escapes.
 * @param lit the blob literal, verbatim from the fixture file
 */
function parseBlob(lit: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < lit.length; i++) {
    if (lit[i] === '\\') {
      out.push(parseInt(lit.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(lit.charCodeAt(i));
    }
  }
  return Uint8Array.from(out);
}

/**
 * Space-bomb and overshoot fixtures copied verbatim from the Candid spec test
 * suite (`dfinity/candid`, `test/spacebomb.test.did` and `test/overshoot.test.did`).
 *
 * Every one is asserted there as `!:` against the empty tuple, i.e. it must be
 * rejected. From the fixtures' own headers: "an implementation with
 * self-metering should reject these messages relatively early without going
 * through the whole deserialisation process", within "a memory limit of, say
 * 100MB".
 *
 * They decode against `()`, so they exercise the skip path -- where an
 * attacker's extra arguments land.
 */
const SPEC_SPACE_BOMBS: Array<[string, string]> = [
  // spacebomb.test.did: vec null (extra argument)
  ['vec null (extra argument)', 'DIDL\\01\\6d\\7f\\01\\00\\80\\94\\eb\\dc\\03'],
  // spacebomb.test.did: vec reserved (extra argument)
  ['vec reserved (extra argument)', 'DIDL\\01\\6d\\70\\01\\00\\80\\94\\eb\\dc\\03'],
  // spacebomb.test.did: zero-sized record (extra argument)
  [
    'zero-sized record (extra argument)',
    'DIDL\\04\\6c\\03\\00\\7f\\01\\01\\02\\02\\6c\\01\\00\\70\\6c\\00\\6d\\00\\01\\03\\80\\94\\eb\\dc\\03',
  ],
  // spacebomb.test.did: vec vec null (extra argument)
  [
    'vec vec null (extra argument)',
    'DIDL\\02\\6d\\01\\6d\\7f\\01\\00\\05\\ff\\ff\\3f\\ff\\ff\\3f\\ff\\ff\\3f\\ff\\ff\\3f\\ff\\ff\\3f',
  ],
  // spacebomb.test.did: vec record {} (extra argument)
  ['vec record {} (extra argument)', 'DIDL\\02\\6d\\01\\6c\\00\\01\\00\\80\\ad\\e2\\04'],
  // spacebomb.test.did: vec opt record with 2^20 null (extra argument)
  [
    'vec opt record with 2^20 null (extra argument)',
    'DIDL\\17\\6c\\02\\01\\7f\\02\\7f\\6c\\02\\01\\00\\02\\00\\6c\\02\\00\\01\\01\\01\\6c\\02\\00\\02\\01\\02\\6c\\02\\00\\03\\01\\03\\6c\\02\\00\\04\\01\\04\\6c\\02\\00\\05\\01\\05\\6c\\02\\00\\06\\01\\06\\6c\\02\\00\\07\\01\\07\\6c\\02\\00\\08\\01\\08\\6c\\02\\00\\09\\01\\09\\6c\\02\\00\\0a\\01\\0a\\6c\\02\\00\\0b\\01\\0b\\6c\\02\\00\\0c\\01\\0c\\6c\\02\\00\\0d\\02\\0d\\6c\\02\\00\\0e\\01\\0e\\6c\\02\\00\\0f\\01\\0f\\6c\\02\\00\\10\\01\\10\\6c\\02\\00\\11\\01\\11\\6c\\02\\00\\12\\01\\12\\6c\\02\\00\\13\\01\\13\\6e\\14\\6d\\15\\01\\16\\02\\01\\01',
  ],
  // overshoot.test.did: type table length
  ['type table length', 'DIDL\\80\\94\\eb\\dc\\03\\00'],
  // overshoot.test.did: argument sequence length
  ['argument sequence length', 'DIDL\\00\\80\\94\\eb\\dc\\03'],
  // overshoot.test.did: record field number
  ['record field number', 'DIDL\\01\\6c\\80\\94\\eb\\dc\\03\\00\\7f\\00\\7f'],
  // overshoot.test.did: variant field number
  ['variant field number', 'DIDL\\01\\6b\\80\\94\\eb\\dc\\03\\00\\7f\\00\\7f'],
  // overshoot.test.did: func arg length
  [
    'func arg length',
    'DIDL\\01\\6a\\68\\68\\68\\68\\68\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\68\\68\\68\\68\\68\\68\\00\\68\\68\\7a\\68\\68\\68\\68\\68\\68\\68\\68\\68\\68\\68\\68\\68\\68\\68\\79\\79\\79\\79\\79\\79\\79\\79\\79\\79\\79\\79\\79\\79\\79\\7a\\79\\79\\79\\79\\79\\79\\79\\79\\79\\7b\\79\\79\\79\\79\\79\\7f\\00\\79\\79\\79\\79\\79\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\00\\04\\00\\00\\00\\00\\01\\01\\68\\68\\1d\\00\\00\\00\\00\\00\\00\\00\\68\\1f\\00\\00\\00\\00\\00\\00\\00\\00\\68\\00\\44\\44\\44\\44\\44\\44\\49\\44\\4c\\00\\f7\\01\\7c\\80\\80\\80\\80\\80\\80\\80\\80\\ff\\ff\\ff\\ff\\80\\80\\80\\80\\80\\80\\80\\80\\ff\\ff\\ff\\ff\\80\\80\\80\\80\\80\\80\\80\\80\\80\\80\\80\\80\\49\\44\\4c\\01\\6c\\01\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\ff\\01',
  ],
  // overshoot.test.did: future type length
  ['future type length', 'DIDL\\01\\67\\80\\94\\eb\\dc\\03\\00\\00'],
  // overshoot.test.did: future value length
  ['future value length', 'DIDL\\01\\67\\00\\01\\00\\80\\94\\eb\\dc\\03\\00\\00'],
];

describe('candid spec conformance: space bombs are rejected', () => {
  it.each(SPEC_SPACE_BOMBS)('rejects %s', (_name, blob) => {
    expect(() => IDL.decode([], parseBlob(blob))).toThrow();
  });
});

describe('ICPBB-426: vector length is bounded', () => {
  it('rejects a 13-byte reply asking for a 10,000,000-element `vec null`', () => {
    const msg = Uint8Array.from([
      0x44, 0x49, 0x44, 0x4c, 0x01, 0x6d, 0x7f, 0x01, 0x00, 0x80, 0xad, 0xe2, 0x04,
    ]);
    expect(() => IDL.decode([IDL.Vec(IDL.Null)], msg)).toThrow(/allocation budget/);
  });

  it('rejects a `vec reserved` of length 2^31', () => {
    const msg = Uint8Array.from([
      0x44, 0x49, 0x44, 0x4c, 0x01, 0x6d, 0x70, 0x01, 0x00, 0x80, 0x80, 0x80, 0x80, 0x08,
    ]);
    expect(() => IDL.decode([IDL.Vec(IDL.Reserved)], msg)).toThrow(/allocation budget/);
  });

  it('rejects a length varint too large to be a safe integer', () => {
    // 200 continuation bytes: `Number(lebDecode(...))` yields `Infinity` here,
    // and the run is far below the `MAX_LEB_BYTES` cap on a single value.
    const varint = new Array(199).fill(0xff);
    const msg = Uint8Array.from([
      0x44,
      0x49,
      0x44,
      0x4c,
      0x01,
      0x6d,
      0x7f,
      0x01,
      0x00,
      ...varint,
      0x01,
    ]);
    expect(() => IDL.decode([IDL.Vec(IDL.Null)], msg)).toThrow(/Length out of range/);
  });

  it('rejects nested vectors that are quadratic in the message size', () => {
    // `vec (vec null)`, every inner length within the remaining byte count --
    // so a per-length bound does not catch this, only the global budget does.
    const leb = (n: number) => {
      const out: number[] = [];
      do {
        let byte = n & 0x7f;
        n >>>= 7;
        if (n) {
          byte |= 0x80;
        }
        out.push(byte);
      } while (n);
      return out;
    };
    const outer = 300;
    const body = [...leb(outer)];
    for (let i = 0; i < outer; i++) {
      body.push(...leb(2000));
    }
    const msg = Uint8Array.from([
      0x44,
      0x49,
      0x44,
      0x4c,
      0x02,
      0x6d,
      0x7f,
      0x6d,
      0x00,
      0x01,
      0x01,
      ...body,
    ]);
    expect(() => IDL.decode([IDL.Vec(IDL.Vec(IDL.Null))], msg)).toThrow(/allocation budget/);
  });

  it('rejects a record nesting that describes 2^20 leaves', () => {
    // The blowup here is the type table alone, with no `vec` length involved,
    // so charging only vector elements does not catch it.
    const bombs = SPEC_SPACE_BOMBS.filter(([name]) => name.includes('2^20'));
    expect(bombs).toHaveLength(1);
    for (const [, blob] of bombs) {
      expect(() => IDL.decode([], parseBlob(blob))).toThrow(/allocation budget/);
    }
  });
});

describe('ICPBB-426: fixed-width vectors are bounded by the buffer', () => {
  it('rejects an `Int32Array` pre-allocation from an unchecked length', () => {
    // length 2^30 with no payload bytes: `new Int32Array(len)` would be 4 GiB.
    const msg = Uint8Array.from([
      0x44, 0x49, 0x44, 0x4c, 0x01, 0x6d, 0x75, 0x01, 0x00, 0x80, 0x80, 0x80, 0x80, 0x04,
    ]);
    expect(() => IDL.decode([IDL.Vec(IDL.Int32)], msg)).toThrow(/end of buffer/);
  });

  it('errors rather than silently truncating a short `vec nat8`', () => {
    // Declares 10 bytes, supplies 2.
    const msg = Uint8Array.from([
      0x44, 0x49, 0x44, 0x4c, 0x01, 0x6d, 0x7b, 0x01, 0x00, 0x0a, 0x01, 0x02,
    ]);
    expect(() => IDL.decode([IDL.Vec(IDL.Nat8)], msg)).toThrow(/end of buffer/);
  });
});

describe('the budget does not reject legitimate payloads', () => {
  it.each([
    ['vec null', IDL.Vec(IDL.Null), [null, null, null]],
    ['vec reserved', IDL.Vec(IDL.Reserved), [null, null, null]],
    ['vec record {}', IDL.Vec(IDL.Record({})), [{}, {}, {}]],
    ['vec bool', IDL.Vec(IDL.Bool), [true, false, true]],
    ['vec text', IDL.Vec(IDL.Text), ['a', 'b']],
  ])('round-trips %s', (_name, type, value) => {
    const decoded = IDL.decode([type], IDL.encode([type], [value]))[0];
    expect(Array.from(decoded as ArrayLike<unknown>)).toEqual(value);
  });

  it.each([
    // The densest shapes that the budget actually charges: one charge per
    // payload byte for `vec bool`, two for a vector of single-field records.
    ['vec bool', IDL.Vec(IDL.Bool), () => new Array(200_000).fill(true)],
    [
      'vec (record {a:nat8})',
      IDL.Vec(IDL.Record({ a: IDL.Nat8 })),
      () => new Array(200_000).fill({ a: 1 }),
    ],
    ['vec (opt nat8)', IDL.Vec(IDL.Opt(IDL.Nat8)), () => new Array(200_000).fill([1])],
  ])('decodes 200k elements of %s', (_name, type, make) => {
    const decoded = IDL.decode([type], IDL.encode([type], [make()]))[0];
    expect((decoded as ArrayLike<unknown>).length).toBe(200_000);
  });

  it('decodes a large fixed-width vector without charging the budget', () => {
    const type = IDL.Vec(IDL.Nat16);
    const decoded = IDL.decode([type], IDL.encode([type], [new Array(200_000).fill(42)]))[0];
    expect((decoded as unknown as Uint16Array).length).toBe(200_000);
  });
});

describe('the budget is per-decode', () => {
  it('is released when a decode throws, so later decodes are unaffected', () => {
    const type = IDL.Vec(IDL.Null);
    const big = IDL.encode([type], [new Array(60_000).fill(null)]);

    expect(() =>
      IDL.decode([type], parseBlob('DIDL\\01\\6d\\7f\\01\\00\\80\\ad\\e2\\04')),
    ).toThrow();
    expect((IDL.decode([type], big)[0] as unknown[]).length).toBe(60_000);
  });

  it('does not accumulate across successive decodes', () => {
    const type = IDL.Vec(IDL.Null);
    const encoded = IDL.encode([type], [new Array(60_000).fill(null)]);
    for (let i = 0; i < 5; i++) {
      expect((IDL.decode([type], encoded)[0] as unknown[]).length).toBe(60_000);
    }
  });
});
