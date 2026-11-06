/** Menyediakan Spreadsheet database. ID disimpan di Script Properties oleh setup(). */
const SpreadsheetProvider = {
  _cached: null,
  get() {
    if (this._cached) return this._cached;
    const id = PropertiesService.getScriptProperties().getProperty(PROP.SPREADSHEET_ID);
    const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw Errors.rule('NOT_CONFIGURED', 'Database belum disiapkan. Jalankan fungsi setup().');
    this._cached = ss;
    return ss;
  },
};
