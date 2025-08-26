/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * @jest-environment node
 */
import * as IDL from './idl.ts';
import { Principal } from '@dfinity/principal';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { idlLabelToId } from './utils/hash.ts';

function testEncode(typ: IDL.Type, val: any, hex: string, _str: string) {
  expect(bytesToHex(IDL.encode([typ], [val]))).toEqual(hex);
}

function testDecode(typ: IDL.Type, val: any, hex: string, _str: string) {
  expect(IDL.decode([typ], hexToBytes(hex))[0]).toEqual(val);
}

function testDecodeFail(typ: IDL.Type, hex: string, _str: string) {
  expect(() => IDL.decode([typ], hexToBytes(hex))[0]).toThrow();
}

function test_(typ: IDL.Type, val: any, hex: string, str: string) {
  testEncode(typ, val, hex, str);
  testDecode(typ, val, hex, str);
}

function test_args(typs: IDL.Type[], vals: any[], hex: string, _str: string) {
  expect(IDL.encode(typs, vals)).toEqual(hexToBytes(hex));
  expect(IDL.decode(typs, hexToBytes(hex))).toEqual(vals);
}

function hashedPropertyName(name: string) {
  return '_' + idlLabelToId(name) + '_';
}

test('IDL encoding (magic number)', () => {
  // Wrong magic number
  expect(() => IDL.decode([IDL.Nat], hexToBytes('2a'))).toThrow(
    /Message length smaller than magic number/,
  );
  expect(() => IDL.decode([IDL.Nat], hexToBytes('4449444d2a'))).toThrow(/Wrong magic number:/);
});

test('IDL encoding (empty)', () => {
  // Empty
  expect(() => IDL.encode([IDL.Empty], [undefined])).toThrow(/Invalid empty argument:/);
  expect(() => IDL.decode([IDL.Empty], hexToBytes('4449444c00016f'))).toThrow(
    /Empty cannot appear as an output/,
  );
});

test('IDL encoding (null)', () => {
  // Null
  test_(IDL.Null, null, '4449444c00017f', 'Null value');
});

test('IDL encoding (text)', () => {
  // Text
  test_(IDL.Text, 'Hi ☃\n', '4449444c00017107486920e298830a', 'Text with unicode');
  test_(
    IDL.Opt(IDL.Text),
    ['Hi ☃\n'],
    '4449444c016e7101000107486920e298830a',
    'Nested text with unicode',
  );
  expect(() => IDL.encode([IDL.Text], [0])).toThrow(/Invalid text argument/);
  expect(() => IDL.encode([IDL.Text], [null])).toThrow(/Invalid text argument/);
  expect(() =>
    IDL.decode([IDL.Vec(IDL.Nat8)], hexToBytes('4449444c00017107486920e298830a')),
  ).toThrow(/type mismatch: type on the wire text, expect type vec nat8/);
});

test('IDL encoding (int)', () => {
  // Int
  test_(IDL.Int, BigInt(0), '4449444c00017c00', 'Int');
  test_(IDL.Int, BigInt(42), '4449444c00017c2a', 'Int');
  test_(IDL.Int, BigInt(1234567890), '4449444c00017cd285d8cc04', 'Positive Int');
  test_(
    IDL.Int,
    BigInt('60000000000000000'),
    '4449444c00017c808098f4e9b5caea00',
    'Positive BigInt',
  );
  test_(IDL.Int, BigInt(-1234567890), '4449444c00017caefaa7b37b', 'Negative Int');
  test_(IDL.Opt(IDL.Int), [BigInt(42)], '4449444c016e7c0100012a', 'Nested Int');
  testEncode(IDL.Opt(IDL.Int), [42], '4449444c016e7c0100012a', 'Nested Int (number)');
  expect(() => IDL.decode([IDL.Int], hexToBytes('4449444c00017d2a'))).toThrow(
    /type mismatch: type on the wire nat, expect type int/,
  );
});

test('IDL encoding (nat)', () => {
  // Nat
  test_(IDL.Nat, BigInt(42), '4449444c00017d2a', 'Nat');
  test_(IDL.Nat, BigInt(0), '4449444c00017d00', 'Nat of 0');
  test_(IDL.Nat, BigInt(1234567890), '4449444c00017dd285d8cc04', 'Positive Nat');
  test_(IDL.Nat, BigInt('60000000000000000'), '4449444c00017d808098f4e9b5ca6a', 'Positive BigInt');
  testEncode(IDL.Opt(IDL.Nat), [42], '4449444c016e7d0100012a', 'Nested Nat (number)');
  expect(() => IDL.encode([IDL.Nat], [-1])).toThrow(/Invalid nat argument/);
});

test('IDL encoding (nat, large bigints)', () => {
  test_(
    IDL.Nat,
    BigInt(
      '402387260077093773543702433923003985719374864210714632543799910429938512398629020592044208486969404800479988610197196058631666872994808558901323829669944590997424504087073759918823627727188732519779505950995276120874975462497043601418278094646496291056393887437886487337119181045825783647849977012476632889835955735432513185323958463075557409114262417474349347553428646576611667797396668820291207379143853719588249808126867838374559731746136085379534524221586593201928090878297308431392844403281231558611036976801357304216168747609675871348312025478589320767169132448426236131412508780208000261683151027341827977704784635868170164365024153691398281264810213092761244896359928705114964975419909342221566832572080821333186116811553615836546984046708975602900950537616475847728421889679646244945160765353408198901385442487984959953319101723355556602139450399736280750137837615307127761926849034352625200015888535147331611702103968175921510907788019393178114194545257223865541461062892187960223838971476088506276862967146674697562911234082439208160153780889893964518263243671616762179168909779911903754031274622289988005195444414282012187361745992642956581746628302955570299024324153181617210465832036786906117260158783520751516284225540265170483304226143974286933061690897968482590125458327168226458066526769958652682272807075781391858178889652208164348344825993266043367660176999612831860788386150279465955131156552036093988180612138558600301435694527224206344631797460594682573103790084024432438465657245014402821885252470935190620929023136493273497565513958720559654228749774011413346962715422845862377387538230483865688976461927383814900140767310446640259899490222221765904339901886018566526485061799702356193897017860040811889729918311021171229845901641921068884387121855646124960798722908519296819372388642614839657382291123125024186649353143970137428531926649875337218940694281434118520158014123344828015051399694290153483077644569099073152433278288269864602789864321139083506217095002597389863554277196742822248757586765752344220207573630569498825087968928162753848863396909959826280956121450994871701244516461260379029309120889086942028510640182154399457156805941872748998094254742173582401063677404595741785160829230135358081840096996372524230560855903700624271243416909004153690105933983835777939410970027753472000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    ),
    '4449444c00017d80808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080808080e9b3b3c1a0afcba695f18db2af90b6bff8cca0dbc5b585a4b1b490d8a3fcfe89ddcfce8997dadbe7b7f7ea9dc2e4c0f593ef949ea5bbe9a0e6a9aafe8988b0aee6a28ef4b8e7f097ddfdabed88c988c1b3a48b9eab8f95acd4f5ddadd599a9daf9c9c1a88c89babdf8ebc7caa6b5faccaab9f4e0ace5acbbc3e9cbf3d1e2f5bc95cee9f481d3ce83e799f58dc78195a38bb285d3dfa892e199bb93a1be9fdff999bddea9cabef4dfe9a1bab7f096ecbbf6b0fea4c4a7dfbeefe8aee2838b8bf7efc9d6ed8da5c483bff2f7bed1b690bad5aeccbcb6c9f8def1e59db1f7ef87e1afb0bbb086a3a2a3eef2f5cb94bbba9fe093c2b7dcdf8fe8c4eaa4b2aee4af9fefc6fb84c18ffd9ad4abaead9ab8fdadeecbf187a99d85a9b1e8e4d1cee4eab3ddc180da95dd8de6d6d496e0d9bdfeb697e1f0bcb0b986d091b18fa69ea1dbf79b9ebecab1c7c2b0c4a1c5b9d4b4e8e887c6f5e7c3b485d1f5f7b493d5ba90daaef9ce8dc4f9a48589b99ef8d4e189a39c9099eee988d8a2d9d0d791aecf99b5aae0ca8ff2b2e89a99f5a5d4f6dddc81d7e183dcdcbbf3cdfbe7a7a0dbb2f880adebd0bbc1a3dce88faec1bf95acc7aefbe2b2daea9bc7addbfb9cf2fde6b28b8794ed86a2c0a7df8edaf2a6a6c5ecfddba5f5d2cad2cdd8f5b0b885cef2dfddafdbb5f7fccfefa2a6bdb2d2b394d2d7d58185ceb3bcb8a6e6d8a1fbfa99bcb9fdbaebc7d4b08d94ce96f9ec99e08f96d6cdb791f191c59dc3ef94b694f9caabc482a6eaf4a7a9e9b6d4a2cdc7e2a2b4ea81dec4848ce0c8bb83c4fdfa8db3e980ca9a8adb83ddcdb9d6cccaa6a191a3c1b9f2e398a8b1a0d684eecfc2e690b98892e2ebe3abe2f0db88f7a9ab97a5fdece5af9affc487aed4ead1cffae0c295e9bccddbc8adbea4dff98b9f8f87d99aa5afa9e8c5f7d094adbfcafbc3cfa9f3d9f580ddc7eca7a6dec3d8a0dcb59993b4c9e0cbf38cb195c2bfa0b7ecc08be1faddecf08a9ba09eacfe82c6a7fbe7c1bec19ac18cdabfda8c8f9fb796fef0a1c0e7d6e6a3d098fba9d4b3b2efb7e39789b9c1a2f999e7b1c289ebc4da8bb9d6c4e2dcc488deb3f4c2bd9cbe9bc7aaf0a0f2a0f9a2dbd5c4bf84fcd195f2b9d79a9bf3bb80d7a6f2c68fdb9db5f4f7eeebb4effb85d8dea5aaf68afee6a68497dab9decac3a0b4c58bdee0c0c5889fb9affed4c4feaab8b5afd5a58f92fbbad2a4a5e6a1f6c6f1c1f7d1d5e2be94fe90e4e6a8afce9487f5faf5c29082a999d7c3d183909e85b0d8faafefdfabdbc1f4d8d2e7d080d1cea286a495f298968d9984e48b879689e1afa8b0a68b90b8e5aaeaf182f5869ea7d3e3c1c1bee2db93f2afc5f0cc9b9dc882fab5fddedcc6a0eac6abc1b7ca81e7c6d79991f5f9e982adf8aaa786c2d8daddc9c1df8af6e59cd699e49188a0f5b9e99ae19eeec9ecbddac6d78eeaea898f9ccdcfedb6c48ba3c6b0a2f3d9edc4a4caaf8eb6b5c98ab4c58af3eebae3fe91e58ab7de81ddcd96f1ccb9a7c50a',
    'Large BigInt 1',
  );
  test_(
    IDL.Nat,
    BigInt(
      '1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    ),
    '4449444c00017d8080808080808080808080808080808080808080808080808080808080808080808080808080808080808080eac1b8dab1e798c2ed9a9adaf98ab6fcdf9bb6a7b78987fd8f97ca98ea9d93bc93a4c08dcd86cb96fdcfdaefb29b96ad8594b7bc9094ffa8ea88c683a6eb8ddd9898edf4e8abacc59f95c1a2b5f690be92d2f4bed3bda2f9a8e598cbe6b2ee8febb5f68c8ca016',
    'Large BigInt 2',
  );

  test_(
    IDL.Nat,
    BigInt(
      '100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    ),
    '4449444c00017d8080808080808080808080808080808080808080808080808080808080808080808080808080808080808080b1d385c9def0e8f98ae9b5afbfe7ebb296e9abaa92f4f3b28ecfba82b1a9e892b5d0f9da87a7d4a899bbafbeab9cc2c480c28586e88ef3d08ab4ad80f7fddaefe8a8f1becab7c4e0dcdbb9c3b8a59b86b5bbd8acc8eca9bfaabdc287d79efea7e4eb8bcee79c02',
    'Large BigInt that fits a JS number',
  );
});

test('IDL encoding (float64)', () => {
  // Float64
  test_(IDL.Float64, 3, '4449444c0001720000000000000840', 'Float');
  test_(IDL.Float64, 6, '4449444c0001720000000000001840', 'Float');
  test_(IDL.Float64, 0.5, '4449444c000172000000000000e03f', 'Float');
  test_(IDL.Float64, Number.NaN, '4449444c000172000000000000f87f', 'NaN');
  testDecode(IDL.Float64, Number.NaN, '4449444c000172010000000000f07f', 'NaN');
  test_(IDL.Float64, Number.POSITIVE_INFINITY, '4449444c000172000000000000f07f', '+infinity');
  test_(IDL.Float64, Number.NEGATIVE_INFINITY, '4449444c000172000000000000f0ff', '-infinity');
  test_(IDL.Float64, Number.EPSILON, '4449444c000172000000000000b03c', 'eps');
  test_(IDL.Float64, Number.MIN_VALUE, '4449444c0001720100000000000000', 'min_value');
  test_(IDL.Float64, Number.MAX_VALUE, '4449444c000172ffffffffffffef7f', 'max_value');
  test_(IDL.Float64, Number.MIN_SAFE_INTEGER, '4449444c000172ffffffffffff3fc3', 'min_safe_integer');
  test_(IDL.Float64, Number.MAX_SAFE_INTEGER, '4449444c000172ffffffffffff3f43', 'max_safe_integer');
});

test('IDL encoding (fixed-width number)', () => {
  // Fixed-width number
  test_(IDL.Int8, 0, '4449444c00017700', 'Int8');
  test_(IDL.Int8, -1, '4449444c000177ff', 'Int8');
  test_(IDL.Int8, 42, '4449444c0001772a', 'Int8');
  test_(IDL.Int8, 127, '4449444c0001777f', 'Int8');
  test_(IDL.Int8, -128, '4449444c00017780', 'Int8');
  test_(IDL.Int32, 42, '4449444c0001752a000000', 'Int32');
  test_(IDL.Int32, -42, '4449444c000175d6ffffff', 'Negative Int32');
  test_(IDL.Int32, 1234567890, '4449444c000175d2029649', 'Positive Int32');
  test_(IDL.Int32, -1234567890, '4449444c0001752efd69b6', 'Negative Int32');
  test_(IDL.Int32, -0x7fffffff, '4449444c00017501000080', 'Negative Int32');
  test_(IDL.Int32, 0x7fffffff, '4449444c000175ffffff7f', 'Positive Int32');
  test_(IDL.Int64, BigInt(42), '4449444c0001742a00000000000000', 'Int64');
  test_(IDL.Int64, BigInt(-42), '4449444c000174d6ffffffffffffff', 'Int64');
  test_(IDL.Int64, BigInt(1234567890), '4449444c000174d202964900000000', 'Positive Int64');
  test_(IDL.Nat8, 42, '4449444c00017b2a', 'Nat8');
  test_(IDL.Nat8, 0, '4449444c00017b00', 'Nat8');
  test_(IDL.Nat8, 255, '4449444c00017bff', 'Nat8');
  test_(IDL.Nat32, 0, '4449444c00017900000000', 'Nat32');
  test_(IDL.Nat32, 42, '4449444c0001792a000000', 'Nat32');
  test_(IDL.Nat32, 0xffffffff, '4449444c000179ffffffff', 'Nat32');
  test_(IDL.Nat64, BigInt(1234567890), '4449444c000178d202964900000000', 'Positive Nat64');
  expect(() => IDL.encode([IDL.Nat32], [-42])).toThrow(/Invalid nat32 argument/);
  expect(() => IDL.encode([IDL.Int8], [256])).toThrow(/Invalid int8 argument/);
  expect(() => IDL.encode([IDL.Int32], [0xffffffff])).toThrow(/Invalid int32 argument/);
});

test('IDL encoding (tuple)', () => {
  // Tuple
  test_(
    IDL.Tuple(IDL.Int, IDL.Text),
    [BigInt(42), '💩'],
    '4449444c016c02007c017101002a04f09f92a9',
    'Pairs',
  );
  expect(() => IDL.encode([IDL.Tuple(IDL.Int, IDL.Text)], [[0]])).toThrow(
    /Invalid record {int; text} argument/,
  );
});

test('IDL encoding (arraybuffer)', () => {
  test_(
    IDL.Vec(IDL.Nat8),
    new Uint8Array([0, 1, 2, 3]),
    '4449444c016d7b01000400010203',
    'Array of Nat8s',
  );
  test_(
    IDL.Vec(IDL.Int8),
    new Int8Array([0, 1, 2, 3]),
    '4449444c016d7701000400010203',
    'Array of Int8s',
  );
  test_(
    IDL.Vec(IDL.Int16),
    new Int16Array([0, 0, 1, 0, 2, 0, 3, 0, 255, 127, 255, 255]),
    '4449444c016d7601000c00000000010000000200000003000000ff007f00ff00ff00',
    'Array of Int16s',
  );
  test_(
    IDL.Vec(IDL.Nat64),
    new BigUint64Array([BigInt(0), BigInt(1), BigInt(1) << BigInt(60), BigInt(13)]),
    '4449444c016d780100040000000000000000010000000000000000000000000000100d00000000000000',
    'Array of Nat64s',
  );
  IDL.encode([IDL.Vec(IDL.Nat8)], [new Uint8Array()]);
  IDL.encode([IDL.Vec(IDL.Nat8)], [new Uint8Array(100).fill(42)]);
  IDL.encode([IDL.Vec(IDL.Nat16)], [new Uint16Array(200).fill(42)]);
  expect(() => IDL.encode([IDL.Vec(IDL.Int8)], [new Uint16Array(10).fill(420)])).toThrow(
    /Invalid vec int8 argument/,
  );
});

test('IDL encoding (array)', () => {
  // Array
  test_(
    IDL.Vec(IDL.Int),
    [0, 1, 2, 3].map(x => BigInt(x)),
    '4449444c016d7c01000400010203',
    'Array of Ints',
  );
  IDL.encode([IDL.Vec(IDL.Nat16)], [new Array(200000).fill(42)]);
  expect(() => IDL.encode([IDL.Vec(IDL.Int)], [BigInt(0)])).toThrow(/Invalid vec int argument/);
  expect(() => IDL.encode([IDL.Vec(IDL.Int)], [['fail']])).toThrow(/Invalid vec int argument/);
});

test('IDL encoding (array + tuples)', () => {
  // Array of Tuple
  test_(
    IDL.Vec(IDL.Tuple(IDL.Int, IDL.Text)),
    [[BigInt(42), 'text']],
    '4449444c026c02007c01716d000101012a0474657874',
    'Arr of Tuple',
  );

  // Nested Tuples
  test_(
    IDL.Tuple(IDL.Tuple(IDL.Tuple(IDL.Tuple(IDL.Null)))),
    [[[[null]]]],
    '4449444c046c01007f6c0100006c0100016c0100020103',
    'Nested Tuples',
  );
});

test('IDL encoding (record)', () => {
  // Record
  test_(IDL.Record({}), {}, '4449444c016c000100', 'Empty record');
  expect(() => IDL.encode([IDL.Record({ a: IDL.Text })], [{ b: 'b' }])).toThrow(
    /Record is missing key/,
  );

  // Test that additional keys are ignored
  testEncode(
    IDL.Record({ foo: IDL.Text, bar: IDL.Int }),
    { foo: '💩', bar: BigInt(42), baz: BigInt(0) },
    '4449444c016c02d3e3aa027c868eb7027101002a04f09f92a9',
    'Record',
  );
  testEncode(
    IDL.Record({ foo: IDL.Text, bar: IDL.Int }),
    { foo: '💩', bar: 42 },
    '4449444c016c02d3e3aa027c868eb7027101002a04f09f92a9',
    'Record',
  );
});

test('IDL decoding (skip fields)', () => {
  testDecode(
    IDL.Record({ a: IDL.Opt(IDL.Text) }),
    { a: [] },
    '4449444c016c000100',
    'optional field',
  );
  testDecode(
    IDL.Record({ foo: IDL.Text, bar: IDL.Int }),
    { foo: '💩', bar: BigInt(42) },
    '4449444c016c04017f027ed3e3aa027c868eb702710100012a04f09f92a9',
    'ignore record fields',
  );
  testDecode(
    IDL.Variant({ ok: IDL.Text, err: IDL.Text }),
    { ok: 'good' },
    '4449444c016b03017e9cc20171e58eb4027101000104676f6f64',
    'adjust variant index',
  );
  const recordType = IDL.Record({ foo: IDL.Int32, bar: IDL.Bool });
  const recordValue = { foo: 42, bar: true };
  test_(
    IDL.Record({ foo: IDL.Int32, bar: recordType, baz: recordType, bib: recordType }),
    { foo: 42, bar: recordValue, baz: recordValue, bib: recordValue },
    '4449444c026c02d3e3aa027e868eb702756c04d3e3aa0200dbe3aa0200bbf1aa0200868eb702750101012a000000012a000000012a0000002a000000',
    'nested record',
  );
  testDecode(
    IDL.Record({ baz: IDL.Record({ foo: IDL.Int32 }) }),
    { baz: { foo: 42 } },
    '4449444c026c02d3e3aa027e868eb702756c04d3e3aa0200dbe3aa0200bbf1aa0200868eb702750101012a000000012a000000012a0000002a000000',
    'skip nested fields',
  );
});

test('IDL encoding (numbered record)', () => {
  // Record
  test_(
    IDL.Record({ _0_: IDL.Int8, _1_: IDL.Bool }),
    { _0_: 42, _1_: true },
    '4449444c016c020077017e01002a01',
    'Numbered record',
  );
  // Test Tuple and numbered record are exact the same
  test_(IDL.Tuple(IDL.Int8, IDL.Bool), [42, true], '4449444c016c020077017e01002a01', 'Tuple');
  test_(
    IDL.Tuple(IDL.Tuple(IDL.Int8, IDL.Bool), IDL.Record({ _0_: IDL.Int8, _1_: IDL.Bool })),
    [[42, true], { _0_: 42, _1_: true }],
    '4449444c026c020077017e6c020000010001012a012a01',
    'Tuple and Record',
  );
  test_(
    IDL.Record({ _2_: IDL.Int8, 2: IDL.Bool }),
    { _2_: 42, 2: true },
    '4449444c016c020277327e01002a01',
    'Mixed record',
  );
});

test('IDL encoding (bool)', () => {
  // Bool
  test_(IDL.Bool, true, '4449444c00017e01', 'true');
  test_(IDL.Bool, false, '4449444c00017e00', 'false');
  expect(() => IDL.encode([IDL.Bool], [0])).toThrow(/Invalid bool argument/);
  expect(() => IDL.encode([IDL.Bool], ['false'])).toThrow(/Invalid bool argument/);
});

test('IDL encoding (principal)', () => {
  // Principal
  test_(
    IDL.Principal,
    Principal.fromText('w7x7r-cok77-xa'),
    '4449444c0001680103caffee',
    'principal',
  );
  test_(
    IDL.Principal,
    Principal.fromText('2chl6-4hpzw-vqaaa-aaaaa-c'),
    '4449444c0001680109efcdab000000000001',
    'principal',
  );
  expect(() => IDL.encode([IDL.Principal], ['w7x7r-cok77-xa'])).toThrow(
    /Invalid principal argument/,
  );
  expect(() => IDL.decode([IDL.Principal], hexToBytes('4449444c00016803caffee'))).toThrow(
    /Cannot decode principal/,
  );
});

test('IDL encoding (function)', () => {
  // Function
  test_(
    IDL.Func([IDL.Text], [IDL.Nat], []),
    [Principal.fromText('w7x7r-cok77-xa'), 'foo'],
    '4449444c016a0171017d000100010103caffee03666f6f',
    'function',
  );
  test_(
    IDL.Func([IDL.Text], [IDL.Nat], ['query']),
    [Principal.fromText('w7x7r-cok77-xa'), 'foo'],
    '4449444c016a0171017d01010100010103caffee03666f6f',
    'query function',
  );
  test_(
    IDL.Func([IDL.Text], [IDL.Nat], ['composite_query']),
    [Principal.fromText('w7x7r-cok77-xa'), 'foo'],
    '4449444c016a0171017d01030100010103caffee03666f6f',
    'composite_query function',
  );
});

test('IDL encoding (service)', () => {
  // Service
  test_(
    IDL.Service({ foo: IDL.Func([IDL.Text], [IDL.Nat], []) }),
    Principal.fromText('w7x7r-cok77-xa'),
    '4449444c026a0171017d00690103666f6f0001010103caffee',
    'service',
  );
  testDecode(
    IDL.Service({ foo: IDL.Func([IDL.Text], [IDL.Nat], []) }),
    Principal.fromText('w7x7r-cok77-xa'),
    // didc encode -t "(service { foo : (text) -> (nat) })" "(service \"w7x7r-cok77-xa\")"
    '4449444c02690103666f6f016a0171017d0001000103caffee',
    'service',
  );
  test_(
    IDL.Service({ foo: IDL.Func([IDL.Text], [IDL.Nat], ['query']) }),
    Principal.fromText('w7x7r-cok77-xa'),
    '4449444c026a0171017d0101690103666f6f0001010103caffee',
    'service',
  );
  test_(
    IDL.Service({ foo: IDL.Func([IDL.Text], [IDL.Nat], ['composite_query']) }),
    Principal.fromText('w7x7r-cok77-xa'),
    '4449444c026a0171017d0103690103666f6f0001010103caffee',
    'service',
  );
  test_(
    IDL.Service({
      foo: IDL.Func([IDL.Text], [IDL.Nat], []),
      foo2: IDL.Func([IDL.Text], [IDL.Nat], []),
    }),
    Principal.fromText('w7x7r-cok77-xa'),
    '4449444c026a0171017d00690203666f6f0004666f6f320001010103caffee',
    'service',
  );
});

test('IDL encoding (variants)', () => {
  // Variants
  const Result = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
  test_(Result, { ok: 'good' }, '4449444c016b029cc20171e58eb4027101000004676f6f64', 'Result ok');
  test_(Result, { err: 'uhoh' }, '4449444c016b029cc20171e58eb402710100010475686f68', 'Result err');
  expect(() => IDL.encode([Result], [{}])).toThrow(/Invalid variant {ok:text; err:text} argument/);
  expect(() => IDL.encode([Result], [{ ok: 'ok', err: 'err' }])).toThrow(
    /Invalid variant {ok:text; err:text} argument/,
  );

  // Test that nullary constructors work as expected
  test_(
    IDL.Variant({ foo: IDL.Null }),
    { foo: null },
    '4449444c016b01868eb7027f010000',
    'Nullary constructor in variant',
  );

  // Test that Empty within variants works as expected
  test_(
    IDL.Variant({ ok: IDL.Text, err: IDL.Empty }),
    { ok: 'good' },
    '4449444c016b029cc20171e58eb4026f01000004676f6f64',
    'Empty within variants',
  );
  expect(() =>
    IDL.encode([IDL.Variant({ ok: IDL.Text, err: IDL.Empty })], [{ err: 'uhoh' }]),
  ).toThrow(/Invalid variant {ok:text; err:empty} argument:/);

  // Test for option
  test_(IDL.Opt(IDL.Nat), [], '4449444c016e7d010000', 'None option');
  test_(IDL.Opt(IDL.Nat), [BigInt(1)], '4449444c016e7d01000101', 'Some option');
  test_(IDL.Opt(IDL.Opt(IDL.Nat)), [[BigInt(1)]], '4449444c026e7d6e000101010101', 'Nested option');
  test_(IDL.Opt(IDL.Opt(IDL.Null)), [[null]], '4449444c026e7f6e0001010101', 'Null option');

  // Type description sharing
  test_(
    IDL.Tuple(IDL.Vec(IDL.Int), IDL.Vec(IDL.Nat), IDL.Vec(IDL.Int), IDL.Vec(IDL.Nat)),
    [[], [], [], []],
    '4449444c036d7c6d7d6c040000010102000301010200000000',
    'Type sharing',
  );
});

test('IDL encoding (rec)', () => {
  // Test for recursive types
  const List = IDL.Rec();
  expect(() => IDL.encode([List], [[]])).toThrow(/Recursive type uninitialized/);
  List.fill(IDL.Opt(IDL.Record({ head: IDL.Int, tail: List })));
  test_(List, [], '4449444c026e016c02a0d2aca8047c90eddae70400010000', 'Empty list');
  test_(
    List,
    [{ head: BigInt(1), tail: [{ head: BigInt(2), tail: [] }] }],
    '4449444c026e016c02a0d2aca8047c90eddae7040001000101010200',
    'List',
  );

  // Mutual recursion
  const List1 = IDL.Rec();
  const List2 = IDL.Rec();
  List1.fill(IDL.Opt(List2));
  List2.fill(IDL.Record({ head: IDL.Int, tail: List1 }));
  test_(List1, [], '4449444c026e016c02a0d2aca8047c90eddae70400010000', 'Empty list');
  test_(
    List1,
    [{ head: BigInt(1), tail: [{ head: BigInt(2), tail: [] }] }],
    '4449444c026e016c02a0d2aca8047c90eddae7040001000101010200',
    'List',
  );
});

test('IDL encoding (multiple arguments)', () => {
  const Result = IDL.Variant({ ok: IDL.Text, err: IDL.Text });

  // Test for multiple arguments
  test_args(
    [IDL.Nat, IDL.Opt(IDL.Text), Result],
    [BigInt(42), ['test'], { ok: 'good' }],
    '4449444c026e716b029cc20171e58eb40271037d00012a0104746573740004676f6f64',
    'Multiple arguments',
  );
  test_args([], [], '4449444c0000', 'empty args');
});

test('Stringify bigint', () => {
  expect(() => IDL.encode([IDL.Nat], [{ x: BigInt(42) }])).toThrow(/Invalid nat argument/);
});

test('decode / encode unknown variant', () => {
  const decodedType = IDL.Variant({ _24860_: IDL.Text, _5048165_: IDL.Text });
  const encoded = '4449444c016b029cc20171e58eb4027101000004676f6f64';

  const value = IDL.decode([IDL.Unknown], hexToBytes(encoded))[0] as any;
  expect(value[hashedPropertyName('ok')]).toEqual('good');
  expect(value.type()).toEqual(decodedType);

  const reencoded = bytesToHex(IDL.encode([value.type()], [value]));
  expect(reencoded).toEqual(encoded);
});

test('throw on serializing unknown', () => {
  expect(() => IDL.encode([IDL.Unknown], ['test'])).toThrow('Unknown cannot be serialized');
});

test('decode unknown text', () => {
  const text = IDL.decode([IDL.Unknown], hexToBytes('4449444c00017107486920e298830a'))[0] as any;
  expect(text.valueOf()).toEqual('Hi ☃\n');
  expect(text.type().name).toEqual(IDL.Text.name);
});

test('decode unknown int', () => {
  const int = IDL.decode([IDL.Unknown], hexToBytes('4449444c00017c2a'))[0] as any;
  expect(int.valueOf()).toEqual(BigInt(42));
  expect(int.type().name).toEqual(IDL.Int.name);
});

test('decode unknown nat', () => {
  const nat = IDL.decode([IDL.Unknown], hexToBytes('4449444c00017d2a'))[0] as any;
  expect(nat.valueOf()).toEqual(BigInt(42));
  expect(nat.type().name).toEqual(IDL.Nat.name);
});

test('decode unknown null', () => {
  const value = IDL.decode([IDL.Unknown], hexToBytes('4449444c00017f'))[0] as any;
  // expect(value.valueOf()).toEqual(null); TODO: This does not hold. What do we do about this?
  expect(value.type().name).toEqual(IDL.Null.name);
});

test('decode unknown bool', () => {
  const value = IDL.decode([IDL.Unknown], hexToBytes('4449444c00017e01'))[0] as any;
  expect(value.valueOf()).toEqual(true);
  expect(value.type().name).toEqual(IDL.Bool.name);
});

test('decode unknown fixed-width number', () => {
  const int8 = IDL.decode([IDL.Unknown], hexToBytes('4449444c0001777f'))[0] as any;
  expect(int8.valueOf()).toEqual(127);
  expect(int8.type().name).toEqual(IDL.Int8.name);

  const int32 = IDL.decode([IDL.Unknown], hexToBytes('4449444c000175d2029649'))[0] as any;
  expect(int32.valueOf()).toEqual(1234567890);
  expect(int32.type().name).toEqual(IDL.Int32.name);

  const int64 = IDL.decode([IDL.Unknown], hexToBytes('4449444c0001742a00000000000000'))[0] as any;
  expect(int64.valueOf()).toEqual(BigInt(42));
  expect(int64.type().name).toEqual(IDL.Int64.name);

  const nat8 = IDL.decode([IDL.Unknown], hexToBytes('4449444c00017b2a'))[0] as any;
  expect(nat8.valueOf()).toEqual(42);
  expect(nat8.type().name).toEqual(IDL.Nat8.name);

  const nat32 = IDL.decode([IDL.Unknown], hexToBytes('4449444c0001792a000000'))[0] as any;
  expect(nat32.valueOf()).toEqual(42);
  expect(nat32.type().name).toEqual(IDL.Nat32.name);

  const nat64 = IDL.decode([IDL.Unknown], hexToBytes('4449444c000178d202964900000000'))[0] as any;
  expect(nat64.valueOf()).toEqual(BigInt(1234567890));
  expect(nat64.type().name).toEqual(IDL.Nat64.name);
});

test('decode unknown float', () => {
  const float64 = IDL.decode([IDL.Unknown], hexToBytes('4449444c0001720000000000001840'))[0] as any;
  expect(float64.valueOf()).toEqual(6);
  expect(float64.type().name).toEqual(IDL.Float64.name);

  const nan = IDL.decode([IDL.Unknown], hexToBytes('4449444c000172000000000000f87f'))[0] as any;
  expect(nan.valueOf()).toEqual(Number.NaN);
  expect(nan.type().name).toEqual(IDL.Float64.name);

  const infinity = IDL.decode(
    [IDL.Unknown],
    hexToBytes('4449444c000172000000000000f07f'),
  )[0] as any;
  expect(infinity.valueOf()).toEqual(Number.POSITIVE_INFINITY);
  expect(infinity.type().name).toEqual(IDL.Float64.name);
});

test('decode unknown vec of tuples', () => {
  const encoded = '4449444c026c02007c01716d000101012a0474657874';
  const value = IDL.decode([IDL.Unknown], hexToBytes(encoded))[0] as any;
  expect(value).toEqual([[BigInt(42), 'text']]);
  const reencoded = bytesToHex(IDL.encode([value.type()], [value]));
  expect(reencoded).toEqual(encoded);
});

test('decode unknown service', () => {
  const value = IDL.decode(
    [IDL.Unknown],
    hexToBytes('4449444c026a0171017d00690103666f6f0001010103caffee'),
  )[0] as any;
  expect(value).toEqual(Principal.fromText('w7x7r-cok77-xa'));
  expect(value.type()).toEqual(IDL.Service({ foo: IDL.Func([IDL.Text], [IDL.Nat], []) }));
});

test('decode unknown func', () => {
  const value = IDL.decode(
    [IDL.Unknown],
    hexToBytes('4449444c016a0171017d01010100010103caffee03666f6f'),
  )[0] as any;
  expect(value).toEqual([Principal.fromText('w7x7r-cok77-xa'), 'foo']);
  expect(value.type()).toEqual(IDL.Func([IDL.Text], [IDL.Nat], ['query']));
});

test('decode / encode unknown mutual recursive lists', () => {
  // original types
  const List1 = IDL.Rec();
  const List2 = IDL.Rec();
  List1.fill(IDL.Opt(List2));
  List2.fill(IDL.Record({ head: IDL.Int, tail: List1 }));

  const encoded = '4449444c026e016c02a0d2aca8047c90eddae7040001000101010200';
  const value = IDL.decode([IDL.Unknown], hexToBytes(encoded))[0] as any;
  expect(value).toEqual([
    { _1158359328_: BigInt(1), _1291237008_: [{ _1158359328_: BigInt(2), _1291237008_: [] }] },
  ]);

  const reencoded = bytesToHex(IDL.encode([value.type()], [value]));
  // expect(reencoded).toEqual(encoded); does not hold because type table is different
  // however the result is still compatible with original types:
  const value2 = IDL.decode([List1], hexToBytes(reencoded))[0];
  expect(value2).toEqual([{ head: BigInt(1), tail: [{ head: BigInt(2), tail: [] }] }]);
});

test('decode / encode unknown nested record', () => {
  const nestedType = IDL.Record({ foo: IDL.Int32, bar: IDL.Bool });
  const recordType = IDL.Record({
    foo: IDL.Int32,
    bar: nestedType,
    baz: nestedType,
    bib: nestedType,
  });

  const recordUnknownType = IDL.Record({
    foo: IDL.Int32,
    bar: IDL.Unknown,
    baz: nestedType,
    bib: nestedType,
  });

  const nestedHashedType = IDL.Record({ _5097222_: IDL.Int32, _4895187_: IDL.Bool });
  const recordHashedType = IDL.Record({
    foo: IDL.Int32,
    bar: nestedHashedType,
    baz: nestedType,
    bib: nestedType,
  });

  const encoded =
    '4449444c026c02d3e3aa027e868eb702756c04d3e3aa0200dbe3aa0200bbf1aa0200868eb702750101012a000000012a000000012a0000002a000000';
  const nestedValue = { foo: 42, bar: true };
  const value = { foo: 42, bar: nestedValue, baz: nestedValue, bib: nestedValue };

  const decodedValue = IDL.decode([recordUnknownType], hexToBytes(encoded))[0] as any;
  expect(decodedValue).toHaveProperty('bar');
  expect(decodedValue.bar[hashedPropertyName('foo')]).toEqual(42);
  expect(decodedValue.bar[hashedPropertyName('bar')]).toEqual(true);
  expect(decodedValue.baz).toEqual(value.baz);
  expect(decodedValue.bar.type()).toEqual(nestedHashedType);

  const reencoded = bytesToHex(IDL.encode([recordHashedType], [decodedValue]));
  // expect(reencoded).toEqual(encoded); does not hold because type table is different
  // however the result is still compatible with original types:
  const decodedValue2 = IDL.decode([recordType], hexToBytes(reencoded))[0] as any;
  expect(decodedValue2).toEqual(value);
});

test('should correctly decode expected optional fields with lower hash than required fields', () => {
  const HttpResponse = IDL.Record({
    body: IDL.Text,
    headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
    streaming_strategy: IDL.Opt(IDL.Text),
    status_code: IDL.Int,
    upgrade: IDL.Opt(IDL.Bool),
  });
  const encoded =
    '4449444c036c04a2f5ed880471c6a4a19806019ce9c69906029aa1b2f90c7c6d7f6e7e010003666f6f000101c801';
  const value = IDL.decode([HttpResponse], hexToBytes(encoded))[0];
  expect(value).toEqual({
    body: 'foo',
    headers: [],
    status_code: BigInt(200),
    streaming_strategy: [],
    upgrade: [true],
  });
});

test('should decode matching optional fields if wire type contains additional fields', () => {
  const InputType = IDL.Record({
    a: IDL.Text,
    b: IDL.Opt(IDL.Text),
  });
  const OutputType = IDL.Record({
    b: IDL.Opt(IDL.Text),
  });

  const encoded = IDL.encode([InputType], [{ a: 'abc', b: ['123'] }]);
  const decoded = IDL.decode([OutputType], encoded)[0];

  expect(decoded).toEqual({
    b: ['123'],
  });
});

describe('IDL opt variant decoding', () => {
  it('should handle matching expected and wire type variants', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null, z: IDL.Null })) }),
      { a: [{ x: null }] },
      '4449444c036c0161016e026b03787f797f7a7f01000100', // Motoko: {a = ?#x} : {a : ?{#x;#y;#z}},
      'same variant under opt x',
    );
  });
  it('should handle matching expected and wire type variants', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null, z: IDL.Null })) }),
      { a: [{ z: null }] },
      '4449444c036c0161016e026b03787f797f7a7f01000102', // Motoko: {a = ?#z} : {a : ?{#x;#y;#z}}
      'same variant under opt z',
    );
  });
  it('should handle wider variant with expected tag', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [{ x: null }], b: 'abc' },
      '4449444c036c02610162716e026b03787f797f7a7f0100010003616263', // Motoko: {a = ?#x; b = "abc"} : {a : ?{#x;#y;#z}; b :Text},
      'same variant under opt x',
    );
  });
  it('should handle wider variant with unexpected tag', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [], b: 'abc' },
      '4449444c036c02610162716e026b03787f797f7a7f0100010203616263', // Motoko: {a = ?#z; b = "abc"} : {a : ?{#x;#y;#z}; b : Text}
      'extended variant under opt unexpected tag - defaulting',
    );
  });
});

describe('IDL opt edge cases', () => {
  it('should handle the option when the wire type is null type', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })) }),
      { a: [] },
      '4449444c016c01617f0100',
      // Motoko: {a = null} : {a : null}
      'opt expected type null on wire',
    );
  });
  it('should handle the option when the wire type is reserved', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })) }),
      { a: [] },
      '4449444c016c0161700100',
      // Motoko: {a = (): Any} : {a : Any}
      'opt expected type reserved on wire',
    );
  });
  it('should handle the option when the wire typ is non-optioned', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })) }),
      { a: [{ x: null }] },
      `4449444c026c0161016b02787f797f010000`,
      // Motoko: {a = #x } : {a : {#x;#y}}
      'opt expected type non-opt on wire',
    );
  });
  it('should handle the option when the wire typ is an non-optioned wider variant with expected tag', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [{ x: null }], b: 'abc' },
      `4449444c026c02610162716b03787f797f7a7f01000003616263`,
      // Motoko: {a = #x; b = "abc" } : {a : {#x;#y;#z}; b  : Text}
      'opt expected, wire type non-opt, extended, with expected tag',
    );
  });
  it('should handle the option when the wire typ is an non-optioned wider variant with unexpected tag, defaulting', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c026c02610162716b03787f797f7a7f01000203616263`,
      // Motoko: {a = #z; b = "abc"} : {a : Nat; b : Text}
      'opt expected, wire type non-opt, extended, with unexpected tag - defaulting',
    );
  });
  it('should handle the option when the expected type is opt null, wire type is non-opt', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ a: IDL.Opt(IDL.Null) })), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c036c02610162716e026b03787f797f7a7f0100010203616263`,
      // Motoko: {a = 1; b = "abc"} : {a : Nat; b : Text }
      'opt expected, wire type non-opt, other type - defaulting',
    );
  });
  it('should handle the option when the expected type is opt opt Nat, wire type is non-opt', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ a: IDL.Opt(IDL.Opt(IDL.Nat)) })), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c016c02617d627101000103616263`,
      // Motoko: {a = 1; b = "abc"} : {a : Nat; b : Text }
      'opt expected, wire type non-opt, other type - defaulting',
    );
  });
  it('should handle the option when the expected type is opt reserved, wire type is non-opt', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Reserved), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c016c02617d627101000103616263`,
      // Motoko: {a = 1; b = "abc"} : {a : Nat; b : Text }
      'opt expected, wire type non-opt, other type - defaulting',
    );
  });
});

/* The following suites are similar to the previous two but require more decoding of a Text value following the optional value.
   Tests decoding resumed correctly after any skip
*/

describe('IDL opt variant decoding (embedded)', () => {
  it('should handle matching expected and wire type variants', () => {
    testDecode(
      IDL.Record({
        a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null, z: IDL.Null })),
        b: IDL.Text,
      }),
      { a: [{ x: null }], b: 'abc' },
      '4449444c036c02610162716e026b03787f797f7a7f0100010003616263', // Motoko: {a = ?#x; b = "abc"} : {a : ?{#x;#y;#z}; b :Text},
      'same variant under opt x',
    );
  });
  it('should handle matching expected and wire type variants', () => {
    testDecode(
      IDL.Record({
        a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null, z: IDL.Null })),
        b: IDL.Text,
      }),
      { a: [{ z: null }], b: 'abc' },
      '4449444c036c02610162716e026b03787f797f7a7f0100010203616263', // Motoko: {a = ?#z; b = "abc"} : {a : ?{#x;#y;#z}; b : Text}
      'same variant under opt z',
    );
  });
  it('should handle wider variant with expected tag', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [{ x: null }], b: 'abc' },
      '4449444c036c02610162716e026b03787f797f7a7f0100010003616263', // Motoko: {a = ?#x; b = "abc"} : {a : ?{#x;#y;#z}; b : Text}
      'extended variant under opt expected tag',
    );
  });
  it('should handle wider variant with unexpected tag', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [], b: 'abc' },
      '4449444c036c02610162716e026b03787f797f7a7f0100010203616263', // Motoko: {a = ?#z; b = "abc"} : {a : ?{#x;#y;#z}; b : Text}
      'extended variant under opt unexpected tag - defaulting',
    );
  });
});

describe('IDL opt edge cases (embedded)', () => {
  it('should handle the option when the wire type is null type', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [], b: 'abc' },
      '4449444c016c02617f6271010003616263',
      // Motoko: {a = null; b = "abc"} : {a : null; b: Text}
      'opt expected type null on wire',
    );
  });
  it('should handle the option when the wire type is reserved', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [], b: 'abc' },
      '4449444c016c0261706271010003616263',
      // Motoko: {a = (): Any; b = "abc"} : {a : Any; b : Text}
      'opt expected type reserved on wire',
    );
  });
  it('should handle the option when the wire typ is non-optioned', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [{ x: null }], b: 'abc' },
      `4449444c026c02610162716b02787f797f01000003616263`,
      // Motoko: {a = #x; b = "abc" } : {a : {#x;#y}; b : Text}
      'opt expected type non-opt on wire',
    );
  });
  it('should handle the option when the wire typ is an non-optioned wider variant with expected tag', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [{ x: null }], b: 'abc' },
      `4449444c026c02610162716b03787f797f7a7f01000003616263`,
      // Motoko: {a = #x; b = "abc" } : {a : {#x;#y;#z}; b  : Text}
      'opt expected, wire type non-opt, extended, with expected tag',
    );
  });
  it('should handle the option when the wire typ is an non-optioned wider variant with unexpected tag, defaulting', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ x: IDL.Null, y: IDL.Null })), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c026c02610162716b03787f797f7a7f01000203616263`,
      // Motoko: {a = #z; b = "abc"} : {a : Nat; b : Text}
      'opt expected, wire type non-opt, extended, with unexpected tag - defaulting',
    );
  });
  it('should handle the option when the expected type is opt null, wire type is non-opt', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ a: IDL.Opt(IDL.Null) })), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c036c02610162716e026b03787f797f7a7f0100010203616263`,
      // Motoko: {a = 1; b = "abc"} : {a : Nat; b : Text }
      'opt expected, wire type non-opt, other type - defaulting',
    );
  });
  it('should handle the option when the expected type is opt opt Nat, wire type is non-opt', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Variant({ a: IDL.Opt(IDL.Opt(IDL.Nat)) })), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c016c02617d627101000103616263`,
      // Motoko: {a = 1; b = "abc"} : {a : Nat; b : Text }
      'opt expected, wire type non-opt, other type - defaulting',
    );
  });
  it('should handle the option when the expected type is opt reserved, wire type is non-opt', () => {
    testDecode(
      IDL.Record({ a: IDL.Opt(IDL.Reserved), b: IDL.Text }),
      { a: [], b: 'abc' },
      `4449444c016c02617d627101000103616263`,
      // Motoko: {a = 1; b = "abc"} : {a : Nat; b : Text }
      'opt expected, wire type non-opt, other type - defaulting',
    );
  });
});

function testSub(t1: IDL.Type, t2: IDL.Type) {
  it(`${t1.display()} <: ${t2.display()}`, () => {
    IDL.resetSubtypeCache();
    expect(IDL.subtype(t1, t2)).toEqual(true);
  });
}

function testSubFail(t1: IDL.Type, t2: IDL.Type) {
  it(`not ${t1.display()} <: ${t2.display()}`, () => {
    IDL.resetSubtypeCache();
    expect(IDL.subtype(t1, t2)).toEqual(false);
  });
}

function testReflexive(t: IDL.Type) {
  testSub(t, t);
}

describe('IDL subtyping', () => {
  describe('Subtyping is reflexive', () => {
    testReflexive(IDL.Bool);
    testReflexive(IDL.Empty);
    testReflexive(IDL.Null);
    testReflexive(IDL.Principal);
    testReflexive(IDL.Reserved);
    testReflexive(IDL.Text);
    testReflexive(IDL.Unknown);

    testReflexive(IDL.Nat);
    testReflexive(IDL.Nat8);
    testReflexive(IDL.Nat16);
    testReflexive(IDL.Nat32);
    testReflexive(IDL.Nat64);

    testReflexive(IDL.Int);
    testReflexive(IDL.Int8);
    testReflexive(IDL.Int16);
    testReflexive(IDL.Int32);
    testReflexive(IDL.Int64);

    testReflexive(IDL.Float32);
    testReflexive(IDL.Float64);
  });

  describe('Subtyping on Vecs', () => {
    testReflexive(IDL.Vec(IDL.Nat));
    testSub(IDL.Vec(IDL.Nat), IDL.Vec(IDL.Int));
    testSubFail(IDL.Vec(IDL.Int), IDL.Vec(IDL.Nat));
  });

  describe('Subtyping on Options', () => {
    // Because of some of the more "special" rules around Option types
    // it turns out _any_ type is a subtype of _any_ optional type
    testReflexive(IDL.Opt(IDL.Nat));
    testSub(IDL.Opt(IDL.Nat), IDL.Opt(IDL.Int));
    testSub(IDL.Opt(IDL.Int), IDL.Opt(IDL.Nat));
    testSub(IDL.Nat, IDL.Opt(IDL.Int));
    testSub(IDL.Opt(IDL.Nat), IDL.Opt(IDL.Opt(IDL.Int)));
  });

  describe('Subtyping on Records', () => {
    testReflexive(IDL.Record({}));
    testReflexive(IDL.Record({ a: IDL.Nat }));

    // Subtyping on individual fields
    testSub(IDL.Record({ a: IDL.Nat }), IDL.Record({ a: IDL.Int }));
    testSubFail(IDL.Record({ a: IDL.Int }), IDL.Record({ a: IDL.Nat }));

    // Width subtyping
    testSub(IDL.Record({ a: IDL.Nat, b: IDL.Nat }), IDL.Record({ a: IDL.Nat }));
    testSubFail(IDL.Record({ a: IDL.Nat }), IDL.Record({ a: IDL.Nat, b: IDL.Nat }));

    // Opt, Null, or Reserved fields are allowed to be missing
    testSub(IDL.Record({ a: IDL.Nat }), IDL.Record({ a: IDL.Nat, b: IDL.Opt(IDL.Nat) }));
    testSub(IDL.Record({ a: IDL.Nat }), IDL.Record({ a: IDL.Nat, b: IDL.Null }));
    testSub(IDL.Record({ a: IDL.Nat }), IDL.Record({ a: IDL.Nat, b: IDL.Reserved }));
  });

  describe('Subtyping on Functions', () => {
    testReflexive(IDL.Func([], []));
    testReflexive(IDL.Func([IDL.Nat], [IDL.Int]));

    // Arg types are contravariant
    testSub(IDL.Func([IDL.Int], []), IDL.Func([IDL.Nat], []));
    // Trailing arguments are allowed to be missing on the incoming type
    testSub(IDL.Func([IDL.Int], []), IDL.Func([IDL.Nat, IDL.Nat], []));
    // Trailing arguments are allowed to be missing if they are opt/null/reserved on the expected type
    testSub(IDL.Func([IDL.Int, IDL.Opt(IDL.Nat)], []), IDL.Func([IDL.Nat], []));
    testSub(IDL.Func([IDL.Int, IDL.Null], []), IDL.Func([IDL.Nat], []));
    testSub(IDL.Func([IDL.Int, IDL.Reserved], []), IDL.Func([IDL.Nat], []));
    // Non-opt/null/reserved arguments are not allowed to be missing on the expected type
    testSubFail(IDL.Func([IDL.Nat, IDL.Nat], []), IDL.Func([IDL.Nat], []));

    // Return types are covariant
    testSub(IDL.Func([], [IDL.Nat]), IDL.Func([], [IDL.Int]));
    // Trailing results are allowed to be missing on the expected type
    testSub(IDL.Func([], [IDL.Nat, IDL.Nat]), IDL.Func([], [IDL.Int]));
    // Trailing results are allowed to be missing if they are opt/null/reserved on the expected type
    testSub(IDL.Func([], [IDL.Nat]), IDL.Func([], [IDL.Int, IDL.Opt(IDL.Int)]));
    testSub(IDL.Func([], [IDL.Nat]), IDL.Func([], [IDL.Int, IDL.Null]));
    testSub(IDL.Func([], [IDL.Nat]), IDL.Func([], [IDL.Int, IDL.Reserved]));
    // Non-opt/null/reserved results are not allowed to be missing on the expected type
    testSubFail(IDL.Func([], [IDL.Nat]), IDL.Func([], [IDL.Int, IDL.Int]));
  });

  describe('Subtyping on variants', () => {
    testReflexive(IDL.Variant({}));
    testReflexive(IDL.Variant({ a: IDL.Nat }));

    // Subtyping on individual alternatives happens pointwise
    testSub(IDL.Variant({ a: IDL.Nat }), IDL.Variant({ a: IDL.Int }));
    testSubFail(IDL.Variant({ a: IDL.Int }), IDL.Variant({ a: IDL.Nat }));

    // Width subtyping
    testSub(IDL.Variant({ a: IDL.Nat }), IDL.Variant({ a: IDL.Nat, b: IDL.Nat }));
    testSubFail(IDL.Variant({ a: IDL.Nat, b: IDL.Nat }), IDL.Variant({ a: IDL.Nat }));
  });

  describe('Subtyping on services', () => {
    testReflexive(IDL.Service({}));
    testReflexive(IDL.Service({ f: IDL.Func([], []) }));

    // Subtyping on service methods happens pointwise
    testSub(
      IDL.Service({ f: IDL.Func([IDL.Int], [IDL.Nat]) }),
      IDL.Service({ f: IDL.Func([IDL.Nat], [IDL.Int]) }),
    );
    testSubFail(
      IDL.Service({ f: IDL.Func([IDL.Nat], [IDL.Int]) }),
      IDL.Service({ f: IDL.Func([IDL.Int], [IDL.Nat]) }),
    );

    // Width subtyping
    testSub(
      IDL.Service({ f: IDL.Func([], []), g: IDL.Func([], []) }),
      IDL.Service({ f: IDL.Func([], []) }),
    );
    testSubFail(
      IDL.Service({ f: IDL.Func([], []) }),
      IDL.Service({ f: IDL.Func([], []), g: IDL.Func([], []) }),
    );
  });

  describe('Subtyping on recursive types', () => {
    const IntList = IDL.Rec();
    IntList.fill(IDL.Opt(IDL.Record({ head: IDL.Int, tail: IntList })));
    const NatList = IDL.Rec();
    NatList.fill(IDL.Opt(IDL.Record({ head: IDL.Nat, tail: NatList })));
    testSub(NatList, IntList);

    const Even = IDL.Rec();
    const Odd = IDL.Rec();
    Even.fill(IDL.Tuple(Odd));
    Odd.fill(IDL.Tuple(Even));

    testSub(IDL.Tuple(Even), Odd);
    testSub(IDL.Tuple(IDL.Tuple(Odd)), Odd);
  });

  describe('Subtyping on records/variants normalizes field labels', () => {
    // Checks we don't regress https://github.com/dfinity/icp-sdk-js-core/issues/1072
    testSub(IDL.Record({ a: IDL.Nat, "_98_": IDL.Nat }), IDL.Record({ "_97_": IDL.Nat, b: IDL.Nat }));
    testSub(IDL.Variant({ a: IDL.Nat, "_98_": IDL.Nat }), IDL.Variant({ "_97_": IDL.Nat, b: IDL.Nat }));
  });

  describe('decoding function/service references', () => {
    const principal = Principal.fromText('w7x7r-cok77-xa');
    it('checks subtyping when decoding function references', () => {
      testDecode(
        IDL.Func([IDL.Int], [IDL.Nat]),
        [principal, 'myFunc'],
        // didc encode -t "(func (int) -> (nat))" "(func \"w7x7r-cok77-xa\" . \"myFunc\")"
        `4449444c016a017c017d000100010103caffee066d7946756e63`,
        'expects subtyping check to succeed',
      );

      testDecode(
        IDL.Opt(IDL.Func([IDL.Int], [IDL.Nat])),
        [],
        // didc encode -t "(opt func (nat) -> (nat))" "(opt func \"w7x7r-cok77-xa\" . \"myFunc\")"
        `4449444c026e016a017d017d00010001010103caffee066d7946756e63`,
        'expects failed subtype check under option to default to null',
      );

      testDecode(
        IDL.Record({
          optF: IDL.Opt(IDL.Func([IDL.Int], [IDL.Nat])),
        }),
        { optF: [] },
        // didc encode -t "(record { optF : func (nat) -> (nat) })" "(record { optF = func \"w7x7r-cok77-xa\" . \"myFunc\" })"
        `4449444c026c01b3a1d0cd04016a017d017d000100010103caffee066d7946756e63`,
        'expects failed subtype check under option to default to null',
      );

      testDecodeFail(
        IDL.Func([IDL.Int], [IDL.Nat]),
        // didc encode -t "(func (nat) -> (nat))" "(func \"w7x7r-cok77-xa\" . \"myFunc\")"
        `4449444c016a017d017d000100010103caffee066d7946756e63`,
        'expects subtyping check to fail',
      );
    });
    it('checks subtyping when decoding service references', () => {
      testDecode(
        IDL.Service({
          f: IDL.Func([IDL.Int], [IDL.Nat]),
        }),
        principal,
        // didc encode -t "(service { f : (int) -> (nat) })" "(service \"w7x7r-cok77-xa\")"
        `4449444c0269010166016a017c017d0001000103caffee`,
        'expects subtyping check to succeed',
      );

      testDecode(
        IDL.Opt(
          IDL.Service({
            f: IDL.Func([IDL.Int], [IDL.Nat]),
          }),
        ),
        [],
        // didc encode -t "(service { f : (nat) -> (nat) })" "(service \"w7x7r-cok77-xa\")"
        `4449444c0269010166016a017d017d0001000103caffee`,
        'expects subtyping check to fail',
      );

      testDecode(
        IDL.Opt(
          IDL.Service({
            f: IDL.Func([IDL.Int], [IDL.Nat]),
          }),
        ),
        [],
        // didc encode -t "(opt service { f : (nat) -> (nat) })" "(opt service \"w7x7r-cok77-xa\")"
        `4449444c036e0169010166026a017d017d000100010103caffee`,
        'expects subtyping check to fail',
      );

      testDecodeFail(
        IDL.Service({
          f: IDL.Func([IDL.Int], [IDL.Nat]),
        }),
        // didc encode -t "(service { f : (nat) -> (nat) })" "(service \"w7x7r-cok77-xa\")"
        `4449444c0269010166016a017d017d0001000103caffee`,
        'expects subtyping check to fail',
      );
    });
  });
});
