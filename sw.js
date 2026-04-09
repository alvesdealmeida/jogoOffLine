// ════════════════════════════════════════════════
// AstroCrew — Service Worker
// Versão: 1.0.0
// Estratégia: Cache First para assets locais
//             Stale While Revalidate para Google Fonts
// ════════════════════════════════════════════════

const CACHE_NAME = 'astrocrew-v1';
const FONTS_CACHE = 'astrocrew-fonts-v1';

// Assets essenciais do jogo (tudo que precisa para rodar offline)
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './sw.js',
];

// ── INSTALAÇÃO: pré-cacheia os assets essenciais ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando assets do AstroCrew...');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Instalação concluída! Jogo disponível offline.');
        return self.skipWaiting(); // Ativa imediatamente sem esperar reload
      })
  );
});

// ── ATIVAÇÃO: remove caches antigos ──
self.addEventListener('activate', (event) => {
  const CACHES_VALIDOS = [CACHE_NAME, FONTS_CACHE];

  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => !CACHES_VALIDOS.includes(name))
            .map((name) => {
              console.log('[SW] Removendo cache antigo:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => {
        console.log('[SW] Ativado! Controlando todas as abas.');
        return self.clients.claim(); // Assume controle imediato das abas abertas
      })
  );
});

// ── FETCH: intercepta todas as requisições ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── Fontes do Google: Stale While Revalidate ──
  // Serve do cache imediatamente; atualiza em background quando online
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(staleWhileRevalidate(event.request, FONTS_CACHE));
    return;
  }

  // ── Assets do jogo: Cache First ──
  // O jogo não muda frequentemente; cache é a fonte primária
  if (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.json') ||
    url.pathname === '/'
  ) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }

  // ── Qualquer outra requisição: Network First ──
  // Tenta rede; fallback para cache se offline
  event.respondWith(networkFirst(event.request, CACHE_NAME));
});

// ════════════════════════════════════════════════
// ESTRATÉGIAS DE CACHE
// ════════════════════════════════════════════════

// Cache First: serve do cache; busca na rede só se não tiver
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] Offline e sem cache para:', request.url);
    // Fallback: retorna o index.html (útil para navegação SPA)
    return caches.match('./index.html');
  }
}

// Stale While Revalidate: serve cache imediatamente; atualiza em background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Busca da rede em background (não bloqueia)
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Retorna cache imediatamente se disponível; senão aguarda rede
  return cached || networkFetch;
}

// Network First: tenta rede; usa cache como fallback offline
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('Offline e sem cache disponível.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
