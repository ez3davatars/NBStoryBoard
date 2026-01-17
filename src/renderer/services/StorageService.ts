export const StorageService = {
  dbName: 'NanoStudioDB',
  storeName: 'AssetStore',

  _getDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async save(key: string, data: any): Promise<void> {
    const db = await this._getDb();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    store.put(data, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async load<T>(key: string, fallback: T): Promise<T> {
    try {
      const db = await this._getDb();
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      return await new Promise<T>((resolve) => {
        request.onsuccess = () => resolve((request.result as T) ?? fallback);
        request.onerror = () => resolve(fallback);
      });
    } catch {
      return fallback;
    }
  },

  async remove(key: string): Promise<void> {
    const db = await this._getDb();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    store.delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async clearAll(): Promise<void> {
    const db = await this._getDb();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    store.clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async getSchemaVersion(): Promise<number> {
    return this.load<number>('nano_schema_version', 0);
  },

  async setSchemaVersion(v: number): Promise<void> {
    await this.save('nano_schema_version', v);
  },
};
