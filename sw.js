// Service Worker for offline caching - Network-first strategy

const CACHE_NAME = 'teamag-manure-v24';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/auth.js',
    '/js/spreading.js',
    '/js/map.js',
    '/js/storage.js',
    '/js/export.js',
    '/js/admin.js',
    '/js/tracking.js',
    '/manifest.json',
    '/assets/tractor-icon.svg',
    '/assets/ManureSpreader.png'
];

// CDN assets can be cache-first (they're versioned)
const CDN_ASSETS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files');
                // Cache CDN assets
                return cache.addAll(CDN_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: CDN assets cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated');
                return self.clients.claim();
            })
    );
});

// Check if URL is an app file (HTML, JS, CSS)
function isAppFile(url) {
    const pathname = new URL(url).pathname;
    return pathname.endsWith('.html') ||
           pathname.endsWith('.js') ||
           pathname.endsWith('.css') ||
           pathname === '/' ||
           pathname === '';
}

// Check if URL is a CDN asset
function isCDNAsset(url) {
    return url.includes('unpkg.com') ||
           url.includes('cdnjs.cloudflare.com');
}

// Check if URL is a map tile
function isMapTile(url) {
    return url.includes('tile.openstreetmap.org') ||
           url.includes('arcgisonline.com');
}

// Fetch event - network-first for app files, cache-first for CDN/tiles
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    const url = event.request.url;

    // Map tiles: network-first with no caching (they're large)
    if (isMapTile(url)) {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return new Response('', { status: 404 });
                })
        );
        return;
    }

    // CDN assets: cache-first (versioned URLs don't change)
    if (isCDNAsset(url)) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request)
                        .then((networkResponse) => {
                            if (networkResponse && networkResponse.status === 200) {
                                const responseToCache = networkResponse.clone();
                                caches.open(CACHE_NAME)
                                    .then((cache) => cache.put(event.request, responseToCache));
                            }
                            return networkResponse;
                        });
                })
        );
        return;
    }

    // App files (HTML, JS, CSS): NETWORK-FIRST
    // Always try network first to get latest deployments
    if (isAppFile(url)) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    // Cache the fresh response for offline use
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(event.request, responseToCache));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Network failed, try cache for offline support
                    return caches.match(event.request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // If requesting a page, serve index.html from cache
                            if (event.request.destination === 'document') {
                                return caches.match('/index.html');
                            }
                            return new Response('Offline', { status: 503 });
                        });
                })
        );
        return;
    }

    // All other assets: network-first with cache fallback
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(event.request, responseToCache));
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
