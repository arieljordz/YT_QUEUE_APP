// What the Add Library panel last saw, so it opens at once instead of waiting
// for the server:
// - the saved lists (names and counts): small, kept in localStorage;
// - each list's video ids: can be tens of thousands, so they go to IndexedDB,
//   which does not share localStorage's few megabytes with the library itself.
// Everything is keyed by sync code, so one room never sees another's cache.
// Any storage failure just means no cache: callers fall back to the server.

const LISTS_KEY = "catalogListsCache";
const DB_NAME = "yt-queue-cache";
const STORE = "catalogIds";

// Also kept in memory, for when storage is unavailable (private windows).
const memoryIds = new Map();

export function readCachedLists(syncCode) {
  try {
    const saved = JSON.parse(localStorage.getItem(LISTS_KEY));
    return saved?.syncCode === syncCode && Array.isArray(saved.lists) ? saved.lists : null;
  } catch {
    return null;
  }
}

export function writeCachedLists(syncCode, lists) {
  try {
    localStorage.setItem(LISTS_KEY, JSON.stringify({ syncCode, lists }));
  } catch {
    // Quota or private mode: the panel just loads from the server next time.
  }
}

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

const idsKey = (syncCode, name) => `${syncCode}\n${name}`;

/**
 * The cached ids of a list, or null when there are none or the list changed
 * since (its count differs).
 */
export async function readCachedIds(syncCode, name, count) {
  const key = idsKey(syncCode, name);
  const entry = memoryIds.get(key) ?? (await run("readonly", (s) => s.get(key)));
  if (!entry || entry.count !== count || !Array.isArray(entry.ids)) return null;
  memoryIds.set(key, entry);
  return entry.ids;
}

export function writeCachedIds(syncCode, name, count, ids) {
  const key = idsKey(syncCode, name);
  const entry = { count, ids };
  memoryIds.set(key, entry);
  return run("readwrite", (s) => s.put(entry, key));
}

/** Drops the cached ids of this room's lists that no longer exist. */
export async function pruneCachedIds(syncCode, names) {
  const keep = new Set(names.map((n) => idsKey(syncCode, n)));
  const prefix = `${syncCode}\n`;
  for (const key of memoryIds.keys()) {
    if (key.startsWith(prefix) && !keep.has(key)) memoryIds.delete(key);
  }
  const keys = await run("readonly", (s) => s.getAllKeys());
  const stale = (keys ?? []).filter((k) => k.startsWith(prefix) && !keep.has(k));
  if (stale.length > 0) await run("readwrite", (s) => stale.forEach((k) => s.delete(k)));
}
