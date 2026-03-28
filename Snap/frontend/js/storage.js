/**
 * Snap — Local Storage Module
 * ============================
 * Manages two types of local storage:
 * 
 * 1. localStorage — for small persistent user preferences:
 *    - User name (persists across sessions)
 *    - Retailer name (persists across sessions)
 * 
 * 2. IndexedDB — for queued photos waiting to be synced:
 *    - Full resolution JPEG images (2-5 MB each)
 *    - Associated metadata (user, retailer, timestamp, geolocation)
 *    - Sync status (pending / synced / failed)
 * 
 * IndexedDB can store gigabytes of data (typically 50% of free disk space).
 * At ~3-5 MB per photo, even 50 photos only uses ~150-250 MB.
 * See Context.md for capacity analysis.
 * 
 * Photos are stored in IndexedDB when captured (even if online), then synced
 * to the backend when connectivity is available. This ensures no photos are
 * ever lost due to network issues.
 */

const DB_NAME = 'snap-180snacks';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

let db = null;

// ============================================================================
// IndexedDB SETUP
// ============================================================================

/**
 * Open (or create) the IndexedDB database.
 * Call this once on app startup.
 * 
 * @returns {IDBDatabase} The database connection
 */
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // Called when the database is first created or version changes
        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Create the photos object store if it doesn't exist
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });

                // Index on sync status so we can quickly query "all pending photos"
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });

                console.log('[Storage] IndexedDB store created');
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('[Storage] IndexedDB opened successfully');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('[Storage] IndexedDB error:', event.target.error);
            reject(event.target.error);
        };
    });
}


// ============================================================================
// PHOTO QUEUE OPERATIONS (IndexedDB)
// ============================================================================

/**
 * Save a captured photo to the local queue.
 * Called immediately after each photo capture, regardless of connectivity.
 * 
 * @param {string} imageBase64 - Full resolution base64 JPEG data
 * @param {object} metadata - { user_name, retailer, timestamp, latitude, longitude }
 * @returns {number} The auto-generated ID of the queued photo
 */
export async function queuePhoto(imageBase64, metadata) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const record = {
            image_base64: imageBase64,
            metadata: metadata,
            status: 'pending',      // pending → syncing → synced | failed
            created_at: new Date().toISOString(),
            sync_attempts: 0,
            last_error: null,
        };

        const request = store.add(record);

        request.onsuccess = () => {
            const id = request.result;
            console.log(`[Storage] Photo queued: #${id} (${(imageBase64.length * 0.75 / 1024 / 1024).toFixed(1)} MB)`);
            resolve(id);
        };

        request.onerror = () => {
            console.error('[Storage] Failed to queue photo:', request.error);
            reject(request.error);
        };
    });
}


/**
 * Get all photos with 'pending' status (ready to sync).
 * 
 * @returns {Array} Array of photo records with id, image_base64, metadata, status
 */
export async function getPendingPhotos() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('status');
        const request = index.getAll('pending');

        request.onsuccess = () => {
            console.log(`[Storage] ${request.result.length} pending photos found`);
            resolve(request.result);
        };

        request.onerror = () => reject(request.error);
    });
}


/**
 * Update a photo's sync status.
 * 
 * @param {number} id - The photo record ID
 * @param {string} status - New status: 'syncing', 'synced', or 'failed'
 * @param {string|null} error - Error message if status is 'failed'
 */
export async function updatePhotoStatus(id, status, error = null) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
            const record = request.result;
            if (!record) {
                reject(new Error(`Photo #${id} not found`));
                return;
            }

            record.status = status;
            record.last_error = error;
            if (status === 'syncing') {
                record.sync_attempts += 1;
            }

            const updateRequest = store.put(record);
            updateRequest.onsuccess = () => {
                console.log(`[Storage] Photo #${id} status → ${status}`);
                resolve();
            };
            updateRequest.onerror = () => reject(updateRequest.error);
        };

        request.onerror = () => reject(request.error);
    });
}


/**
 * Delete a synced photo to free up IndexedDB space.
 * Only call this after confirming the photo was successfully synced to Airtable.
 * 
 * @param {number} id - The photo record ID to delete
 */
export async function deleteSyncedPhoto(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
            console.log(`[Storage] Photo #${id} deleted from local queue`);
            resolve();
        };

        request.onerror = () => reject(request.error);
    });
}


/**
 * Get the count of photos by status (for UI display).
 * 
 * @returns {object} { pending: N, syncing: N, synced: N, failed: N }
 */
export async function getQueueStats() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const stats = { pending: 0, syncing: 0, synced: 0, failed: 0 };
            request.result.forEach(record => {
                stats[record.status] = (stats[record.status] || 0) + 1;
            });
            resolve(stats);
        };

        request.onerror = () => reject(request.error);
    });
}


// ============================================================================
// USER PREFERENCES (localStorage)
// ============================================================================

/**
 * Save user name to localStorage.
 * Persists across sessions, browser restarts, and phone reboots.
 * 
 * @param {string} name - User's name
 */
export function saveUserName(name) {
    localStorage.setItem('snap_user_name', name);
}

/**
 * Get saved user name, or empty string if not set.
 * @returns {string}
 */
export function getUserName() {
    return localStorage.getItem('snap_user_name') || '';
}

/**
 * Save retailer name to localStorage.
 * Persists across sessions — user doesn't have to re-type it each visit.
 * 
 * @param {string} retailer - Retail store name
 */
export function saveRetailer(retailer) {
    localStorage.setItem('snap_retailer', retailer);
}

/**
 * Get saved retailer name, or empty string if not set.
 * @returns {string}
 */
export function getRetailer() {
    return localStorage.getItem('snap_retailer') || '';
}
