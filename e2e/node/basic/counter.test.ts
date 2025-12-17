import { Actor, HttpAgent, ActorMethod } from '@icp-sdk/core/agent';
import { counterActor, counter2Actor, counterCanisterId, idl } from '../canisters/counter.ts';
import { it, expect, describe, vi, beforeAll, beforeEach, afterAll } from 'vitest';

describe.sequential('counter', () => {
  beforeAll(async () => {
    // Reset the counter to initial state before all tests
    await counterActor.write(0n);
  });

  beforeEach(async () => {
    // Reset the counter state before each test
    await counterActor.write(0n);
  });

  afterAll(async () => {
    // Reset the counter state after all tests
    await counterActor.write(0n);
  });

  it('should greet', async () => {
    const result = await counterActor.greet('counter');
    expect(result).toEqual('Hello, counter!');
  }, 40000);

  it('should submit distinct requests with nonce by default', async () => {
    const values = await Promise.all(
      new Array(4).fill(undefined).map(() => counterActor.inc_read()),
    );
    const set1 = new Set(values);
    const values2 = await Promise.all(
      new Array(4).fill(undefined).map(() => counterActor.inc_read()),
    );
    const set2 = new Set(values2);

    // Sets of unique results should be the same length
    expect(set1.size).toBe(values.length);
    expect(set2.size).toEqual(values2.length);
  }, 40000);
  it('should increment with counter2', async () => {
    // Reset at the start of the test explicitly
    await counter2Actor.write(0n);

    // Verify initial state
    const initialValue = Number(await counter2Actor.read());
    expect(initialValue).toEqual(0);

    // Increment and check each step
    for (let i = 0; i < 5; i++) {
      await counter2Actor.inc();
      const newValue = Number(await counter2Actor.read());
      expect(newValue).toEqual(i + 1);
    }
  }, 40000);

  it('should work with preSignReadStateRequest enabled', async () => {
    // Create counter actor with preSignReadStateRequest enabled
    const counter = await Actor.createActor(idl, {
      canisterId: counterCanisterId,
      agent: await HttpAgent.create({
        host: 'http://localhost:4943',
        shouldFetchRootKey: true,
      }),
      pollingOptions: {
        preSignReadStateRequest: true,
      },
    });

    // Reset counter to 0
    await counter.write(0n);
    expect(Number(await counter.read())).toEqual(0);

    // Call inc_read which will trigger polling and use preSignReadStateRequest
    const result = Number(await counter.inc_read());

    // Verify the operation was successful
    expect(result).toEqual(1);

    // Verify the state was actually updated
    expect(Number(await counter.read())).toEqual(1);
  }, 40000);

  it('should allow method-specific pollingOptions override', async () => {
    // Create counter actor without preSignReadStateRequest
    const counter = await Actor.createActor(idl, {
      canisterId: counterCanisterId,
      agent: await HttpAgent.create({
        host: 'http://localhost:4943',
        shouldFetchRootKey: true,
      }),
    });

    // Reset counter to 0
    await counter.write(0n);
    expect(Number(await counter.read())).toEqual(0);

    // Use withOptions to set preSignReadStateRequest for this specific call
    const result = Number(
      await (counter.inc_read as ActorMethod).withOptions({
        pollingOptions: {
          preSignReadStateRequest: true,
          // Custom polling strategy with simple 1-second delay
          strategy: () => new Promise(resolve => setTimeout(resolve, 1000)),
        },
      })(),
    );

    // Verify the operation was successful
    expect(result).toEqual(1);

    // Verify the state was actually updated
    expect(Number(await counter.read())).toEqual(1);
  }, 40000);
});

describe('retrytimes', () => {
  it('should retry after a failure', async () => {
    let count = 0;
    const fetchMock = vi.fn(function (...args) {
      count += 1;
      // let the first request pass, then fail the first 2 retries, then pass the final retry
      if (count >= 2 && count <= 4) {
        return new Response('Test error - ignore', {
          status: 500,
          statusText: 'Internal Server Error',
        });
      }

      // eslint-disable-next-line prefer-spread
      return fetch.apply(null, args as [input: string | Request, init?: RequestInit | undefined]);
    });

    const counter = await Actor.createActor(idl, {
      canisterId: counterCanisterId,
      agent: await HttpAgent.create({
        fetch: fetchMock as typeof fetch,
        retryTimes: 3,
        host: 'http://localhost:4943',
        shouldFetchRootKey: true,
      }),
    });

    const result = await counter.greet('counter');
    expect(result).toEqual('Hello, counter!');

    // expected calls:
    // - status call
    // - canister call that fails
    // - two retries that fail
    // - canister call that succeeds
    expect(fetchMock.mock.calls.length).toBe(5);
  }, 40000);
});
