/**
 * ShelfTag — Sync Module
 * ===================
 * Manages synchronization of queued photos to the Cloudflare Worker backend.
 * 
 * SYNC STRATEGY:
 * 
 * Parallel uploads (4 concurrent) triggered by:
 * - Photo capture (immediate)
 * - Device comes online
 * - App returns to foreground (visibilitychange)
 * - 30-second periodic timer
 * 
 * NOTE ON iOS BACKGROUND UPLOADS:
 * Safari does NOT support the Background Sync API (SyncManager).
 * visibilitychange flush was tested but iOS suspends the PWA before
 * uploads complete. Background uploads remain an unsolved problem for
 * pure PWAs on iOS. See LLM.md open items for options.
 * Current approach: foreground-only uploads + aggressive retry on resume.
 * 
 * DELETION POLICY:
 * Photos are deleted from IndexedDB as soon as the Worker acknowledges
 * the upload (any HTTP response), even if Gemini/Airtable fails downstream.
 * The image is in R2 at that point. Only true network failures keep the
 * photo for retry. This prevents infinite re-upload loops.
 */

import { getPendingPhotos, updatePhotoStatus, deleteSyncedPhoto, getQueueStats, resetStuckPhotos } from './storage.js';

const API_BASE = '';
const MAX_CONCURRENT = 4;   // Fixed foreground concurrency
const UPLOAD_TIMEOUT = 60000; // 60 seconds per photo

let isSyncing = false;
let syncCallback = null;


export function onSyncStatusChange(callback) {
    syncCallback = callback;
}


async function isBackendReachable() {
    try {
        const response = await fetch(`${API_BASE}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });
        return response.ok;
    } catch {
        return false;
    }
}


/**
 * Upload a single photo to the Worker backend.
 * Returns true on success (or server-side pipeline error — image is in R2).
 * Returns false on network failure (photo should be retried).
 */
async function uploadPhoto(photo) {
    try {
        await updatePhotoStatus(photo.id, 'syncing');
        await notifyUI();

        const response = await fetch(`${API_BASE}/api/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_base64: photo.image_base64,
                metadata: photo.metadata,
            }),
            signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
        });

        const result = await response.json();

        // Worker received image — delete from local queue regardless of pipeline result
        await deleteSyncedPhoto(photo.id);
        await notifyUI();

        if (result.success) {
            console.log(`[Sync] Photo #${photo.id} synced → ${result.extracted_data?.flavor || 'unknown'}`);
        } else {
            console.warn(`[Sync] Photo #${photo.id} uploaded but pipeline error: ${result.error}`);
        }

        return true;

    } catch (error) {
        // Network failure — reset to pending for retry
        await updatePhotoStatus(photo.id, 'pending');
        await notifyUI();
        console.error(`[Sync] Photo #${photo.id} network error (will retry): ${error.message}`);
        return false;
    }
}


/**
 * Process the photo upload queue.
 * Uploads photos in fixed-size parallel batches.
 */
export async function processQueue() {
    if (isSyncing) {
        console.log('[Sync] Already syncing, skipping...');
        return;
    }

    if (!navigator.onLine) {
        console.log('[Sync] Offline, skipping sync');
        return;
    }

    isSyncing = true;

    try {
        await resetStuckPhotos();

        const reachable = await isBackendReachable();
        if (!reachable) {
            console.log('[Sync] Worker not reachable, skipping sync');
            return;
        }

        console.log('[Sync] Starting sync...');

        const pendingPhotos = await getPendingPhotos();

        if (pendingPhotos.length === 0) {
            console.log('[Sync] No pending photos');
            return;
        }

        console.log(`[Sync] Processing ${pendingPhotos.length} pending photos (${MAX_CONCURRENT} concurrent)...`);

        // Process in fixed-size batches
        for (let i = 0; i < pendingPhotos.length; i += MAX_CONCURRENT) {
            if (!navigator.onLine) {
                console.log('[Sync] Lost connectivity, stopping sync');
                break;
            }

            const batch = pendingPhotos.slice(i, i + MAX_CONCURRENT);
            const results = await Promise.allSettled(batch.map(uploadPhoto));

            // If any upload failed due to network, stop the batch
            const hadNetworkFailure = results.some(r => r.status === 'fulfilled' && r.value === false);
            if (hadNetworkFailure && !navigator.onLine) {
                break;
            }

            await notifyUI();
        }

    } finally {
        isSyncing = false;
        await notifyUI();
        console.log('[Sync] Sync complete');
    }
}


async function notifyUI() {
    if (syncCallback) {
        const stats = await getQueueStats();
        syncCallback(stats);
    }
}


/**
 * Initialize the sync system.
 * - Sync when device comes online
 * - 30-second periodic retry
 * - Sync again when app returns to foreground (catches up after being backgrounded)
 * 
 * NOTE: iOS background uploads are unsolved. Safari does not support
 * Background Sync API, and visibilitychange flush was tested but iOS
 * suspends the PWA before uploads complete. See LLM.md open items.
 */
export function initSync() {
    window.addEventListener('online', () => {
        console.log('[Sync] Device came online — triggering sync');
        processQueue();
    });

    setInterval(() => {
        processQueue();
    }, 30000);

    // Sync when app returns to foreground
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('[Sync] App foregrounded — resuming sync');
            isSyncing = false; // Reset in case a previous cycle was interrupted
            processQueue();
        }
    });

    console.log('[Sync] Sync system initialized');
}
