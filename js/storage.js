// IndexedDB operations for spreading logs

const StorageDB = {
    dbName: 'TeamAgManureDB',
    dbVersion: 1,
    storeName: 'spreadingLogs',
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Failed to open database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                    console.log('Object store created');
                }
            };
        });
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    async saveLog(log) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            // Add date field for indexing
            const logWithDate = {
                ...log,
                id: log.id || this.generateId(),
                date: new Date(log.timestamp).toISOString().split('T')[0]
            };

            const request = store.put(logWithDate);

            request.onsuccess = () => {
                console.log('Log saved:', logWithDate.id);
                resolve(logWithDate);
            };

            request.onerror = () => {
                console.error('Failed to save log:', request.error);
                reject(request.error);
            };
        });
    },

    async getAllLogs() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.getAll();

            request.onsuccess = () => {
                // Sort by timestamp descending (newest first)
                const logs = request.result.sort((a, b) =>
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                resolve(logs);
            };

            request.onerror = () => {
                console.error('Failed to get logs:', request.error);
                reject(request.error);
            };
        });
    },

    async getLogsByDate(date) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('date');
            const request = index.getAll(date);

            request.onsuccess = () => {
                const logs = request.result.sort((a, b) =>
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                resolve(logs);
            };

            request.onerror = () => {
                console.error('Failed to get logs by date:', request.error);
                reject(request.error);
            };
        });
    },

    async getTodaysLogs() {
        const today = new Date().toISOString().split('T')[0];
        return this.getLogsByDate(today);
    },

    async getLogById(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => {
                resolve(request.result || null);
            };

            request.onerror = () => {
                console.error('Failed to get log by id:', request.error);
                reject(request.error);
            };
        });
    },

    async deleteLog(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                console.log('Log deleted:', id);
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to delete log:', request.error);
                reject(request.error);
            };
        });
    },

    async clearAllLogs() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('All logs cleared');
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to clear logs:', request.error);
                reject(request.error);
            };
        });
    }
};
