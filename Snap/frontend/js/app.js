/**
 * Snap — Main Application
 * ========================
 * Entry point that ties together all modules:
 * - Camera (viewfinder + capture)
 * - Storage (IndexedDB queue + localStorage preferences)
 * - Sync (upload queue to backend when online)
 * - Geo (geolocation for currency detection)
 * 
 * UI flow:
 * 1. App opens → fullscreen camera viewfinder
 * 2. Bottom-right corner shows user name + retailer (tappable to edit)
 * 3. User taps shutter button → photo captured → queued in IndexedDB
 * 4. Sync badge shows pending count
 * 5. When online, photos auto-sync to backend → Airtable
 */

import { initCamera, capturePhoto, stopCamera } from './camera.js';
import { initDB, queuePhoto, saveUserName, getUserName, saveRetailer, getRetailer, getQueueStats } from './storage.js';
import { initSync, processQueue, onSyncStatusChange } from './sync.js';
import { initGeolocation, getCurrentPosition } from './geo.js';

// ============================================================================
// APP STATE
// ============================================================================

let cameraStream = null;   // Active camera MediaStream
let isCapturing = false;   // Debounce for shutter button


// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Boot the app — called when the page loads.
 * Initializes all modules in the correct order.
 */
async function init() {
    console.log('[App] Initializing Snap...');

    // 1. Register the service worker (for PWA + offline support)
    await registerServiceWorker();

    // 2. Initialize IndexedDB (photo queue)
    await initDB();

    // 3. Initialize geolocation (for currency detection)
    initGeolocation();

    // 4. Start the camera
    const videoEl = document.getElementById('viewfinder');
    try {
        cameraStream = await initCamera(videoEl);
    } catch (error) {
        showError(error.message);
        return;
    }

    // 5. Load saved user preferences from localStorage
    loadUserPreferences();

    // 6. Initialize the sync system (auto-upload when online)
    initSync();
    onSyncStatusChange(updateSyncBadge);

    // 7. Wire up UI event handlers
    setupEventHandlers();

    // 8. Initial sync check (upload any photos queued from last session)
    processQueue();

    // 9. Update the sync badge with current queue stats
    const stats = await getQueueStats();
    updateSyncBadge(stats);

    console.log('[App] Snap initialized successfully');
}


/**
 * Register the service worker for PWA offline support.
 */
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('[App] Service worker registered:', reg.scope);
        } catch (error) {
            console.warn('[App] Service worker registration failed:', error);
            // Non-fatal — app works without SW, just not offline
        }
    }
}


// ============================================================================
// USER PREFERENCES UI
// ============================================================================

/**
 * Load saved user name and retailer from localStorage and populate the UI.
 */
function loadUserPreferences() {
    const nameInput = document.getElementById('user-name');
    const retailerInput = document.getElementById('retailer-name');

    nameInput.value = getUserName();
    retailerInput.value = getRetailer();
}

/**
 * Save user name when the input changes.
 */
function handleNameChange(event) {
    saveUserName(event.target.value.trim());
}

/**
 * Save retailer name when the input changes.
 */
function handleRetailerChange(event) {
    saveRetailer(event.target.value.trim());
}


// ============================================================================
// PHOTO CAPTURE
// ============================================================================

/**
 * Handle the shutter button tap — capture a photo and queue it.
 */
async function handleCapture() {
    // Debounce — prevent double-taps
    if (isCapturing) return;
    isCapturing = true;

    const videoEl = document.getElementById('viewfinder');

    // Validate that user name and retailer are set
    const userName = getUserName();
    const retailer = getRetailer();

    if (!userName || !retailer) {
        showToast('Please enter your name and retailer first');
        isCapturing = false;
        return;
    }

    try {
        // Visual feedback — flash effect
        triggerFlash();

        // Capture the photo at full resolution
        const imageBase64 = capturePhoto(videoEl);

        // Build metadata
        const now = new Date();
        const timestamp = formatTimestamp(now);
        const position = getCurrentPosition();

        const metadata = {
            user_name: userName,
            retailer: retailer,
            timestamp: timestamp,
            latitude: position?.latitude || null,
            longitude: position?.longitude || null,
        };

        // Queue the photo in IndexedDB
        await queuePhoto(imageBase64, metadata);

        // Update UI
        const stats = await getQueueStats();
        updateSyncBadge(stats);

        showToast('Photo captured!');

        // Try to sync immediately if online
        processQueue();

    } catch (error) {
        console.error('[App] Capture error:', error);
        showToast('Failed to capture photo');
    } finally {
        isCapturing = false;
    }
}


// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Format a Date object as "MM/DD/YYYY HH:MM" for the timestamp field.
 */
function formatTimestamp(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

/**
 * Update the sync badge showing pending photo count.
 */
function updateSyncBadge(stats) {
    const badge = document.getElementById('sync-badge');
    const count = stats.pending + stats.syncing;

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
        badge.classList.toggle('syncing', stats.syncing > 0);
    } else {
        badge.classList.add('hidden');
    }
}

/**
 * Show a brief toast message at the top of the screen.
 */
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

/**
 * Show an error message (for camera permission denied, etc).
 */
function showError(message) {
    const errorEl = document.getElementById('error-screen');
    const errorMsg = document.getElementById('error-message');
    errorMsg.textContent = message;
    errorEl.classList.remove('hidden');
}

/**
 * Trigger a camera flash effect (brief white overlay).
 */
function triggerFlash() {
    const flash = document.getElementById('flash');
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 150);
}


// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventHandlers() {
    // Shutter button
    document.getElementById('shutter-btn').addEventListener('click', handleCapture);

    // User name input — save on change
    const nameInput = document.getElementById('user-name');
    nameInput.addEventListener('change', handleNameChange);
    nameInput.addEventListener('blur', handleNameChange);

    // Retailer input — save on change
    const retailerInput = document.getElementById('retailer-name');
    retailerInput.addEventListener('change', handleRetailerChange);
    retailerInput.addEventListener('blur', handleRetailerChange);

    // Make the info box tappable to focus inputs
    document.getElementById('info-box').addEventListener('click', (e) => {
        // Don't interfere if they tapped directly on an input
        if (e.target.tagName === 'INPUT') return;
        // Focus the first empty input, or the retailer if both are filled
        if (!nameInput.value) {
            nameInput.focus();
        } else {
            retailerInput.focus();
        }
    });
}


// ============================================================================
// APP LIFECYCLE
// ============================================================================

// Boot the app when the page loads
document.addEventListener('DOMContentLoaded', init);

// Clean up camera when leaving the page
window.addEventListener('beforeunload', () => {
    stopCamera(cameraStream);
});
