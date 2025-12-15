/**
 * NeoBank PWA Service Worker
 * Provides offline capabilities, caching, and background sync
 */

const CACHE_NAME = 'neobank-v1.0.0';
const STATIC_CACHE_NAME = 'neobank-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'neobank-dynamic-v1.0.0';

// Static assets to cache
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png',
  '/offline.html'
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /\/api\/dashboard/,
  /\/api\/accounts/,
  /\/api\/transactions/,
  /\/api\/user\/profile/
];

// Network-first patterns (always try network first)
const NETWORK_FIRST_PATTERNS = [
  /\/api\/auth/,
  /\/api\/transactions\/transfer/,
  /\/api\/kyc/,
  /\/api\/fraud/
];

// Cache-first patterns (serve from cache if available)
const CACHE_FIRST_PATTERNS = [
  /\/static\//,
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  /\.(?:css|js)$/
];

/**
 * Service Worker Installation
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

/**
 * Service Worker Activation
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches
            if (cacheName !== STATIC_CACHE_NAME && 
                cacheName !== DYNAMIC_CACHE_NAME &&
                cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch Event Handler
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests for caching
  if (request.method !== 'GET') {
    // Handle POST requests for background sync
    if (request.method === 'POST' && isApiRequest(url)) {
      event.respondWith(handlePostRequest(request));
    }
    return;
  }
  
  // Determine caching strategy based on request
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isApiRequest(url)) {
    if (isNetworkFirstPattern(url)) {
      event.respondWith(networkFirstStrategy(request));
    } else if (isCacheableApiRequest(url)) {
      event.respondWith(staleWhileRevalidateStrategy(request));
    } else {
      event.respondWith(networkOnlyStrategy(request));
    }
  } else {
    event.respondWith(networkFirstStrategy(request));
  }
});

/**
 * Background Sync for offline transactions
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'background-transaction') {
    event.waitUntil(syncPendingTransactions());
  } else if (event.tag === 'background-data-sync') {
    event.waitUntil(syncUserData());
  }
});

/**
 * Push Notification Handler
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: 'You have a new notification from NeoBank',
    icon: '/logo192.png',
    badge: '/logo192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/view.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss.png'
      }
    ]
  };
  
  if (event.data) {
    const data = event.data.json();
    options.body = data.message || options.body;
    options.title = data.title || 'NeoBank';
    options.data = { ...options.data, ...data };
  }
  
  event.waitUntil(
    self.registration.showNotification('NeoBank', options)
  );
});

/**
 * Notification Click Handler
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/dashboard')
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  } else {
    // Default action - open app
    event.waitUntil(
      clients.matchAll({ type: 'window' })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url === '/' && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

/**
 * Message Handler for communication with main thread
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CACHE_TRANSACTION') {
    cacheTransaction(event.data.transaction);
  } else if (event.data && event.data.type === 'GET_CACHED_DATA') {
    getCachedData(event.data.key).then((data) => {
      event.ports[0].postMessage({ data });
    });
  }
});

// Caching Strategies

/**
 * Cache First Strategy
 * Serve from cache if available, fallback to network
 */
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first strategy failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network First Strategy
 * Try network first, fallback to cache
 */
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok && isCacheableRequest(request)) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.destination === 'document') {
      return caches.match('/offline.html');
    }
    
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Stale While Revalidate Strategy
 * Serve from cache immediately, update cache in background
 */
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // Network failed, but we might have cached response
    return cachedResponse;
  });
  
  // Return cached response immediately if available
  return cachedResponse || fetchPromise;
}

/**
 * Network Only Strategy
 * Always use network, no caching
 */
async function networkOnlyStrategy(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.error('[SW] Network only strategy failed:', error);
    return new Response('Network Error', { status: 503 });
  }
}

/**
 * Handle POST requests for background sync
 */
async function handlePostRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    console.log('[SW] POST request failed, queuing for background sync');
    
    // Store request for background sync
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: await request.text(),
      timestamp: Date.now()
    };
    
    await storeFailedRequest(requestData);
    
    // Register background sync
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      await self.registration.sync.register('background-transaction');
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Request queued for background sync',
      queued: true 
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Sync pending transactions when back online
 */
async function syncPendingTransactions() {
  console.log('[SW] Syncing pending transactions...');
  
  try {
    const failedRequests = await getFailedRequests();
    
    for (const requestData of failedRequests) {
      try {
        const response = await fetch(requestData.url, {
          method: requestData.method,
          headers: requestData.headers,
          body: requestData.body
        });
        
        if (response.ok) {
          console.log('[SW] Successfully synced transaction:', requestData.url);
          await removeFailedRequest(requestData);
          
          // Notify main thread of successful sync
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'SYNC_SUCCESS',
              data: requestData
            });
          });
        }
      } catch (error) {
        console.error('[SW] Failed to sync transaction:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

/**
 * Sync user data in background
 */
async function syncUserData() {
  console.log('[SW] Syncing user data...');
  
  try {
    // Sync dashboard data
    await fetch('/api/dashboard');
    
    // Sync account data
    await fetch('/api/accounts');
    
    // Sync recent transactions
    await fetch('/api/transactions?limit=50');
    
    console.log('[SW] User data sync completed');
  } catch (error) {
    console.error('[SW] User data sync failed:', error);
  }
}

// Helper Functions

/**
 * Check if request is for static asset
 */
function isStaticAsset(url) {
  return CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname));
}

/**
 * Check if request is for API
 */
function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

/**
 * Check if API request should use network first
 */
function isNetworkFirstPattern(url) {
  return NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname));
}

/**
 * Check if API request is cacheable
 */
function isCacheableApiRequest(url) {
  return API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
}

/**
 * Check if request is cacheable
 */
function isCacheableRequest(request) {
  return request.method === 'GET' && 
         !request.url.includes('auth') &&
         !request.url.includes('logout');
}

/**
 * Store failed request for background sync
 */
async function storeFailedRequest(requestData) {
  const db = await openDB();
  const transaction = db.transaction(['failed_requests'], 'readwrite');
  const store = transaction.objectStore('failed_requests');
  await store.add(requestData);
}

/**
 * Get all failed requests
 */
async function getFailedRequests() {
  const db = await openDB();
  const transaction = db.transaction(['failed_requests'], 'readonly');
  const store = transaction.objectStore('failed_requests');
  return await store.getAll();
}

/**
 * Remove failed request after successful sync
 */
async function removeFailedRequest(requestData) {
  const db = await openDB();
  const transaction = db.transaction(['failed_requests'], 'readwrite');
  const store = transaction.objectStore('failed_requests');
  
  // Find and delete the request
  const cursor = await store.openCursor();
  while (cursor) {
    if (cursor.value.url === requestData.url && 
        cursor.value.timestamp === requestData.timestamp) {
      await cursor.delete();
      break;
    }
    await cursor.continue();
  }
}

/**
 * Cache transaction data
 */
async function cacheTransaction(transaction) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const response = new Response(JSON.stringify(transaction), {
    headers: { 'Content-Type': 'application/json' }
  });
  
  await cache.put(`/api/transactions/${transaction.id}`, response);
}

/**
 * Get cached data by key
 */
async function getCachedData(key) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const response = await cache.match(key);
  
  if (response) {
    return await response.json();
  }
  
  return null;
}

/**
 * Open IndexedDB for storing failed requests
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('neobank-sw-db', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('failed_requests')) {
        const store = db.createObjectStore('failed_requests', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('url', 'url', { unique: false });
      }
    };
  });
}

/**
 * Clean up old cached data
 */
async function cleanupOldCache() {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const requests = await cache.keys();
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const request of requests) {
    const response = await cache.match(request);
    const dateHeader = response.headers.get('date');
    
    if (dateHeader) {
      const responseDate = new Date(dateHeader).getTime();
      if (now - responseDate > maxAge) {
        await cache.delete(request);
      }
    }
  }
}

// Periodic cleanup
setInterval(cleanupOldCache, 60 * 60 * 1000); // Run every hour

console.log('[SW] Service worker loaded successfully');
