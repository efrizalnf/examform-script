/**
 * Cache lintas-eksekusi (CacheService) untuk string besar: dipecah menjadi potongan
 * <100KB per kunci. Semua operasi aman-gagal (error cache tidak boleh menggagalkan permintaan).
 */
const ChunkCache = {
  CHUNK: 30000, // karakter; aman terhadap batas 100KB/kunci walau berisi karakter non-ASCII

  get(key) {
    try {
      const c = CacheService.getScriptCache();
      const n = Number(c.get(key + ':n'));
      if (!n) return null;
      const keys = [];
      for (let i = 0; i < n; i++) keys.push(key + ':' + i);
      const parts = c.getAll(keys);
      let out = '';
      for (let i = 0; i < keys.length; i++) {
        if (parts[keys[i]] === null || parts[keys[i]] === undefined) return null;
        out += parts[keys[i]];
      }
      return out;
    } catch (e) { return null; }
  },

  put(key, str, ttlSeconds) {
    try {
      const n = Math.max(1, Math.ceil(str.length / this.CHUNK));
      const obj = {};
      for (let i = 0; i < n; i++) obj[key + ':' + i] = str.substr(i * this.CHUNK, this.CHUNK);
      obj[key + ':n'] = String(n);
      CacheService.getScriptCache().putAll(obj, ttlSeconds);
    } catch (e) { /* abaikan: cache hanya optimasi */ }
  },
};

/**
 * Cache baris tabel Sheet lintas-eksekusi. Setiap tulisan lewat SheetRepository menaikkan
 * "versi" tabel sehingga data lama otomatis tidak terpakai. TTL pendek (5 mnt) membatasi
 * ketidaksesuaian bila Spreadsheet diedit manual.
 */
const TableCache = {
  TTL: 300,
  VER_TTL: 21600,

  _ver(name) {
    const c = CacheService.getScriptCache();
    let v = c.get('tc:v:' + name);
    if (!v) { v = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); c.put('tc:v:' + name, v, this.VER_TTL); }
    return v;
  },

  get(name) {
    try {
      const s = ChunkCache.get('tc:' + name + ':' + this._ver(name));
      return s === null ? null : JSON.parse(s);
    } catch (e) { return null; }
  },

  put(name, rows) {
    try { ChunkCache.put('tc:' + name + ':' + this._ver(name), JSON.stringify(rows), this.TTL); } catch (e) { /* abaikan */ }
  },

  bump(name) {
    try {
      CacheService.getScriptCache().put('tc:v:' + name, Date.now().toString(36) + Math.random().toString(36).slice(2, 8), this.VER_TTL);
    } catch (e) { /* abaikan */ }
  },
};
