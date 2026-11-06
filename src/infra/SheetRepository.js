/**
 * Repository generik di atas satu sheet. Seluruh kolom disimpan sebagai teks agar
 * NIS ber-nol-depan dan ID tidak diubah Sheets. Nilai dikonversi sesuai tipe kolom.
 *
 * - findById / update      : pencarian baris via TextFinder (tidak memuat seluruh tabel)
 * - findBy(column, value)  : TextFinder, aman untuk tabel besar (Sesi, Jawaban)
 * - findAll / where        : memuat seluruh tabel (untuk tabel kecil/menengah)
 */
class SheetRepository {
  constructor(table, spreadsheetProvider) {
    this.table = table;
    this.provider = spreadsheetProvider;
    this.columns = table.columns;
    this.names = table.columns.map((c) => c.name);
    this._sheet = null;
    this._all = null;
  }

  // ---------- sheet & mapping ----------
  sheet() {
    if (this._sheet) return this._sheet;
    const ss = this.provider.get();
    let sh = ss.getSheetByName(this.table.sheet);
    if (!sh) sh = ss.insertSheet(this.table.sheet);
    this._ensureHeader(sh);
    this._sheet = sh;
    return sh;
  }

  /**
   * Menyiapkan header + format teks. Dilakukan HANYA saat sheet baru / ada kolom baru
   * (pemformatan seluruh kolom mahal, tidak boleh dilakukan pada setiap permintaan).
   * Grid diperbesar di awal agar baris baru (appendRow) mewarisi format teks.
   */
  _ensureHeader(sh) {
    const current = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    const missing = this.names.filter((n) => current.indexOf(n) < 0);
    if (current.length > 0 && missing.length === 0) return;
    const header = current.length === 0 ? this.names : current.concat(missing);
    sh.getRange(1, 1, 1, header.length).setNumberFormat('@').setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const want = this.table.minRows || 1000;
    if (sh.getMaxRows() < want) sh.insertRowsAfter(sh.getMaxRows(), want - sh.getMaxRows());
    sh.getRange(2, 1, sh.getMaxRows() - 1, header.length).setNumberFormat('@');
  }

  _headerIndex() {
    // Urutan kolom di sheet bisa berbeda dari skema (mis. setelah migrasi); pakai header sebagai sumber kebenaran.
    if (this._hdr) return this._hdr;
    const sh = this.sheet();
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    this._hdr = { names: header, idx: {} };
    header.forEach((h, i) => { this._hdr.idx[h] = i; });
    return this._hdr;
  }

  _colType(name) {
    const c = this.columns.find((x) => x.name === name);
    return c && c.type || 'string';
  }

  _fromCell(name, v) {
    switch (this._colType(name)) {
      case 'number': return v === '' || v === null ? null : Number(v);
      case 'bool': return v === true || String(v).toUpperCase() === 'TRUE';
      case 'json':
        if (v === '' || v === null) return null;
        try { return JSON.parse(v); } catch (e) { return null; }
      default: return v === null || v === undefined ? '' : String(v);
    }
  }

  _toCell(name, v) {
    if (v === undefined || v === null) return '';
    switch (this._colType(name)) {
      case 'json': return JSON.stringify(v);
      case 'bool': return v ? 'TRUE' : 'FALSE';
      case 'number': return String(v);
      default: return String(v);
    }
  }

  _rowToObject(row) {
    const h = this._headerIndex();
    const obj = {};
    this.names.forEach((n) => { obj[n] = this._fromCell(n, row[h.idx[n]]); });
    return obj;
  }

  _objectToRow(obj) {
    const h = this._headerIndex();
    const row = new Array(h.names.length).fill('');
    this.names.forEach((n) => { row[h.idx[n]] = this._toCell(n, obj[n]); });
    return row;
  }

  // ---------- query ----------
  findAll() {
    if (this._all) return this._all;
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) { this._all = []; return this._all; }
    const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    this._all = values.filter((r) => String(r[0]) !== '').map((r) => this._rowToObject(r));
    return this._all;
  }

  where(predicate) { return this.findAll().filter(predicate); }

  /** Baris (1-based) yang kolomnya persis bernilai `value`. */
  _rowsOf(column, value) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return [];
    const col = this._headerIndex().idx[column] + 1;
    const found = sh.getRange(2, col, last - 1, 1)
      .createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findAll();
    return found.map((r) => r.getRow());
  }

  _readRow(rowNum) {
    const sh = this.sheet();
    return this._rowToObject(sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0]);
  }

  findById(id) {
    if (id === undefined || id === null || id === '') return null;
    const rows = this._rowsOf('id', id);
    return rows.length ? this._readRow(rows[0]) : null;
  }

  findBy(column, value) {
    return this._rowsOf(column, value).map((r) => this._readRow(r));
  }

  // ---------- write ----------
  insert(obj) {
    this.sheet().appendRow(this._objectToRow(obj));
    this._all = null;
    return obj;
  }

  insertMany(objs) {
    if (!objs.length) return [];
    const sh = this.sheet();
    const rows = objs.map((o) => this._objectToRow(o));
    const start = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(start, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
    this._all = null;
    return objs;
  }

  update(id, patch) {
    const rows = this._rowsOf('id', id);
    if (!rows.length) throw Errors.notFound(this.table.sheet);
    const merged = Object.assign(this._readRow(rows[0]), patch, { id: String(id) });
    const row = this._objectToRow(merged);
    this.sheet().getRange(rows[0], 1, 1, row.length).setValues([row]);
    this._all = null;
    return merged;
  }

  /** Update bila ada, jika tidak insert. */
  upsert(obj) {
    const rows = this._rowsOf('id', obj.id);
    if (rows.length) return this.update(obj.id, obj);
    return this.insert(obj);
  }

  /** Update banyak baris sekaligus (1x baca, 1x tulis). patches = { id: {kolom: nilai} } */
  updateMany(patches) {
    const sh = this.sheet();
    const last = sh.getLastRow();
    if (last < 2) return 0;
    const range = sh.getRange(2, 1, last - 1, sh.getLastColumn());
    const values = range.getValues();
    const idCol = this._headerIndex().idx.id;
    let n = 0;
    values.forEach((row, i) => {
      const patch = patches[String(row[idCol])];
      if (!patch) return;
      values[i] = this._objectToRow(Object.assign(this._rowToObject(row), patch, { id: String(row[idCol]) }));
      n++;
    });
    if (n) range.setValues(values);
    this._all = null;
    return n;
  }

  /** Hapus semua baris yang memenuhi predicate (menulis ulang isi sheet sekali). */
  deleteWhere(predicate) {
    return Lock.run(() => {
      const all = this.findAll();
      const keep = all.filter((o) => !predicate(o));
      const removed = all.length - keep.length;
      if (!removed) return 0;
      const sh = this.sheet();
      const width = sh.getLastColumn();
      sh.getRange(2, 1, sh.getLastRow() - 1, width).clearContent();
      if (keep.length) {
        sh.getRange(2, 1, keep.length, width).setNumberFormat('@').setValues(keep.map((o) => this._objectToRow(o)));
      }
      this._all = null;
      return removed;
    });
  }

  delete(id) {
    return Lock.run(() => {
      const rows = this._rowsOf('id', id).sort((a, b) => b - a);
      rows.forEach((r) => this.sheet().deleteRow(r));
      this._all = null;
      return rows.length > 0;
    });
  }

  deleteBy(column, value) {
    return Lock.run(() => {
      const rows = this._rowsOf(column, value).sort((a, b) => b - a);
      rows.forEach((r) => this.sheet().deleteRow(r));
      this._all = null;
      return rows.length;
    });
  }
}
