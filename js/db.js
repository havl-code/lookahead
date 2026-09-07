// db.js - IndexedDB wrapper. All app data (cubes, sessions, solves, settings,
// WCA rank cache) lives here, in the browser, on this machine only.

const DB_NAME = 'speedcube-training-explorer';
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;

    _dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('cubes')) {
                db.createObjectStore('cubes', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('sessions')) {
                const store = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
                store.createIndex('event_id', 'event_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('solves')) {
                const store = db.createObjectStore('solves', { keyPath: 'id', autoIncrement: true });
                store.createIndex('session_id', 'session_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('wca_cache')) {
                db.createObjectStore('wca_cache', { keyPath: 'path' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return _dbPromise;
}

function _tx(storeName, mode) {
    return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function _wrap(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// In-memory cache of whole-store reads, keyed by store name. A full dbGetAll() on a big
// store (thousands of solves) costs real time just deserializing the records - and several
// routes (dashboard stats, all 4 charts, analytics) each independently call dbGetAll('solves')
// on every tab switch, so that cost was being paid over and over for data that hadn't
// changed. Caching the promise (not just the resolved value) also collapses concurrent
// callers - the Charts tab fires 4 requests in parallel via Promise.all, and without this
// each one used to start its own separate 'solves' scan. Every write below invalidates the
// relevant entry, so a stale read is never possible.
const _allCache = new Map();

function _invalidate(storeName) {
    _allCache.delete(storeName);
}

async function dbGet(storeName, key) {
    const store = await _tx(storeName, 'readonly');
    return _wrap(store.get(key));
}

async function dbGetAll(storeName) {
    const store = await _tx(storeName, 'readonly');
    return _wrap(store.getAll());
}

// Same as dbGetAll, but served from the in-memory cache when nothing has written to
// `storeName` since the last read. Use this for read-heavy routes; use dbGetAll directly
// only where you specifically need to bypass the cache (there's normally no reason to).
function dbGetAllCached(storeName) {
    if (!_allCache.has(storeName)) {
        _allCache.set(storeName, dbGetAll(storeName));
    }
    return _allCache.get(storeName);
}

async function dbGetAllByIndex(storeName, indexName, value) {
    const store = await _tx(storeName, 'readonly');
    return _wrap(store.index(indexName).getAll(value));
}

async function dbAdd(storeName, value) {
    const store = await _tx(storeName, 'readwrite');
    _invalidate(storeName);
    return _wrap(store.add(value));
}

async function dbPut(storeName, value) {
    const store = await _tx(storeName, 'readwrite');
    _invalidate(storeName);
    return _wrap(store.put(value));
}

async function dbDelete(storeName, key) {
    const store = await _tx(storeName, 'readwrite');
    _invalidate(storeName);
    return _wrap(store.delete(key));
}

async function dbClear(storeName) {
    const store = await _tx(storeName, 'readwrite');
    _invalidate(storeName);
    return _wrap(store.clear());
}

// Run `work(tx)` against a single transaction spanning `storeNames` and resolve once that
// transaction commits. `work` must issue all its store requests synchronously (no `await`
// between them) - that's what keeps them in the same transaction instead of each becoming
// its own commit. Use this for any bulk add/put/delete instead of looping dbAdd/dbPut/
// dbDelete one at a time: a loop of N separate calls opens N separate transactions, and for
// a few thousand records that's slow enough to hang or crash the tab. One transaction
// carrying all N requests is dramatically faster.
async function dbBatch(storeNames, mode, work) {
    const db = await openDB();
    if (mode === 'readwrite') {
        (Array.isArray(storeNames) ? storeNames : [storeNames]).forEach(_invalidate);
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        result = work(tx);
    });
}
