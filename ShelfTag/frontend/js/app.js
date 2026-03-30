/**
 * ShelfTag — Main Application
 * ========================
 * Entry point that ties together all modules:
 * - Camera (viewfinder + capture + zoom + focus)
 * - Storage (IndexedDB queue + localStorage preferences)
 * - Sync (parallel upload when online, aggressive flush on background)
 * - Geo (geolocation for currency detection)
 * 
 * Gestures:
 * - Pinch on viewfinder → zoom in/out (hardware zoom)
 * - Single tap on viewfinder → focus (yellow ring + hardware refocus)
 * - Tap zoom indicator (bottom-right) → reset to 1×
 */

import { initCamera, capturePhoto, stopCamera, setZoom, resetZoom, getCurrentZoom, getZoomCapabilities, tapToFocus } from './camera.js';
import { initDB, queuePhoto, saveUserName, getUserName, saveRetailer, getRetailer, getQueueStats, clearAllPhotos } from './storage.js';
import { initSync, processQueue, onSyncStatusChange } from './sync.js';
import { initGeolocation, getCurrentPosition } from './geo.js';

// ============================================================================
// APP STATE
// ============================================================================

let cameraStream = null;
let isCapturing = false;

// Gesture state
let pinchState = { active: false, initialDistance: 0, initialZoom: 1 };
let tapState = { startX: 0, startY: 0, startTime: 0, moved: false, fingers: 0 };


// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
    console.log('[App] Initializing ShelfTag...');

    await registerServiceWorker();
    await initDB();
    initGeolocation();

    const videoEl = document.getElementById('viewfinder');
    try {
        cameraStream = await initCamera(videoEl);
    } catch (error) {
        showError(error.message);
        return;
    }

    loadUserPreferences();

    initSync();
    onSyncStatusChange(updateSyncBadge);

    setupEventHandlers();
    setupCameraGestures();
    updateZoomIndicator();

    processQueue();

    const stats = await getQueueStats();
    updateSyncBadge(stats);

    console.log('[App] ShelfTag initialized successfully');
}

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('[App] Service worker registered:', reg.scope);
        } catch (error) {
            console.warn('[App] Service worker registration failed:', error);
        }
    }
}


// ============================================================================
// USER PREFERENCES
// ============================================================================

function loadUserPreferences() {
    document.getElementById('user-name').value = getUserName();
    document.getElementById('retailer-name').value = getRetailer();
}

function handleNameChange(event) {
    saveUserName(event.target.value.trim());
}

function handleRetailerChange(event) {
    saveRetailer(event.target.value.trim());
}


// ============================================================================
// PHOTO CAPTURE
// ============================================================================

async function handleCapture() {
    if (isCapturing) return;
    isCapturing = true;

    const videoEl = document.getElementById('viewfinder');
    const userName = getUserName();
    const retailer = getRetailer();

    if (!userName || !retailer) {
        showToast('Please enter your name and retailer first');
        isCapturing = false;
        return;
    }

    try {
        triggerFlash();

        const imageBase64 = capturePhoto(videoEl);
        const now = new Date();
        const position = getCurrentPosition();

        const metadata = {
            user_name: userName,
            retailer: retailer,
            timestamp: formatTimestamp(now),
            latitude: position?.latitude || null,
            longitude: position?.longitude || null,
        };

        await queuePhoto(imageBase64, metadata);

        const stats = await getQueueStats();
        updateSyncBadge(stats);
        showToast('Photo captured!');

        processQueue();

    } catch (error) {
        console.error('[App] Capture error:', error);
        showToast('Failed to capture photo');
    } finally {
        isCapturing = false;
    }
}


// ============================================================================
// CAMERA GESTURES — Pinch-to-Zoom + Tap-to-Focus
// ============================================================================

function setupCameraGestures() {
    const viewfinder = document.getElementById('viewfinder');

    viewfinder.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewfinder.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewfinder.addEventListener('touchend', handleTouchEnd, { passive: false });
}

function handleTouchStart(e) {
    if (e.target.closest('#controls, #info-box, #sync-badge, #queue-modal, #zoom-indicator')) return;

    tapState.fingers = e.touches.length;
    tapState.moved = false;

    if (e.touches.length === 2) {
        e.preventDefault();
        pinchState.active = true;
        pinchState.initialDistance = getTouchDistance(e.touches);
        pinchState.initialZoom = getCurrentZoom();
    } else if (e.touches.length === 1) {
        tapState.startX = e.touches[0].clientX;
        tapState.startY = e.touches[0].clientY;
        tapState.startTime = Date.now();
    }
}

function handleTouchMove(e) {
    if (pinchState.active && e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        const scale = currentDistance / pinchState.initialDistance;
        const newZoom = pinchState.initialZoom * scale;
        setZoom(newZoom).then(updateZoomIndicator);
    } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - tapState.startX;
        const dy = e.touches[0].clientY - tapState.startY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
            tapState.moved = true;
        }
    }
}

function handleTouchEnd(e) {
    if (pinchState.active) {
        pinchState.active = false;
        return;
    }

    // Tap-to-focus: single finger, brief, no movement
    if (tapState.fingers === 1 && !tapState.moved && (Date.now() - tapState.startTime) < 300) {
        if (e.target.closest('#controls, #info-box, #sync-badge, #queue-modal, #zoom-indicator')) return;

        const viewfinder = document.getElementById('viewfinder');
        const rect = viewfinder.getBoundingClientRect();
        const screenX = tapState.startX;
        const screenY = tapState.startY;
        const normX = (screenX - rect.left) / rect.width;
        const normY = (screenY - rect.top) / rect.height;

        showFocusRing(screenX, screenY);
        tapToFocus(normX, normY);
    }
}

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Show iOS-style yellow focus ring at the tap point.
 */
function showFocusRing(x, y) {
    const ring = document.getElementById('focus-ring');
    if (!ring) return;

    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;

    ring.classList.remove('active');
    void ring.offsetWidth; // Force reflow to restart animation
    ring.classList.add('active');
}

/**
 * Update zoom indicator. Shows raw zoom level (1.0×, 2.0×, etc).
 * Turns yellow when zoomed past 1×. Tap resets to 1×.
 */
function updateZoomIndicator() {
    const indicator = document.getElementById('zoom-indicator');
    if (!indicator) return;

    const capabilities = getZoomCapabilities();
    if (!capabilities) {
        indicator.classList.add('hidden');
        return;
    }

    const zoom = getCurrentZoom();

    indicator.classList.remove('hidden');
    indicator.textContent = `${zoom.toFixed(1)}×`;

    if (zoom > 1.05) {
        indicator.classList.add('zoomed');
    } else {
        indicator.classList.remove('zoomed');
    }
}


// ============================================================================
// UI HELPERS
// ============================================================================

function formatTimestamp(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

function updateSyncBadge(stats) {
    const badge = document.getElementById('sync-badge');
    const count = stats.pending;

    badge.textContent = count;
    badge.classList.remove('pending', 'syncing');

    if (count > 0) {
        badge.classList.add(stats.syncing > 0 ? 'syncing' : 'pending');
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function showError(message) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-screen').classList.remove('hidden');
}

function triggerFlash() {
    const flash = document.getElementById('flash');
    flash.classList.remove('active');
    void flash.offsetWidth; // Force reflow to restart animation
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 350);
}


// ============================================================================
// QUEUE MODAL
// ============================================================================

function openQueueModal() {
    document.getElementById('queue-modal').classList.remove('hidden');
    getQueueStats().then(stats => {
        document.getElementById('stat-pending').textContent = stats.pending;
        document.getElementById('stat-syncing').textContent = stats.syncing;
        document.getElementById('stat-failed').textContent = stats.failed;
    });
}

function closeQueueModal() {
    document.getElementById('queue-modal').classList.add('hidden');
}

async function handleClearQueue() {
    const count = await clearAllPhotos();
    showToast(`Cleared ${count} photo${count !== 1 ? 's' : ''}`);
    closeQueueModal();
    const stats = await getQueueStats();
    updateSyncBadge(stats);
}


// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupEventHandlers() {
    // Shutter button
    document.getElementById('shutter-btn').addEventListener('click', handleCapture);

    // User name / retailer inputs
    const nameInput = document.getElementById('user-name');
    nameInput.addEventListener('change', handleNameChange);
    nameInput.addEventListener('blur', handleNameChange);

    const retailerInput = document.getElementById('retailer-name');
    retailerInput.addEventListener('change', handleRetailerChange);
    retailerInput.addEventListener('blur', handleRetailerChange);

    // Info box tap → focus first empty input
    document.getElementById('info-box').addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (!nameInput.value) nameInput.focus();
        else retailerInput.focus();
    });

    // Sync badge tap → queue modal
    document.getElementById('sync-badge').addEventListener('click', openQueueModal);

    // Queue modal controls
    document.getElementById('queue-modal-close').addEventListener('click', closeQueueModal);
    document.getElementById('clear-queue-btn').addEventListener('click', handleClearQueue);
    document.getElementById('queue-modal').addEventListener('click', (e) => {
        if (e.target.id === 'queue-modal') closeQueueModal();
    });

    // Zoom indicator tap → reset to 1×
    document.getElementById('zoom-indicator').addEventListener('click', async () => {
        await resetZoom();
        updateZoomIndicator();
    });
}


// ============================================================================
// APP LIFECYCLE
// ============================================================================

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('beforeunload', () => {
    stopCamera(cameraStream);
});
