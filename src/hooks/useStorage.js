import { useRef, useCallback, useEffect, useState } from 'react';

// IndexedDB storage service
class StorageService {
    constructor() {
        this.dbName = 'DHIS2PWA';
        this.version = 3; // Increased version to ensure auth store creation
        this.db = null;
        this.isReady = false;
        this.initPromise = null;
    }
    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };
            request.onsuccess = () => {
                this.db = request.result;
                this.isReady = true;
                console.log('IndexedDB opened successfully');
                resolve(this.db);
            };
            request.onblocked = () => {
                console.warn('IndexedDB open blocked. Please close other tabs of this app.');
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                console.log(`Upgrading IndexedDB from version ${oldVersion} to ${this.version}`);
                // Create stores if they don't exist
                if (!db.objectStoreNames.contains('auth')) {
                    db.createObjectStore('auth', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('events')) {
                    const eventStore = db.createObjectStore('events', { keyPath: 'event' });
                    eventStore.createIndex('status', 'status', { unique: false });
                    eventStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    eventStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
                // New configuration store for complete metadata
                if (!db.objectStoreNames.contains('configuration')) {
                    db.createObjectStore('configuration', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('stats')) {
                    db.createObjectStore('stats', { keyPath: 'id' });
                }
            };
        });
        return this.initPromise;
    }
    async ensureReady() {
        if (!this.isReady) {
            await this.init();
        }
    }
    async setAuth(authData) {
        await this.ensureReady();
        const transaction = this.db.transaction(['auth'], 'readwrite');
        const store = transaction.objectStore('auth');
        await new Promise((resolve, reject) => {
            const request = store.put({ id: 'current', ...authData });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    async getAuth() {
        await this.ensureReady();
        const transaction = this.db.transaction(['auth'], 'readonly');
        const store = transaction.objectStore('auth');
        return new Promise((resolve, reject) => {
            const request = store.get('current');
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    const { id, ...authData } = result;
                    resolve(authData);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
    async clearAuth() {
        await this.ensureReady();
        const transaction = this.db.transaction(['auth'], 'readwrite');
        const store = transaction.objectStore('auth');
        await new Promise((resolve, reject) => {
            const request = store.delete('current');
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    // ... (Other methods can be added as needed) ...
}
export function useStorage() {
    const storageRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        const initStorage = async () => {
            try {
                if (!storageRef.current) {
                    storageRef.current = new StorageService();
                }
                await storageRef.current.init();
                setIsReady(true);
            } catch (error) {
                console.error('Failed to initialize storage:', error);
                setIsReady(false);
            }
        };
        initStorage();
    }, []);
    const storageProxy = {
        isReady,
        setAuth: async (...args) => {
            if (!isReady || !storageRef.current) throw new Error('Storage not ready');
            return storageRef.current.setAuth(...args);
        },
        getAuth: async (...args) => {
            if (!isReady || !storageRef.current) throw new Error('Storage not ready');
            return storageRef.current.getAuth(...args);
        },
        clearAuth: async (...args) => {
            if (!isReady || !storageRef.current) throw new Error('Storage not ready');
            return storageRef.current.clearAuth(...args);
        }
    };
    return storageProxy;
}
