/**
 * ShelfTag — Sync Module
 * ===================
 * Manages the synchronization of queued photos to the Cloudflare Worker backend.
 * 
 * KEY DESIGN DECISION:
 * We delete from IndexedDB as soon as the Worker acknowledges the upload,
 * even if Gemini extraction or Airtable creation fails downstream.
 * The image is in R2 and can be re-processed server-side if needed.
 * Re-uploading the same 5MB image from the phone is wasteful.
 * 
 * Only true network failures (no HTTP response at all) keep the photo for retry.
 */

import { getPendingPhotos, updatePhotoStatus, deleteSyncedPhoto, getQueueStats, resetStuckPhotos } from './storage.js';

const API_BASE = '';

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
        // Reset photos stuck in 'syncing' (interrupted mid-upload)
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

        console.log(`[Sync] Processing ${pendingPhotos.length} pending photos...`);

        for (const photo of pendingPhotos) {
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
                    signal: AbortSignal.timeout(60000),
                });

                const result = await response.json();

                // ---- DELETE FROM INDEXEDDB regardless of result.success ----
                // The Worker received the image — it's in R2 now.
                // If Gemini or Airtable failed downstream, debug via wrangler tail.
                // Do NOT re-upload the same 5MB image from the phone.
                await deleteSyncedPhoto(photo.id);

                if (result.success) {
                    console.log(`[Sync] Photo #${photo.id} synced → ${result.extracted_data?.flavor || 'unknown'}`);
                } else {
                    console.warn(`[Sync] Photo #${photo.id} uploaded but pipeline error: ${result.error}`);
                }

            } catch (error) {
                // TRUE network failure — no response received.
                // Reset to pending so it retries next cycle.
                await updatePhotoStatus(photo.id, 'pending');
                console.error(`[Sync] Photo #${photo.id} network error (will retry): ${error.message}`);

                if (!navigator.onLine) {
                    console.log('[Sync] Lost connectivity, stopping sync');
                    break;
                }
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


export function initSync() {
    window.addEventListener('online', () => {
        console.log('[Sync] Device came online — triggering sync');
        processQueue();
    });

    setInterval(() => {
        processQueue();
    }, 30000);

    console.log('[Sync] Sync system initialized');
}
