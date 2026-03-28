/**
 * ShelfTag — Service Worker
 * =====================
 * Handles offline caching so the app works without network connectivity.
 * 
 * How it works:
 * 1. On install: caches all app files (HTML, CSS, JS) so the app loads offline
 * 2. On fetch: serves from cache first, falls back to network
 * 3. On activate: cleans up old cache versions when the app is updated
 * 
 * When the app code is updated on the server:
 * - The browser detects the service worker file has changed (even 1 byte)
 * - It downloads the new SW and triggers the install event
 * - New cache version is created with updated files
 * - On next page load, the new SW activates and old cache is deleted
 * - This happens automatically — no user action needed
 * 
 * NOTE: The service worker MUST be served from the root path (/) to control
 * the entire app scope. Cloudflare Workers serves it from root automatically.
 */

// Cache version — bump this when you deploy new frontend code
// The service worker will detect the change and re-cache everything
const CACHE_VERSION = 'shelftag-v6';

// Files to cache for offline use
// These are ALL the files the app needs to function without a network
const CACHE_FILES = [
    '/',
    '/css/styles.css',
    '/js/app.js',
    '/js/camera.js',
    '/js/storage.js',
    '/js/sync.js',
    '/js/geo.js',
    '/manifest.json',
];

/**
 * INSTALL EVENT
 * Called when the service worker is first registered or when sw.js changes.
 * Pre-caches all app files so the app works offline immediately.
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => {
                console.log('[SW] Caching app files...');
                return cache.addAll(CACHE_FILES);
            })
            .then(() => {
                // Skip waiting — activate the new SW immediately instead of
                // waiting for all tabs to close. This ensures updates take effect fast.
                return self.skipWaiting();
            })
    );
});

/**
 * ACTIVATE EVENT
 * Called when the new service worker takes over.
 * Cleans up old cache versions to free storage.
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_VERSION)
                    .map((name) => {
                        console.log(`[SW] Deleting old cache: ${name}`);
                        return caches.delete(name);
                    })
            );
        }).then(() => {
            // Take control of all open tabs immediately
            return self.clients.claim();
        })
    );
});

/**
 * FETCH EVENT
 * Intercepts all network requests from the app.
 * Strategy: Cache-first for app files, network-first for API calls.
 * 
 * - App files (HTML, CSS, JS): Serve from cache, fast and offline-capable
 * - API calls (/api/*): Always go to network (these need real-time data)
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // API calls should always go to network — never cache these
    if (url.pathname.startsWith('/api/')) {
        return; // Let the browser handle it normally (network request)
    }
    
    // For everything else (app files): cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse; // Serve from cache (fast, works offline)
                }
                // Not in cache — fetch from network and cache for next time
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_VERSION).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
            .catch(() => {
                // Both cache and network failed — app is truly offline
                // and this file wasn't pre-cached. Shouldn't happen for core files.
                console.warn('[SW] Cache and network both failed for:', event.request.url);
            })
    );
});
