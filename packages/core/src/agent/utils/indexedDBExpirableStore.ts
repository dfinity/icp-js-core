import { validateExpirationTime } from './expirableStore.ts';
import type { ExpirableStore } from './expirableStore.ts';

interface ExpirableRecord {
  key: string;
  value: unknown;
  timestamp: number;
}

export interface IndexedDBExpirableStoreOptions {
  /**
   * Name of the IndexedDB database.
   */
  dbName: string;
  /**
   * Name of the IndexedDB object store.
   */
  storeName: string;
  /**
   * Time in milliseconds after which entries expire.
   */
  expirationTime: number;
}

/**
 * Key-value store backed by IndexedDB with time-based expiration.
 * Enables sharing cached data across multiple instances and page reloads.
 */
export class IndexedDBExpirableStore<V> implements ExpirableStore<V> {
  readonly expirationTime: number;
  readonly #dbName: string;
  readonly #storeName: string;
  #dbPromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDBExpirableStoreOptions) {
    if (typeof globalThis.indexedDB === 'undefined') {
      throw new Error(
        'IndexedDBExpirableStore requires IndexedDB, which is not available in this environment',
      );
    }
    validateExpirationTime(options.expirationTime);
    this.#dbName = options.dbName;
    this.#storeName = options.storeName;
    this.expirationTime = options.expirationTime;
  }

  #getDb(): Promise<IDBDatabase> {
    if (!this.#dbPromise) {
      this.#dbPromise = this.#openDb().catch((error) => {
        // Reset the cached promise so future calls can retry opening the DB
        this.#dbPromise = null;
        throw error;
      });
    }
    return this.#dbPromise;
  }

  async #openDb(): Promise<IDBDatabase> {
    const db = await this.#openRequest();

    if (db.objectStoreNames.contains(this.#storeName)) {
      return db;
    }

    // Object store is missing — close and reopen with a bumped version
    // to trigger onupgradeneeded.
    const nextVersion = db.version + 1;
    db.close();
    return this.#openRequest(nextVersion);
  }

  #openRequest(version?: number): Promise<IDBDatabase> {
    const storeName = this.#storeName;

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.#dbName, version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;

        // Cooperatively close when another instance (or this store with a
        // different storeName) requests a version upgrade. The next
        // operation will re-acquire the connection via #getDb().
        db.onversionchange = () => {
          db.close();
          this.#dbPromise = null;
        };

        resolve(db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<V | undefined> {
    const db = await this.#getDb();

    return new Promise<V | undefined>((resolve, reject) => {
      const tx = db.transaction(this.#storeName, 'readonly');
      const store = tx.objectStore(this.#storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const record = request.result as ExpirableRecord | undefined;
        if (!record) {
          resolve(undefined);
          return;
        }

        if (Date.now() - record.timestamp > this.expirationTime) {
          // Lazy expiration: delete expired entry and return undefined
          this.delete(key).then(
            () => resolve(undefined),
            () => resolve(undefined),
          );
          return;
        }

        resolve(record.value as V);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async set(key: string, value: V): Promise<void> {
    await this.#prune();
    const db = await this.#getDb();

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.#storeName, 'readwrite');
      const store = tx.objectStore(this.#storeName);

      const record: ExpirableRecord = {
        key,
        value,
        timestamp: Date.now(),
      };

      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.#getDb();

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.#storeName, 'readwrite');
      const store = tx.objectStore(this.#storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async #prune(): Promise<void> {
    const db = await this.#getDb();
    const now = Date.now();

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.#storeName, 'readwrite');
      const store = tx.objectStore(this.#storeName);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          return;
        }
        const record = cursor.value as ExpirableRecord;
        if (now - record.timestamp > this.expirationTime) {
          cursor.delete();
        }
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
