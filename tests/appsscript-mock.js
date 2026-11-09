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


/** Mock FormApp: cukup untuk menguji deploy, prefill, dan pembacaan respons. */
class MockItem {
  constructor(form, kind) { this.form = form; this.kind = kind; this.id = ++form.counter + 1000; this.title = ''; this.choices = []; this.required = false; this.help = ''; }
  setTitle(t) { this.title = t; return this; }
  setHelpText(t) { this.help = t; return this; }
  setRequired(b) { this.required = b; return this; }
  setChoices(c) { this.choices = c.map((x) => x.getValue()); return this; }
  createChoice(v) { return { getValue: () => v }; }
  getId() { return this.id; }
  asTextItem() { return this; }
  createResponse(v) { return { item: this, value: v }; }
}
class MockForm {
  constructor(id, title) { Object.assign(this, { id, title, items: [], responses: [], accepting: true, settings: {}, counter: 0 }); }
  getId() { return this.id; }
  getEditors() { return (this.editors = this.editors || []).map((e) => ({ getEmail: () => e })); }
  addEditor(e) { this.editors = this.editors || []; if (/invalid/.test(e)) throw new Error('Bukan akun Google'); if (this.editors.indexOf(e) < 0) this.editors.push(e); return this; }
  removeEditor(e) { this.editors = (this.editors || []).filter((x) => x !== e); return this; }
  getPublishedUrl() { return `https://docs.google.com/forms/d/e/${this.id}/viewform`; }
  getEditUrl() { return `https://docs.google.com/forms/d/${this.id}/edit`; }
  setTitle(t) { this.title = t; return this; }
  setAcceptingResponses(b) { this.accepting = b; return this; }
  isAcceptingResponses() { return this.accepting; }
  getItems() { return this.items.slice(); }
  deleteItem(i) { this.items.splice(i, 1); }
  getItemById(id) { return this.items.find((x) => x.id === id); }
  _add(kind) { const it = new MockItem(this, kind); this.items.push(it); return it; }
  addTextItem() { return this._add('text'); } addParagraphTextItem() { return this._add('paragraph'); }
  addMultipleChoiceItem() { return this._add('choice'); } addCheckboxItem() { return this._add('checkbox'); }
  addListItem() { return this._add('dropdown'); } addPageBreakItem() { return this._add('pagebreak'); }
  createResponse() {
    const r = { items: [], withItemResponse(x) { this.items.push(x); return this; },
      toPrefilledUrl: () => 'https://docs.google.com/forms/d/e/' + this.id + '/viewform?usp=pp_url' + r.items.map((x) => '&entry.' + x.item.id + '=' + encodeURIComponent(x.value)).join('') };
    return r;
  }
  getResponses(after) {
    return this.responses.filter((r) => !after || r.ts > after.getTime()).map((r) => ({
      getId: () => r.id, getTimestamp: () => new Date(r.ts),
      getItemResponses: () => Object.keys(r.answers).map((id) => ({ getItem: () => ({ getId: () => Number(id) }), getResponse: () => r.answers[id] })),
    }));
  }
  /** helper uji */
  __addResponse(ts, answers) { this.responses.push({ id: 'resp_' + (this.responses.length + 1), ts, answers }); }
}
['setDescription', 'setConfirmationMessage', 'setShowLinkToRespondAgain', 'setAllowResponseEdits', 'setCollectEmail', 'setLimitOneResponsePerUser',
  'setProgressBar', 'setPublishingSummary', 'setShuffleQuestions', 'setRequireLogin'].forEach((fn) => {
  MockForm.prototype[fn] = function (v) { this.settings[fn] = v; return this; };
});

function createGlobals() {
  const forms = {}; let formSeq = 0;
  const ss = new MockSpreadsheet();
  const props = {}; const cacheStore = {}; let triggers = [];
  return {
    ss, forms,
    globals: {
      FormApp: {
        create: (title) => { const f = new MockForm('form' + (++formSeq), title); forms[f.id] = f; return f; },
        openById: (id) => { if (!forms[id]) throw new Error('Form tidak ada'); return forms[id]; },
      },
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
      CacheService: { getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => { cacheStore[k] = v; }, remove: (k) => { delete cacheStore[k]; },
        getAll: (ks) => { const o = {}; ks.forEach((k) => { if (k in cacheStore) o[k] = cacheStore[k]; }); return o; },
        putAll: (obj) => { Object.keys(obj).forEach((k) => { cacheStore[k] = obj[k]; }); },
      }) },
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
