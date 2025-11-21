import { ExpirableMap } from './expirableMap.ts';

jest.useFakeTimers();
describe('ExpirableMap', () => {
  it('should return undefined if the key is not present', () => {
    const map = new ExpirableMap();
    expect(map.get('key')).toBeUndefined();
  });
  it('should return a key if one has been recently set', () => {
    const map = new ExpirableMap();
    map.set('key', 'value');
    expect(map.get('key')).toBe('value');
  });
  it('should return undefined if the key has expired', () => {
    const map = new ExpirableMap({ expirationTime: 10 });
    map.set('key', 'value');
    jest.advanceTimersByTime(11);
    expect(map.get('key')).toBeUndefined();
  });
  it('should support iterable operations', () => {
    const map = new ExpirableMap({
      source: [
        ['key1', 8],
        ['key2', 1234],
      ],
    });

    expect(Array.from(map)).toStrictEqual([
      ['key1', 8],
      ['key2', 1234],
    ]);

    for (const [key, value] of map) {
      expect(map.get(key)).toBe(value);
    }
  });
});
