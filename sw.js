const CACHE_NAME = 'uv-servicios-pwa-v1';

// Service worker is mainly to satisfy PWA install requirements for now
// We'll cache minimal things so it can install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './field.html',
                './manifest.json',
                './img/uvservicioslogo.png'
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
