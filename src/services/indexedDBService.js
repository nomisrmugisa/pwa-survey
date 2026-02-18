/**
 * IndexedDB Service for Incremental Form Data Saving
 * Provides real-time field-by-field persistence for inspection forms
 */
class IndexedDBService {
    constructor() {
        this.dbName = 'InspectionFormDB';
        this.version = 4; // BUMP TO 4 TO RE-TRIGGER UPGRADE
        this.storeName = 'formData';
        this.db = null;
    }

    /**
     * Initialize IndexedDB connection
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('❌ IndexedDB failed to open:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log(`✅ IndexedDB initialized successfully (Version ${this.db.version})`);
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log(`🔄 IndexedDB Upgrade Needed: ${event.oldVersion} -> ${event.newVersion}`);
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'eventId' });

                    // Create indexes for efficient querying
                    store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                    store.createIndex('isDraft', 'metadata.isDraft', { unique: false });
                    store.createIndex('facilityId', 'formData.orgUnit', { unique: false });
                    store.createIndex('userId', 'userId', { unique: false });
                    store.createIndex('userIdAndDraft', ['userId', 'metadata.isDraft'], { unique: false });

                    console.log('📦 Created IndexedDB object store:', this.storeName);
                } else {
                    // Upgrade existing store
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore(this.storeName);

                    // Add new indexes if they don't exist
                    if (!store.indexNames.contains('userId')) {
                        store.createIndex('userId', 'userId', { unique: false });
                        console.log('📦 Added userId index to existing store');
                    }
                    if (!store.indexNames.contains('userIdAndDraft')) {
                        store.createIndex('userIdAndDraft', ['userId', 'metadata.isDraft'], { unique: false });
                        console.log('📦 Added userIdAndDraft compound index to existing store');
                    }
                }
            };
        });
    }

    /**
     * Get current user information from storage
     */
    async getCurrentUser() {
        try {
            const request = indexedDB.open('DHIS2PWA');

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('auth')) {
                        db.close();
                        resolve(null);
                        return;
                    }

                    const transaction = db.transaction(['auth'], 'readonly');
                    const store = transaction.objectStore('auth');
                    const authRequest = store.get('current');

                    authRequest.onsuccess = () => {
                        const authData = authRequest.result;
                        db.close();
                        resolve(authData?.user || null);
                    };

                    authRequest.onerror = () => {
                        console.warn('⚠️ Could not get auth data');
                        db.close();
                        resolve(null);
                    };
                };

                request.onerror = () => {
                    resolve(null);
                };

                request.onblocked = () => {
                    resolve(null);
                }
            });
        } catch (error) {
            console.warn('⚠️ Error getting current user:', error);
            return null;
        }
    }

    /**
     * Save form data incrementally (field by field)
     */
    async saveFormData(eventId, fieldKey, fieldValue, metadata = {}, user = null) {
        if (!this.db) {
            await this.init();
        }

        // Use passed user or fetch from storage if not provided
        let currentUser = user;
        if (!currentUser) {
            currentUser = await this.getCurrentUser();
        }

        const userId = currentUser?.username || currentUser?.id || 'anonymous';

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const getRequest = store.get(eventId);

            getRequest.onsuccess = () => {
                const existingData = getRequest.result || {
                    eventId: eventId,
                    userId: userId,
                    userDisplayName: currentUser?.displayName || userId,
                    formData: {},
                    metadata: {
                        isDraft: true,
                        completedSections: [],
                        currentSection: null,
                        ...metadata
                    },
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };

                // ALWAYS update ownership if we have a valid user (claims anonymous drafts)
                if (userId !== 'anonymous') {
                    existingData.userId = userId;
                    existingData.userDisplayName = currentUser?.displayName || userId;
                }

                existingData.formData[fieldKey] = fieldValue;
                existingData.lastUpdated = new Date().toISOString();

                if (metadata) {
                    existingData.metadata = { ...existingData.metadata, ...metadata };
                }

                console.log(`IndexedDBService: Saving object for ${eventId}:`, existingData);

                const putRequest = store.put(existingData);

                putRequest.onsuccess = () => {
                    console.log(`💾 Saved field ${fieldKey} to IndexedDB for event ${eventId}`);
                    resolve(existingData);
                };

                putRequest.onerror = () => {
                    console.error('❌ Failed to save field:', putRequest.error);
                    reject(putRequest.error);
                };
            };

            getRequest.onerror = () => {
                reject(getRequest.error);
            };
        });
    }

    /**
     * Save complete form data
     */
    async saveCompleteFormData(eventId, formData, metadata = {}) {
        if (!this.db) {
            await this.init();
        }

        const currentUser = await this.getCurrentUser();
        const userId = currentUser?.username || currentUser?.id || 'anonymous';

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const data = {
                eventId: eventId,
                userId: userId,
                userDisplayName: currentUser?.displayName || userId,
                formData: formData,
                metadata: {
                    isDraft: true,
                    completedSections: [],
                    currentSection: null,
                    ...metadata
                },
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            const request = store.put(data);

            request.onsuccess = () => {
                console.log(`💾 Saved complete form data to IndexedDB for event ${eventId}`);
                resolve(data);
            };

            request.onerror = () => {
                console.error('❌ Failed to save complete form data:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get form data by event ID
     */
    async getFormData(eventId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(eventId);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all draft forms for the current user
     */
    async getAllDrafts(user = null) {
        if (!this.db) {
            await this.init();
        }

        let currentUser = user;
        if (!currentUser) {
            currentUser = await this.getCurrentUser();
        }

        let userId = currentUser?.username || currentUser?.id || 'anonymous';

        if (typeof userId !== 'string') {
            userId = String(userId);
        }

        console.log(`IndexedDBService: Getting drafts for user: "${userId}" (type: ${typeof userId})`);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            // DEBUG: FETCH EVERYTHING to verify data existence
            const request = store.getAll();

            request.onsuccess = () => {
                const allItems = request.result;
                console.log("IndexedDBService: ALL ITEMS IN STORE (DEBUG DUMP):", allItems);

                const drafts = allItems.filter(draft =>
                    draft.userId === userId && draft.metadata?.isDraft === true
                );

                console.log(`📋 Retrieved ${drafts.length} draft forms for user ${userId} (Filtered in memory)`);
                resolve(drafts);
            };

            request.onerror = () => {
                console.error('❌ Failed to get all drafts:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete a form draft
     */
    async deleteDraft(eventId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(eventId);

            request.onsuccess = () => {
                console.log(`🗑️ Deleted draft ${eventId} from IndexedDB`);
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Clear all data from the store
     */
    async clearStore() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('🧹 Cleared all data from IndexedDB store');
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// Create singleton instance
const indexedDBService = new IndexedDBService();
export default indexedDBService;
