import { Actor, ActorSubclass } from '@icp-sdk/core/agent';
import { counterCanisterId, idl } from '../canisters/counter.ts';
import { type _SERVICE } from '../canisters/declarations/counter/counter.did.ts';
import { makeAgent } from '../utils/agent.ts';
import { it, expect, describe, beforeAll } from 'vitest';

describe('replicateQueries', () => {
  let replicatedCounter: ActorSubclass<_SERVICE>;
  let normalCounter: ActorSubclass<_SERVICE>;

  beforeAll(async () => {
    const agent = await makeAgent();

    // Actor with replicateQueries enabled — query methods go through consensus
    replicatedCounter = Actor.createActor(idl, {
      canisterId: counterCanisterId,
      agent,
      replicateQueries: true,
    }) as ActorSubclass<_SERVICE>;

    // Normal actor — query methods use the fast query path
    normalCounter = Actor.createActor(idl, {
      canisterId: counterCanisterId,
      agent,
    }) as ActorSubclass<_SERVICE>;

    // Reset counter state
    await normalCounter.write(0n);
  });

  it('should return the same result for a query method whether replicated or not', async () => {
    const normal = await normalCounter.queryGreet('world');
    const replicated = await replicatedCounter.queryGreet('world');

    expect(normal).toEqual('Hello, world!');
    expect(replicated).toEqual('Hello, world!');
  }, 40_000);

  it('should return correct state from a replicated read query', async () => {
    // Write a known value via normal update call
    await normalCounter.write(42n);

    // Read via replicated query — goes through consensus
    const replicated = await replicatedCounter.read();
    expect(replicated).toEqual(42n);

    // Read via normal query for comparison
    const normal = await normalCounter.read();
    expect(normal).toEqual(42n);
  }, 40_000);

  it('should still work for update methods when replicateQueries is enabled', async () => {
    await replicatedCounter.write(0n);

    // inc_read is an update method — should work normally regardless of replicateQueries
    const result = await replicatedCounter.inc_read();
    expect(result).toEqual(1n);
  }, 40_000);

  it('should be slower for replicated queries than normal queries', async () => {
    // This is a rough timing test — replicated queries go through consensus
    // and should generally be slower than direct query calls
    const iterations = 3;

    const normalStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await normalCounter.read();
    }
    const normalDuration = performance.now() - normalStart;

    const replicatedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await replicatedCounter.read();
    }
    const replicatedDuration = performance.now() - replicatedStart;

    // Replicated queries go through consensus and polling, so they should be noticeably slower.
    expect(replicatedDuration).toBeGreaterThan(normalDuration);
  }, 120_000);
});
