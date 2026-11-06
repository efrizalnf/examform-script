const Lock = {
  /** Jalankan fn di bawah script lock. Dipakai untuk operasi yang bergeser baris (hapus) & start sesi. */
  run(fn, waitMs) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(waitMs || 20000)) {
      throw Errors.rule('BUSY', 'Server sedang sibuk, coba lagi sesaat.');
    }
    try { return fn(); } finally { lock.releaseLock(); }
  },
};

/** Mutex best-effort berbasis cache (non-blocking) untuk mencegah klik ganda pada operasi per-kunci. */
const Mutex = {
  tryAcquire(key, ttlSeconds) {
    const cache = CacheService.getScriptCache();
    if (cache.get(`mx:${key}`)) return false;
    cache.put(`mx:${key}`, '1', ttlSeconds || 10);
    return true;
  },
  release(key) { CacheService.getScriptCache().remove(`mx:${key}`); },
};
