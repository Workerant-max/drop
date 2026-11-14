// Drop service worker: keeps the app opening offline-fast and catches things shared to it
// from the Android share menu (Web Share Target). Bump V on every release.
var V = 'drop-v3';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== V && k !== 'drop-share'; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  // Share menu: park the files/text in a cache, then open the app, which sends them.
  if (e.request.method === 'POST' && url.origin === location.origin && /\/share\/?$/.test(url.pathname)) {
    e.respondWith(e.request.formData().then(function (fd) {
      return caches.open('drop-share').then(function (c) {
        var jobs = [], stamp = Date.now();
        fd.getAll('files').forEach(function (f, i) {
          if (!f || !f.size) return;
          jobs.push(c.put(new URL('shared/' + stamp + '-' + i, self.registration.scope).href,
            new Response(f, { headers: { 'x-name': encodeURIComponent(f.name || 'shared'), 'content-type': f.type || 'application/octet-stream' } })));
        });
        var title = fd.get('title') || '', text = fd.get('text') || '', link = fd.get('url') || '';
        var parts = [];
        if (text) parts.push(text);
        if (link && text.indexOf(link) < 0) parts.push(link);
        if (title && !parts.length) parts.push(title);
        if (parts.length) jobs.push(c.put(new URL('shared/' + stamp + '-text', self.registration.scope).href,
          new Response(parts.join('\n'), { headers: { 'x-text': '1', 'content-type': 'text/plain' } })));
        return Promise.all(jobs);
      });
    }).then(function () {
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    }));
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // App files: network first so updates land, cache when offline.
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var copy = r.clone(); caches.open(V).then(function (c) { c.put(e.request, copy); }); }
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match('./index.html'); });
  }));
});
