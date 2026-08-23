const CACHE_NAME = 'abou-chaker-lâabbadi-v1';
const CORE_ASSETS = [
  './index.html', './style.css', './app.js', './lessons-data.js', './irab-data.js',
  './firebase-config.js', './manifest.json', './icon-192.png', './icon-512.png',
  './teacher-avatar.jpg', './teacher-watermark.jpg'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(()=>cached))
  );
});
