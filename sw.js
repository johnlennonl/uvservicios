const CACHE_NAME = 'uv-servicios-pwa-v1';

// Service worker is mainly to satisfy PWA install requirements for now
// We'll cache minimal things so it can install
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './manifest.json',
                './img/pwa-icon-192.png',
                './img/pwa-icon-512.png'
            ]);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Excluir llamadas a Supabase para evitar conflictos con el Service Worker y el CSP
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    // Network-first strategy
    event.respondWith(
        fetch(event.request).catch(() => {
            // Fallback to cache if offline
            return caches.match(event.request);
        })
    );
});
