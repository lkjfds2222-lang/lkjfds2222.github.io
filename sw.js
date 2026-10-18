/* 離線顯示最近已瀏覽的網頁：每日 JSON 採網路優先，不把過期資料當即時。 */
const CACHE='kfc-v3-shell-v1';
const CORE=['./','./index.html','./v3.js','./manifest.webmanifest','./app-icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 if(/\.json(?:\?|$)/.test(new URL(r.url).pathname)){e.respondWith(fetch(r).then(resp=>{if(resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return resp}).catch(()=>caches.match(r)));return}
 e.respondWith(fetch(r).then(resp=>{if(resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return resp}).catch(()=>caches.match(r)));
});
