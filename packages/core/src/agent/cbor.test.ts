import { Principal } from '#principal';
import { bytesToHex } from '@noble/hashes/utils';
import * as cbor from './cbor.ts';

test('round trip', () => {
  interface Data {
    a: number;
    b: string;
    c: Uint8Array;
    d: { four: string };
    e: Principal;
    f: Uint8Array;
    g: bigint;
  }

  const input: Data = {
    a: 1,
    b: 'two',
    c: new Uint8Array([3]),
    d: { four: 'four' },
    e: Principal.fromHex('FfFfFfFfFfFfFfFfd7'),
    f: new Uint8Array([]),
    g: BigInt('0xffffffffffffffff'),
  };

  const output = cbor.decode<Data>(cbor.encode(input));

  expect(output.a).toEqual(input.a);
  expect(output.b).toEqual(input.b);
  expect(output.c).toEqual(input.c);
  expect(output.d).toEqual(input.d);
  expect(output.e).toEqual(input.e.toUint8Array());
  expect(output.f).toEqual(input.f);
  expect(output.g).toEqual(input.g);
});

test('empty canister ID', () => {
  const input: { a: Principal } = {
    a: Principal.fromText('aaaaa-aa'),
  };

  const output = cbor.decode<typeof input>(cbor.encode(input));

  const inputA = input.a;
  const outputA = output.a;

  expect(bytesToHex(outputA as unknown as Uint8Array)).toBe(inputA.toHex());
  expect(Principal.fromUint8Array(outputA as unknown as Uint8Array).toText()).toBe('aaaaa-aa');
});
