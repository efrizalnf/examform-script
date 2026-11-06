/**
 * Instalasi awal — jalankan dari editor Apps Script (pilih `setup` lalu Run), sekali saja.
 * Aman dijalankan ulang (idempotent).
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP.SPREADSHEET_ID)) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Script harus dibuat dari Spreadsheet (Extensions > Apps Script).');
    props.setProperty(PROP.SPREADSHEET_ID, ss.getId());
  }
  if (!props.getProperty(PROP.AUTH_SECRET)) {
    props.setProperty(PROP.AUTH_SECRET, CryptoUtil.randomString(48, ALPHABET.PASSWORD));
  }
  Container.reset();
  SpreadsheetProvider._cached = null;

  Object.keys(Schema).forEach((key) => Container.get(`repo.${key}`).sheet());
  _removeDefaultSheet();

  const result = { admin: null };
  if (!Container.get('repo.users').where((u) => u.role === ROLE.ADMIN).length) {
    result.admin = Container.get('userService').createAccount({ username: 'admin', nama: 'Administrator', role: ROLE.ADMIN });
    console.log(`ADMIN DIBUAT -> username: admin | password: ${result.admin.password}  (segera ganti setelah login)`);
  }
  const jenis = Container.get('repo.jenisUjian');
  if (!jenis.findAll().length) ['Ulangan Harian', 'PTS', 'PAS'].forEach((n) => Container.get('jenisUjianService').save({ nama: n }));

  installTriggers();
  return result;
}

function installTriggers() {
  const handler = 'finalizeExpiredSessionsJob';
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === handler).forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(EXAM.FINALIZE_TRIGGER_MINUTES).create();
}

/** Darurat: reset password admin ke nilai acak (lihat di Execution log). */
function resetAdminPassword() {
  const admin = Container.get('repo.users').where((u) => u.role === ROLE.ADMIN)[0];
  if (!admin) throw new Error('Admin belum ada. Jalankan setup().');
  const r = Container.get('userService').resetPassword(admin.id);
  console.log(`Password admin baru: ${r.password}`);
}

function _removeDefaultSheet() {
  const ss = SpreadsheetProvider.get();
  ['Sheet1', 'Lembar1'].forEach((n) => {
    const sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() <= 1 && sh.getLastColumn() <= 1) ss.deleteSheet(sh);
  });
}
