import { HttpAgent } from '../index.ts';
import { Principal } from '#principal';
import * as cbor from '../../cbor.ts';
import { KnownPath, StatePaths, decodeControllers } from '../../utils/readState.ts';
import { decodeTime } from '../../utils/leb.ts';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

// bypass bls verification so that an old certificate is accepted
jest.mock('../../utils/bls', () => {
  return {
    blsVerify: jest.fn(() => Promise.resolve(true)),
  };
});

jest.useFakeTimers();
const certificateTime = Date.parse('2022-05-19T20:58:22.596Z');
jest.setSystemTime(certificateTime);

const testPrincipal = Principal.fromText('rrkah-fqaaa-aaaaa-aaaaq-cai');
const canisterBuffer = testPrincipal.toUint8Array();

/* Produced by deploying a dfx new canister and requesting
  | 'time'
  | 'controllers'
  | 'subnet'
  | 'moduleHash'
  | 'candid'
  in dfx 0.10.0
  */
const certificateHex =
  'd9d9f7a2647472656583018301830183024863616e697374657283018301820458204c805d47bd74dbcd6c8ce23ebd2e8287c453895165db6b81d93f1daf1b12004683024a0000000000000001010183018301820458205a1ee5770842c74b6749f4d72e3c1b8c0dafdaff48e113d19da4fda687df0636830183024b636f6e74726f6c6c657273820351d9d9f78241044a000000000000000001018302486d657461646174618301830182045820e8071e9c904063629f9ab66d4a447b7a881a964d16757762f424d2ef6c6a776b83024e63616e6469643a736572766963658203584774797065204578616d706c65203d20746578743b0a73657276696365203a207b0a202067726565743a20284578616d706c6529202d3e202874657874292071756572793b0a7d0a820458203676da3cc701ead8143596204d845c31a11d483dccffd5f80e5530660322212883024b6d6f64756c655f6861736882035820896f6c079f96bc3cbef782af1ab1b52847f04700ff916eb49425566995a9a064820458202d41b194a0931a274d874a4de945f104fbcf45de1bb201ec2bbdcb036c21fb0f82045820aa2f527164a8e4d898febf2bc0a8a4f95da58c3b62c6e4185e610e7b40dc615082045820fa572fdf7872444dba23377a8a426906c4314a61ef470df0af1b173b13abe949830182045820ec68f8bfb2a3f70cf8d3d427ff595e6ddb5d4230a8c3ca1d3ccb06e7694fd83283024474696d6582034980f485e1a4a6a7f816697369676e61747572655830adbb57f847e2656f248d3eec467af3c89eb5c63fa8d56bd3a3f48e3f3c570e50d0f824502fc69772d0d637190c52e4e4';

// An HttpAgent whose read_state endpoint always returns the golden certificate above.
const mockedAgent = () => {
  const certificate = hexToBytes(certificateHex);
  const body = cbor.encode({ certificate });
  const fetch = jest.fn(() =>
    Promise.resolve(new Response(body, { status: 200 })),
  ) as unknown as typeof globalThis.fetch;
  return new HttpAgent({ host: 'https://ic0.app', fetch });
};

describe('HttpAgent.readState value decoding', () => {
  it('decodes the well-known StatePaths with their strong types', async () => {
    const agent = mockedAgent();
    // The builders mint a fresh KnownPath per call, so bind each instance to look it up afterwards.
    const timePath = StatePaths.time;
    const controllersPath = StatePaths.canisterControllers(testPrincipal);
    const moduleHashPath = StatePaths.canisterModuleHash(testPrincipal);
    const candidPath = StatePaths.canisterCandid(testPrincipal);
    const { values } = await agent.readState(
      { canisterId: testPrincipal },
      { paths: [timePath, controllersPath, moduleHashPath, candidPath] },
    );

    // The type of each value follows the KnownPath's type parameter.
    const time: Date | null = values.get(timePath);
    const controllers: Principal[] | null = values.get(controllersPath);
    const moduleHash: Uint8Array | null = values.get(moduleHashPath);
    const candid: string | null = values.get(candidPath);

    expect(time).toBeInstanceOf(Date);
    expect(controllers?.every(c => c instanceof Principal)).toBe(true);
    expect(time).toMatchSnapshot();
    expect(controllers?.map(c => c.toText())).toMatchSnapshot();
    expect(bytesToHex(moduleHash!)).toMatchSnapshot();
    expect(candid).toMatchSnapshot();
  });

  it('supports custom KnownPaths with arbitrary decoders', async () => {
    const agent = mockedAgent();
    const time = new KnownPath(['time'], decodeTime);
    const raw = new KnownPath(['time'], bytes => bytes);
    const hex = new KnownPath(['time'], bytesToHex);
    const candid = new KnownPath(
      ['canister', canisterBuffer, 'metadata', 'candid:service'],
      bytes => new TextDecoder().decode(bytes),
    );
    const controllers = new KnownPath(
      ['canister', canisterBuffer, 'controllers'],
      decodeControllers,
    );

    const { values } = await agent.readState(
      { canisterId: testPrincipal },
      { paths: [time, raw, hex, candid, controllers] },
    );
    expect(values.get(time)).toMatchSnapshot();
    expect(values.get(raw)).toMatchSnapshot();
    expect(values.get(hex)).toMatchSnapshot();
    expect(values.get(candid)).toMatchSnapshot();
    expect(values.get(controllers)?.map(c => c.toText())).toMatchSnapshot();
  });

  it('builds the same canister-scoped path as spelling it out', async () => {
    const agent = mockedAgent();
    // The StatePaths builder bakes ['canister', <id>, 'module_hash'] ...
    const built = StatePaths.canisterModuleHash(testPrincipal);
    // ... equivalent to spelling the full path out.
    const explicit = new KnownPath(['canister', canisterBuffer, 'module_hash'], x => x);
    const { values } = await agent.readState(
      { canisterId: testPrincipal },
      { paths: [built, explicit] },
    );
    expect(values.get(built)).toEqual(values.get(explicit));
    expect(values.get(built)).not.toBe(null);
  });

  it('maps an absent path to null', async () => {
    const agent = mockedAgent();
    const missing = new KnownPath(['asdf'], bytesToHex);
    const { values } = await agent.readState({ canisterId: testPrincipal }, { paths: [missing] });
    expect(values.get(missing)).toBe(null);
    // A path that was never requested also reads as null.
    expect(values.get(StatePaths.time)).toBe(null);
  });

  it('does not decode raw (pre-encoded) paths', async () => {
    const agent = mockedAgent();
    const { values } = await agent.readState(
      { canisterId: testPrincipal },
      { paths: [[utf8ToBytes('time')]] },
    );
    // There is no KnownPath to look up; raw paths are fetched but not decoded.
    expect(values.get(StatePaths.time)).toBe(null);
  });
});
