// Service Worker – macht die App installierbar (PWA) und lädt die Hülle
// auch bei wackligem Netz. Firebase-Aufrufe werden NIE abgefangen (immer Netz).
const CACHE = 'vdg-v4';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./firebase-config.js','./logo.jpg','./manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Firebase / Google-Dienste nie abfangen (Login, Datenbank, SDK)
  if (url.includes('firebaseio.com') || url.includes('firebasedatabase.app') ||
      url.includes('identitytoolkit') || url.includes('googleapis.com') ||
      url.includes('gstatic.com') || url.includes('google.com')) return;
  if (e.request.method !== 'GET') return;
  // Netz zuerst (frische Version), Cache als Fallback
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
