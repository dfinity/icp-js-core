import { createActor } from '../canisters/declarations/counter/index.js';
import { test, expect } from 'vitest';
import { makeAgent } from '../utils/agent.ts';
import {
  CertificateVerificationErrorCode,
  QuerySignatureVerificationFailedErrorCode,
  TrustError,
} from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';

test('mitm greet', { timeout: 30000 }, async () => {
  const counterCanisterId = Principal.fromText(process.env.CANISTER_ID_COUNTER!);
  const counter = createActor(counterCanisterId, {
    agent: await makeAgent({
      host: 'http://127.0.0.1:8888',
      verifyQuerySignatures: false,
    }),
  });
  expect.assertions(3);
  try {
    await counter.greet('counter');
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateVerificationErrorCode);
  }
  expect(await counter.queryGreet('counter')).toEqual('Hullo, counter!');
});

test('mitm with query verification', async () => {
  const counterCanisterId = Principal.fromText(process.env.CANISTER_ID_COUNTER!);
  const counter = createActor(counterCanisterId, {
    agent: await makeAgent({
      host: 'http://127.0.0.1:8888',
      verifyQuerySignatures: true,
    }),
  });
  expect.assertions(5);
  try {
    await counter.greet('counter');
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    expect((error as TrustError).cause.code).toBeInstanceOf(CertificateVerificationErrorCode);
  }
  try {
    await counter.queryGreet('counter');
  } catch (error) {
    expect(error).toBeInstanceOf(TrustError);
    const errorCode = (error as TrustError).cause.code;
    expect(errorCode).toBeInstanceOf(QuerySignatureVerificationFailedErrorCode);
    expect(errorCode.requestContext).toBeDefined();
  }
});
