import type { ActorSubclass } from '@icp-sdk/core/agent';
import { Actor } from '@icp-sdk/core/agent';
import { counter3CanisterId, idl } from '../canisters/counter.ts';
import type { _SERVICE } from '../canisters/declarations/counter/counter.did.ts';
import { makeAgent } from '../utils/agent.ts';
import { it, expect, describe, beforeAll } from 'vitest';

describe('queryStrategy', () => {
  let updateStrategyCounter: ActorSubclass<_SERVICE>;
  let queryStrategyCounter: ActorSubclass<_SERVICE>;
  let defaultCounter: ActorSubclass<_SERVICE>;

  beforeAll(async () => {
    const agent = await makeAgent();

    // Actor with queryStrategy 'update' — query methods go through consensus
    updateStrategyCounter = Actor.createActor(idl, {
      canisterId: counter3CanisterId,
      agent,
      queryStrategy: 'update',
    }) as ActorSubclass<_SERVICE>;

    // Actor with explicit queryStrategy 'query'
    queryStrategyCounter = Actor.createActor(idl, {
      canisterId: counter3CanisterId,
      agent,
      queryStrategy: 'query',
    }) as ActorSubclass<_SERVICE>;

    // Actor with default queryStrategy (implicitly 'query')
    defaultCounter = Actor.createActor(idl, {
      canisterId: counter3CanisterId,
      agent,
    }) as ActorSubclass<_SERVICE>;
  });

  it('should return the same result for a stateless query method whether upgraded or not', async () => {
    const defaultResult = await defaultCounter.queryGreet('world');
    const queryResult = await queryStrategyCounter.queryGreet('world');
    const updateResult = await updateStrategyCounter.queryGreet('world');

    expect(defaultResult).toEqual('Hello, world!');
    expect(queryResult).toEqual('Hello, world!');
    expect(updateResult).toEqual('Hello, world!');
  }, 40_000);

  it('should return increased state from an update-strategy read query', async () => {
    const upgraded = await updateStrategyCounter.inc_read();
    expect(upgraded).toBeGreaterThan(0n);

    const queryResult = await queryStrategyCounter.read();
    const defaultResult = await defaultCounter.read();
    expect(queryResult).toEqual(upgraded);
    expect(defaultResult).toEqual(upgraded);
  }, 40_000);
});
