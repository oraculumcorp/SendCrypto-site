// SendCrypto Lite service worker: shell cache-first, rates network-first w/ offline fallback.
const V='sc-app-v1',SHELL=['/app/','/manifest.webmanifest','/app/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return;
  if(u.pathname==='/api/rates'){
    e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put('/api/rates',c))}return res}).catch(()=>caches.match('/api/rates')));
    return;
  }
  if(u.pathname.startsWith('/api/'))return;
  if(r.mode==='navigate'&&u.pathname.startsWith('/app')){
    // Network-first for the shell so deploys show up; cache when offline.
    e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put('/app/',c))}return res}).catch(()=>caches.match('/app/')));
    return;
  }
  if(SHELL.includes(u.pathname))e.respondWith(caches.match(r).then(m=>m||fetch(r)));
});
