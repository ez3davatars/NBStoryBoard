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

  async save(key: string, data: any) {
    try {
      const db = await this._getDb();
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(data, key);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error("IndexedDB Save Failed", err);
    }
  },

  async load<T>(key: string, fallback: T): Promise<T> {
    try {
      const db = await this._getDb();
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(key);
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result || fallback);
        request.onerror = () => resolve(fallback);
      });
    } catch (err) {
      return fallback;
    }
  }
};
