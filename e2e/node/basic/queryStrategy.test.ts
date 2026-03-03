import type { ActorSubclass } from '@icp-sdk/core/agent';
import { Actor } from '@icp-sdk/core/agent';
import { counterCanisterId, idl } from '../canisters/counter.ts';
import type { _SERVICE } from '../canisters/declarations/counter/counter.did.ts';
import { makeAgent } from '../utils/agent.ts';
import { it, expect, describe, beforeAll } from 'vitest';

describe('queryStrategy', () => {
  let updateStrategyCounter: ActorSubclass<_SERVICE>;
  let normalCounter: ActorSubclass<_SERVICE>;

  beforeAll(async () => {
    const agent = await makeAgent();

    // Actor with queryStrategy 'update' — query methods go through consensus
    updateStrategyCounter = Actor.createActor(idl, {
      canisterId: counterCanisterId,
      agent,
      queryStrategy: 'update',
    }) as ActorSubclass<_SERVICE>;

    // Normal actor — query methods use the fast query path
    normalCounter = Actor.createActor(idl, {
      canisterId: counterCanisterId,
      agent,
    }) as ActorSubclass<_SERVICE>;
  });

  it('should return the same result for a stateless query method whether upgraded or not', async () => {
    const normal = await normalCounter.queryGreet('world');
    const upgraded = await updateStrategyCounter.queryGreet('world');

    expect(normal).toEqual('Hello, world!');
    expect(upgraded).toEqual('Hello, world!');
  }, 40_000);

  it('should return increased state from an update-strategy read query', async () => {
    const upgraded = await updateStrategyCounter.inc_read();
    expect(upgraded).toBeGreaterThan(0n);

    const normal = await normalCounter.read();
    expect(normal).toBeGreaterThanOrEqual(upgraded);
  }, 40_000);

  it('should be slower for update-strategy queries than normal queries', async () => {
    // Update-strategy queries go through consensus and polling, so they should be slower than direct query calls.
    const iterations = 3;

    const normalStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await normalCounter.read();
    }
    const normalDuration = performance.now() - normalStart;

    const upgradedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await updateStrategyCounter.read();
    }
    const upgradedDuration = performance.now() - upgradedStart;

    expect(upgradedDuration).toBeGreaterThan(normalDuration);
  }, 120_000);
});
