import { type DBCreateOptions, IdbKeyVal } from './db.ts';

export const KEY_STORAGE_KEY = 'identity';
export const KEY_STORAGE_DELEGATION = 'delegation';
export const KEY_VECTOR = 'iv';
// Increment if any fields are modified
export const DB_VERSION = 1;

export const isBrowser = typeof window !== 'undefined';

export type StoredKey = string | CryptoKeyPair;

/**
 * Interface for persisting user authentication data
 */
export interface AuthClientStorage {
  get(key: string): Promise<StoredKey | null>;

  set(key: string, value: StoredKey): Promise<void>;

  remove(key: string): Promise<void>;
}

/**
 * Legacy implementation of AuthClientStorage, for use where IndexedDb is not available
 */
export class LocalStorage implements AuthClientStorage {
  constructor(
    public readonly prefix = 'ic-',
    private readonly _localStorage?: Storage,
  ) {}

  public get(key: string): Promise<string | null> {
    return Promise.resolve(this._getLocalStorage().getItem(this.prefix + key));
  }

  public set(key: string, value: string): Promise<void> {
    this._getLocalStorage().setItem(this.prefix + key, value);
    return Promise.resolve();
  }

  public remove(key: string): Promise<void> {
    this._getLocalStorage().removeItem(this.prefix + key);
    return Promise.resolve();
  }

  private _getLocalStorage() {
    if (this._localStorage) {
      return this._localStorage;
    }

    const ls =
      typeof window === 'undefined'
        ? typeof global === 'undefined'
          ? typeof self === 'undefined'
            ? undefined
            : self.localStorage
          : global.localStorage
        : window.localStorage;

    if (!ls) {
      throw new Error('Could not find local storage.');
    }

    return ls;
  }
}

/**
 * IdbStorage is an interface for simple storage of string key-value pairs built on {@link IdbKeyVal}
 *
 * It replaces {@link LocalStorage}
 * @see implements {@link AuthClientStorage}
 */
export class IdbStorage implements AuthClientStorage {
  #options: DBCreateOptions;

  /**
   * @param options - DBCreateOptions
   * @param options.dbName - name for the indexeddb database
   * @param options.storeName - name for the indexeddb Data Store
   * @param options.version - version of the database. Increment to safely upgrade
   * @example
   * ```ts
   * const storage = new IdbStorage({ dbName: 'my-db', storeName: 'my-store', version: 2 });
   * ```
   */
  constructor(options?: DBCreateOptions) {
    this.#options = options ?? {};
  }

  // Initializes a KeyVal on first request
  private initializedDb: IdbKeyVal | undefined;
  get _db(): Promise<IdbKeyVal> {
    return new Promise((resolve, reject) => {
      if (this.initializedDb) {
        resolve(this.initializedDb);
        return;
      }
      IdbKeyVal.create(this.#options)
        .then(db => {
          this.initializedDb = db;
          resolve(db);
        })
        .catch(reject);
    });
  }

  public async get<T = string>(key: string): Promise<T | null> {
    const db = await this._db;
    return await db.get<T>(key);
  }

  public async set<T = string>(key: string, value: T): Promise<void> {
    const db = await this._db;
    await db.set(key, value);
  }

  public async remove(key: string): Promise<void> {
    const db = await this._db;
    await db.remove(key);
  }
}
