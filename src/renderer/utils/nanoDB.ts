export const DB_NAME = 'NanoBananaDB';
export const STORE_NAME = 'nano_covers';
export const DB_VERSION = 1;

interface NanoCover {
    id: string; // key: morphVariant_archetypeId
    data: string; // base64 image data
}

export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("NanoDB Error:", event);
            reject("Failed to open database");
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
};

export const saveCover = async (id: string, data: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id, data });

        request.onsuccess = () => resolve();
        request.onerror = () => reject("Failed to save cover");
    });
};

export const getCovers = async (): Promise<Record<string, string>> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const results: NanoCover[] = request.result;
            const covers: Record<string, string> = {};
            results.forEach(item => {
                covers[item.id] = item.data;
            });
            resolve(covers);
        };
        request.onerror = () => reject("Failed to retrieve covers");
    });
};

export const deleteCover = async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject("Failed to delete cover");
    });
};
