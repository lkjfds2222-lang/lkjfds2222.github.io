/* 雞省研究所 V3.5.1：最新資料優先，僅離線時使用上次載入的靜態網站。 */
const CACHE='kfc-v351-shell-v1';
const SHELL=['./','./index.html','./v3.js?v=3.5.1','./manifest.webmanifest','./app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('kfc-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // 資料檔絕不存入 App Shell 快取；失敗時由網頁顯示離線快照並標示狀態。
 if(url.pathname.endsWith('.json')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
 event.respondWith(fetch(request).then(response=>{
   if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,clone)));}
   return response;
 }).catch(async()=>{const hit=await caches.match(request);if(hit)return hit;if(request.mode==='navigate')return caches.match('./index.html');return Response.error();}));
});
