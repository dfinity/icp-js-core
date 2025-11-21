import { exponentialBackoff } from './backoff.ts';

test('should do exponential backoff', async () => {
  const backoff = exponentialBackoff({
    maxIterations: 5,
  });

  const results = [...backoff];
  expect(results.length).toBe(5);
});

test('should stop after maxElapsedTime', async () => {
  jest.useFakeTimers();
  const backoff = exponentialBackoff({
    maxElapsedTime: 1000,
  });
  backoff.next();
  jest.advanceTimersByTime(1000);

  const later = backoff.next();
  expect(later).toEqual({ done: true, value: undefined });
});
