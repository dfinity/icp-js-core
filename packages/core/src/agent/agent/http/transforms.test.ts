import { ExpiryJsonDeserializeErrorCode, InputError } from '../../errors.ts';
import { Expiry } from './transforms.ts';

const SECONDS_TO_MILLISECONDS = 1_000;
const MILLISECONDS_TO_NANOSECONDS = BigInt(1_000_000);
const MINUTES_TO_SECONDS = 60;

const CURRENT_TIME = new Date(1619459231314); // 2021-04-26T17:47:11.314Z

jest.useFakeTimers();
test('it should round down to the nearest minute', () => {
  jest.setSystemTime(CURRENT_TIME);

  const expiry = Expiry.fromDeltaInMilliseconds(5 * MINUTES_TO_SECONDS * SECONDS_TO_MILLISECONDS);
  expect(expiry['__expiry__']).toEqual(BigInt(1619459520000) * MILLISECONDS_TO_NANOSECONDS);

  const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
  expect(expiryDate.toISOString()).toBe('2021-04-26T17:52:00.000Z');
});

test('it should round down to the nearest second when minute rounding would be less than 60s in future', () => {
  jest.setSystemTime(CURRENT_TIME);

  const expiry = Expiry.fromDeltaInMilliseconds(89 * SECONDS_TO_MILLISECONDS);
  expect(expiry['__expiry__']).toEqual(BigInt(1619459320000) * MILLISECONDS_TO_NANOSECONDS);

  const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
  expect(expiryDate.toISOString()).toBe('2021-04-26T17:48:40.000Z');
});

test('it should handle zero delta', () => {
  const baseDelta = 0;

  const expiry = Expiry.fromDeltaInMilliseconds(baseDelta);

  expect(expiry['__expiry__']).toEqual(BigInt(1619459231000) * MILLISECONDS_TO_NANOSECONDS);

  const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
  expect(expiryDate.toISOString()).toBe('2021-04-26T17:47:11.000Z');
});

describe('clockDriftInMs parameter', () => {
  beforeEach(() => {
    // Set a fixed time for consistent testing
    jest.setSystemTime(CURRENT_TIME);
  });

  describe('when minute rounding would be less than 60s in future (rounds to seconds)', () => {
    test('should add clockDriftInMs before rounding to seconds', () => {
      const baseDelta = 30 * SECONDS_TO_MILLISECONDS; // 30 seconds
      const clockDrift = 1500; // 1.5 seconds

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 + 1500) + 30000 = 1619459262814, rounds to 1619459262000
      expect(expiry['__expiry__']).toEqual(BigInt(1619459262000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:47:42.000Z');
    });

    test('should handle zero base delta with positive clock drift', () => {
      const baseDelta = 0;
      const clockDrift = 1000; // 1 second

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 + 1000) + 0 = 1619459232314, rounds to 1619459232000
      expect(expiry['__expiry__']).toEqual(BigInt(1619459232000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:47:12.000Z');
    });

    test('should handle zero base delta with negative clock drift', () => {
      const baseDelta = 0;
      const clockDrift = -500; // -0.5 seconds

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 - 500) + 0 = 1619459230814, rounds to 1619459230000
      expect(expiry['__expiry__']).toEqual(BigInt(1619459230000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:47:10.000Z');
    });

    test('should handle negative clockDriftInMs', () => {
      const baseDelta = 50 * SECONDS_TO_MILLISECONDS; // 50 seconds
      const clockDrift = -2000; // -2 seconds

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 - 2000) + 50000 = 1619459279314, rounds to 1619459279000
      expect(expiry['__expiry__']).toEqual(BigInt(1619459279000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:47:59.000Z');
    });

    test('should handle large clockDriftInMs', () => {
      const baseDelta = 80 * SECONDS_TO_MILLISECONDS; // 80 seconds
      const clockDrift = 15000; // 15 seconds

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 + 15000) + 80000 = 1619459326314, rounds to 1619459326000
      expect(expiry['__expiry__']).toEqual(BigInt(1619459326000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:48:46.000Z');
    });

    test('should handle very large clockDriftInMs', () => {
      const baseDelta = 1 * MINUTES_TO_SECONDS * SECONDS_TO_MILLISECONDS; // 1 minute
      const clockDrift = 5 * MINUTES_TO_SECONDS * SECONDS_TO_MILLISECONDS; // 5 minutes

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 + 300000) + 60000 = 1619459591314, rounds to 1619459591000
      expect(expiry['__expiry__']).toEqual(BigInt(1619459591000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:53:11.000Z');
    });
  });

  describe('when minute rounding is at least 60s in future (rounds to minutes)', () => {
    test('should add clockDriftInMs before rounding to minutes', () => {
      const baseDelta = 2 * MINUTES_TO_SECONDS * SECONDS_TO_MILLISECONDS; // 2 minutes
      const clockDrift = 30000; // 30 seconds

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 + 30000) + 120000 = 1619459381314
      // Rounded down to the nearest minute
      expect(expiry['__expiry__']).toEqual(BigInt(1619459340000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:49:00.000Z');
    });

    test('should handle negative clockDriftInMs', () => {
      const baseDelta = 2 * MINUTES_TO_SECONDS * SECONDS_TO_MILLISECONDS; // 2 minutes
      const clockDrift = -45000; // -45 seconds

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 - 45000) + 120000 = 1619459306314
      // Rounded down to the nearest minute
      expect(expiry['__expiry__']).toEqual(BigInt(1619459280000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:48:00.000Z');
    });

    test('should use second precision when minute rounding falls below 60s threshold', () => {
      const baseDelta = 90 * SECONDS_TO_MILLISECONDS;
      const clockDrift = 5000; // 5 seconds

      const expiry = Expiry.fromDeltaInMilliseconds(baseDelta, clockDrift);

      // Expected: correctedNow + delta = (1619459231314 + 5000) + 90000 = 1619459326314
      // Rounded down to the nearest second
      expect(expiry['__expiry__']).toEqual(BigInt(1619459326000) * MILLISECONDS_TO_NANOSECONDS);

      const expiryDate = new Date(Number(expiry['__expiry__'] / MILLISECONDS_TO_NANOSECONDS));
      expect(expiryDate.toISOString()).toBe('2021-04-26T17:48:46.000Z');
    });
  });
});

test('should serialize and deserialize expiry', () => {
  const expiry = Expiry.fromDeltaInMilliseconds(1000);
  const json = JSON.stringify(expiry.toJSON());
  const deserialized = Expiry.fromJSON(json);

  expect.assertions(8);
  expect(deserialized['__expiry__']).toEqual(expiry['__expiry__']);
  expect(deserialized.toString()).toEqual(expiry.toString());

  const invalidJson = '{"__expiry__": "not a number"}';
  try {
    Expiry.fromJSON(invalidJson);
  } catch (error) {
    expect(error).toBeInstanceOf(InputError);
    const inputError = error as InputError;
    expect(inputError.cause.code).toBeInstanceOf(ExpiryJsonDeserializeErrorCode);
    expect(inputError.message).toContain('Not a valid BigInt');
  }

  const emptyJson = '{}';
  try {
    Expiry.fromJSON(emptyJson);
  } catch (error) {
    expect(error).toBeInstanceOf(InputError);
    const inputError = error as InputError;
    expect(inputError.cause.code).toBeInstanceOf(ExpiryJsonDeserializeErrorCode);
    expect(inputError.message).toContain('The input does not contain the key __expiry__');
  }
});

test('isExpiry', () => {
  expect(Expiry.isExpiry(Expiry.fromDeltaInMilliseconds(1000))).toBe(true);
  const jsonExpiryString = JSON.stringify(Expiry.fromDeltaInMilliseconds(1000).toJSON());
  expect(Expiry.isExpiry(Expiry.fromJSON(jsonExpiryString))).toBe(true);
  expect(Expiry.isExpiry({ _isExpiry: true, __expiry__: BigInt(1000) })).toBe(true);

  expect(Expiry.isExpiry({ _isExpiry: true, __expiry__: 1 })).toBe(false);
  expect(Expiry.isExpiry({ _isExpiry: true })).toBe(false);
  expect(Expiry.isExpiry({ _isExpiry: true, __expiry__: 'not a bigint' })).toBe(false);
  expect(Expiry.isExpiry({ _isExpiry: true, __expiry__: new Uint8Array([0x04]) })).toBe(false);
  expect(Expiry.isExpiry({ _isExpiry: true, __expiry__: new ArrayBuffer(1) })).toBe(false);
  expect(Expiry.isExpiry({ _isExpiry: true, __expiry__: null })).toBe(false);
  expect(Expiry.isExpiry(jsonExpiryString)).toBe(false);
  expect(Expiry.isExpiry({})).toBe(false);
  expect(Expiry.isExpiry(new Uint8Array([0x04]))).toBe(false);
  expect(Expiry.isExpiry('')).toBe(false);
  expect(Expiry.isExpiry(null)).toBe(false);
});
