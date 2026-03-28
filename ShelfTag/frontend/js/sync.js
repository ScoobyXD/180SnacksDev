/**
 * ShelfTag — Sync Module
 * ===================
 * Manages the synchronization of queued photos to the backend.
 * 
 * How it works:
 * 1. Photos are always saved to IndexedDB first (even when online)
 * 2. This module checks connectivity and processes the queue
 * 3. Each pending photo is sent to the backend's /api/sync endpoint
 * 4. On success: photo is marked as synced and eventually cleaned up
 * 5. On failure: photo stays in queue for retry
 * 
 * Connectivity detection:
 * - Uses navigator.onLine as a quick check
 * - Also pings the backend's /api/health endpoint to verify real connectivity
 *   (navigator.onLine can be true even without actual internet access)
 * - Listens for 'online' events to trigger sync when connectivity returns
 * 
 * The sync process runs:
 * - After each photo capture (if online)
 * - When the app detects it has come back online
 * - On a periodic interval as a safety net
 */

import { getPendingPhotos, updatePhotoStatus, deleteSyncedPhoto, getQueueStats } from './storage.js';

// Backend API base URL — in local prototype, same origin
const API_BASE = '';  // Empty string = same origin as the frontend

let isSyncing = false;     // Prevents concurrent sync runs
let syncCallback = null;   // UI callback for sync status updates


/**
 * Register a callback function that gets called when sync status changes.
 * The UI uses this to update the sync badge/indicator.
 * 
 * @param {function} callback - Called with { pending, syncing, synced, failed } stats
 */
export function onSyncStatusChange(callback) {
    syncCallback = callback;
}


/**
 * Check if the backend is actually reachable.
 * navigator.onLine can be unreliable (returns true on captive portals, etc).
 * Pinging the health endpoint gives us a definitive answer.
 * 
 * @returns {boolean} True if the backend is reachable
 */
async function isBackendReachable() {
    try {
        const response = await fetch(`${API_BASE}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        return response.ok;
    } catch {
        return false;
    }
}


/**
 * Process the sync queue — upload all pending photos to the backend.
 * 
 * This is the core sync loop:
 * 1. Check if we're online
 * 2. Get all pending photos from IndexedDB
 * 3. Upload each one to the backend
 * 4. Mark successful ones as synced, failed ones stay for retry
 * 
 * Photos are processed sequentially (not in parallel) to avoid
 * overwhelming the backend or hitting rate limits.
 */
export async function processQueue() {
    // Prevent concurrent sync runs
    if (isSyncing) {
        console.log('[Sync] Already syncing, skipping...');
        return;
    }

    // Quick online check
    if (!navigator.onLine) {
        console.log('[Sync] Offline, skipping sync');
        return;
    }

    // Verify backend is actually reachable
    const reachable = await isBackendReachable();
    if (!reachable) {
        console.log('[Sync] Backend not reachable, skipping sync');
        return;
    }

    isSyncing = true;
    console.log('[Sync] Starting sync...');

    try {
        const pendingPhotos = await getPendingPhotos();

        if (pendingPhotos.length === 0) {
            console.log('[Sync] No pending photos');
            return;
        }

        console.log(`[Sync] Processing ${pendingPhotos.length} pending photos...`);

        for (const photo of pendingPhotos) {
            try {
                // Mark as syncing (so UI shows progress)
                await updatePhotoStatus(photo.id, 'syncing');
                await notifyUI();

                // Send to backend
                const response = await fetch(`${API_BASE}/api/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_base64: photo.image_base64,
                        metadata: photo.metadata,
                    }),
                    signal: AbortSignal.timeout(60000), // 60 second timeout (large images)
                });

                const result = await response.json();

                if (result.success) {
                    // Success — mark as synced and clean up
                    await updatePhotoStatus(photo.id, 'synced');
                    
                    // Delete the local copy to free IndexedDB space
                    // The image is now safely in Airtable + R2
                    await deleteSyncedPhoto(photo.id);

                    console.log(`[Sync] Photo #${photo.id} synced → ${result.extracted_data?.flavor || 'unknown'}`);
                } else {
                    // Backend returned an error
                    await updatePhotoStatus(photo.id, 'failed', result.error);
                    console.error(`[Sync] Photo #${photo.id} failed: ${result.error}`);
                }

            } catch (error) {
                // Network error or timeout
                await updatePhotoStatus(photo.id, 'failed', error.message);
                console.error(`[Sync] Photo #${photo.id} error: ${error.message}`);

                // If we lost connectivity mid-sync, stop processing the rest
                if (!navigator.onLine) {
                    console.log('[Sync] Lost connectivity, stopping sync');
                    break;
                }
            }

            // Notify UI after each photo
            await notifyUI();
        }

    } finally {
        isSyncing = false;
        await notifyUI();
        console.log('[Sync] Sync complete');
    }
}


/**
 * Notify the UI callback with current queue stats.
 */
async function notifyUI() {
    if (syncCallback) {
        const stats = await getQueueStats();
        syncCallback(stats);
    }
}


/**
 * Initialize the sync system.
 * Sets up event listeners for connectivity changes and periodic sync.
 */
export function initSync() {
    // Listen for when the device comes back online
    window.addEventListener('online', () => {
        console.log('[Sync] Device came online — triggering sync');
        processQueue();
    });

    // Periodic sync every 30 seconds as a safety net
    // In case the 'online' event was missed or a previous sync partially failed
    setInterval(() => {
        processQueue();
    }, 30000);

    console.log('[Sync] Sync system initialized');
}
