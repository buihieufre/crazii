/**
 * Persistent Candle Cache using IndexedDB with in-memory fast-cache fallback
 * Enables instant (0ms) chart rendering on page refresh (F5) and timeframe switches
 */

const DB_NAME = 'crazii_candle_cache_db';
const STORE_NAME = 'candles';
const DB_VERSION = 1;

// In-memory hot cache for instant synchronous access
const memoryCache = new Map();

let dbPromise = null;

function getDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'code' });
        }
      };

      request.onsuccess = (e) => {
        resolve(e.target.result);
      };

      request.onerror = (e) => {
        console.warn('[Candle Cache] IndexedDB open error:', e.target.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('[Candle Cache] IndexedDB not available:', err);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Get cached candles for a specific asset code (e.g. 'XAUUSD.ca_5')
 * Returns { list: Array, timestamp: number, ageMs: number } or null
 */
export async function getCachedCandles(code) {
  if (!code) return null;

  // 1. Check in-memory hot cache first (0ms synchronous lookup)
  const mem = memoryCache.get(code);
  if (mem && Array.isArray(mem.list) && mem.list.length > 0) {
    return {
      list: mem.list,
      timestamp: mem.timestamp,
      ageMs: Date.now() - mem.timestamp,
      source: 'memory'
    };
  }

  // 2. Check IndexedDB
  try {
    const db = await getDb();
    if (!db) {
      // Fallback: check localStorage
      const localStr = typeof window !== 'undefined' ? localStorage.getItem(`crazii_c_${code}`) : null;
      if (localStr) {
        const parsed = JSON.parse(localStr);
        if (parsed && Array.isArray(parsed.list)) {
          memoryCache.set(code, parsed);
          return {
            list: parsed.list,
            timestamp: parsed.timestamp || 0,
            ageMs: Date.now() - (parsed.timestamp || 0),
            source: 'localStorage'
          };
        }
      }
      return null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(code);

        req.onsuccess = () => {
          const res = req.result;
          if (res && Array.isArray(res.list) && res.list.length > 0) {
            memoryCache.set(code, res);
            resolve({
              list: res.list,
              timestamp: res.timestamp || 0,
              ageMs: Date.now() - (res.timestamp || 0),
              source: 'indexeddb'
            });
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

/**
 * Save candles for an asset code into persistent storage
 */
export async function setCachedCandles(code, list) {
  if (!code || !Array.isArray(list) || list.length === 0) return;

  const entry = {
    code: code,
    list: list,
    timestamp: Date.now()
  };

  // 1. Store in hot memory cache
  memoryCache.set(code, entry);

  // 2. Persist to IndexedDB
  try {
    const db = await getDb();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
    } else if (typeof window !== 'undefined') {
      // Fallback for environments without IndexedDB: store light copy in localStorage
      try {
        // Keep up to 200 most recent candles in localStorage to stay well below 5MB
        const lightList = list.slice(-200);
        localStorage.setItem(`crazii_c_${code}`, JSON.stringify({
          code,
          list: lightList,
          timestamp: Date.now()
        }));
      } catch (lsErr) { }
    }
  } catch (err) {
    console.warn('[Candle Cache] Failed to persist candles:', err);
  }
}

/**
 * Clear all cached candles
 */
export async function clearCandleCache() {
  memoryCache.clear();
  try {
    const db = await getDb();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
    }
  } catch (e) { }
}
