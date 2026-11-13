/* Сервис-воркер Супчика: чтобы приложение открывалось без интернета.
   - Страница (index.html): сразу из кэша, свежая версия качается в фоне и откроется при следующем запуске.
   - Картинки, мемы, шрифты: сначала из кэша, если нет, из сети с сохранением.
   - После загрузки страница присылает список всех картинок и мемов, и они тихо докачиваются в кэш.
   Если поменяли картинки, увеличьте номер версии, чтобы старый кэш очистился. */
const VERSION = 'supchik-v5';
const CORE = ['./', 'index.html', 'manifest.json', 'icon-180.png', 'icon-512.png', 'fonts/fonts.css', 'images/empty.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');

  if (isPage) {
    /* сначала показываем сохранённую страницу (мгновенно, даже на плохом интернете),
       а свежую тихо скачиваем в фоне: она откроется при следующем запуске */
    const fresh = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); }
      return res;
    });
    e.respondWith(caches.match('index.html').then(hit => {
      if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh;
    }));
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});

/* докачать картинки и мемы в фоне, по одной, чтобы не забивать сеть */
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'warm') return;
  const urls = e.data.urls || [];
  e.waitUntil(caches.open(VERSION).then(async c => {
    for (const u of urls) {
      try { if (!(await c.match(u))) { const res = await fetch(u); if (res.ok) await c.put(u, res); } } catch (err) {}
    }
  }));
});
