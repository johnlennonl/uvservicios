const CACHE_NAME = 'uv-servicios-pwa-v1';

// Service worker is mainly to satisfy PWA install requirements for now
// We'll cache minimal things so it can install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './manifest.json',
                './img/UV%20SERVICES%20-%20Logo%20vectorial%20sin%20fondo.png'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
