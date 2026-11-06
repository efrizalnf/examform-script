/** Mock minimal layanan Apps Script agar logika bisnis bisa diuji di Node (tanpa Google). */
const crypto = require('crypto');

function toSigned(buf) { return Array.from(buf).map((b) => (b > 127 ? b - 256 : b)); }
function toBuf(v) { return Array.isArray(v) ? Buffer.from(v.map((b) => (b < 0 ? b + 256 : b))) : Buffer.from(String(v), 'utf8'); }

class MockRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push((this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j] ?? '');
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((row, i) => {
      const rr = this.r - 1 + i;
      while (this.sheet.data.length <= rr) this.sheet.data.push([]);
      row.forEach((v, j) => { this.sheet.data[rr][this.c - 1 + j] = (typeof v === 'string' || v === '') ? v : String(v).toUpperCase() === 'TRUE' || typeof v === 'boolean' ? String(v).toUpperCase() : String(v); });
    });
    return this;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const row = this.sheet.data[this.r - 1 + i]; if (row) row[this.c - 1 + j] = ''; } return this; }
  createTextFinder(text) {
    const self = this; let entire = false, matchCase = false;
    const finder = {
      matchEntireCell(b) { entire = b; return finder; },
      matchCase(b) { matchCase = b; return finder; },
      findAll() {
        const hits = [];
        self.getValues().forEach((row, i) => row.forEach((v) => {
          const a = matchCase ? String(v) : String(v).toLowerCase(); const b = matchCase ? text : text.toLowerCase();
          if (entire ? a === b : a.indexOf(b) >= 0) hits.push({ getRow: () => self.r + i });
        }));
        return hits;
      },
    };
    return finder;
  }
}

class MockSheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { let last = 0; this.data.forEach((row, i) => { if (row.some((v) => v !== '' && v !== undefined)) last = i + 1; }); return last; }
  getLastColumn() { return this.data.reduce((m, row) => Math.max(m, row.length), 0); }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getRange(r, c, nr, nc) { return new MockRange(this, r, c, nr || 1, nc || 1); }
  appendRow(arr) { const row = this.getLastRow(); this.getRange(row + 1, 1, 1, arr.length).setValues([arr]); }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  setFrozenRows() {}
  insertRowsAfter() {}
}

class MockSpreadsheet {
  constructor() { this.sheets = [new MockSheet('Sheet1')]; }
  getId() { return 'mock-ss'; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new MockSheet(n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets; }
  deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
}

function createGlobals() {
  const ss = new MockSpreadsheet();
  const props = {}; const cacheStore = {}; let triggers = [];
  return {
    ss,
    globals: {
      console,
      Utilities: {
        getUuid: () => crypto.randomUUID(),
        computeHmacSha256Signature: (msg, key) => toSigned(crypto.createHmac('sha256', toBuf(key)).update(toBuf(msg)).digest()),
        base64EncodeWebSafe: (s) => toBuf(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
        base64DecodeWebSafe: (s) => toSigned(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
        newBlob: (bytes) => ({ getDataAsString: () => toBuf(bytes).toString('utf8') }),
        Charset: { UTF_8: 'UTF_8' },
      },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
      CacheService: { getScriptCache: () => ({ get: (k) => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; }, remove: (k) => { delete cacheStore[k]; } }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
      SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
      ScriptApp: {
        getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t })),
        deleteTrigger: () => { triggers = []; },
        newTrigger: (h) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => triggers.push(h) }) }) }),
      },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    },
  };
}

module.exports = { createGlobals };
