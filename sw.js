// 서비스 워커 기본 캐시 세팅
const CACHE_NAME = 'real-read-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['./', './index.html', './app.js', './manifest.json']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
});

// 오프라인 대응 및 네트워크 요청 중계
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});