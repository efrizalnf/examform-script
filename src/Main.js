/**
 * Entry point Web App. Hanya delegasi — tanpa logika bisnis.
 *  - GET  ?action=ping        -> health check JSON
 *  - GET  (tanpa parameter)   -> Web UI Admin/Guru
 *  - POST body JSON           -> API (dipakai aplikasi Android siswa)
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping') return ApiResponse.toJsonOutput(ApiRouter.dispatch({ action: 'system.ping' }));
  return HtmlService.createHtmlOutput(_uiHtml())
    .setTitle('ExamForm CBT')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * HTML UI (hasil evaluasi template + semua include) disimpan di cache sehingga pembukaan halaman
 * tidak perlu membaca & menyusun belasan file tiap kali. Kunci memuat versi aplikasi -> otomatis
 * kedaluwarsa saat versi dinaikkan.
 */
function _uiHtml() {
  const key = 'ui:html:' + APP.VERSION;
  const hit = ChunkCache.get(key);
  if (hit) return hit;
  const html = HtmlService.createTemplateFromFile('web/Index').evaluate().getContent();
  ChunkCache.put(key, html, 21600);
  return html;
}

function doPost(e) {
  const text = e && e.postData ? e.postData.contents : '';
  return ApiResponse.toJsonOutput(ApiRouter.dispatchJson(text));
}

/** Dipanggil Web UI lewat google.script.run. Menerima & mengembalikan string JSON. */
function apiRequest(jsonText) {
  return JSON.stringify(ApiRouter.dispatchJson(jsonText));
}

/** Dipakai template HTML: <?!= include('web/Styles') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
