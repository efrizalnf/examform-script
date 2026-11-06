/** Smoke test UI dengan Chromium: google.script.run di-stub ke backend (mock). Butuh playwright. */
const { chromium } = require('playwright');
const { load, renderIndex } = require('./harness');
const fs = require('fs');

(async () => {
  const { run } = load();
  const setup = run('setup()');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.exposeFunction('__apiRequest', (text) => run(`apiRequest(${JSON.stringify(text)})`));
  const html = renderIndex();
  await page.setContent(html);
  await page.evaluate(() => {
    function mk() { return { _s: () => {}, _f: () => {},
      withSuccessHandler(cb) { const n = mk(); n._s = cb; n._f = this._f; return n; },
      withFailureHandler(cb) { const n = mk(); n._f = cb; n._s = this._s; return n; },
      apiRequest(t) { window.__apiRequest(t).then(this._s, (e) => this._f(e)); } }; }
    window.google = { script: { run: mk() } };
  });
  const steps = [];
  const ok = (name, cond) => { steps.push([name, !!cond]); console.log((cond ? '  ok  ' : '  FAIL ') + name); };

  // login admin
  await page.selectOption('select[name=role]', 'admin');
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', setup.admin.password);
  await page.click('button[type=submit]');
  await page.waitForSelector('aside nav button');
  ok('admin masuk & menu tampil', (await page.locator('aside nav button').count()) === 6);

  const nav = async (label) => { await page.click(`aside nav button:has-text("${label}")`); await page.waitForTimeout(150); };
  // mapel
  await nav('Mata Pelajaran'); await page.click('text=+ Tambah mata pelajaran');
  await page.fill('input[name=nama]', 'Fisika'); await page.click('.modal button.primary'); await page.waitForSelector('td:has-text("Fisika")');
  ok('tambah mapel', true);
  // guru
  await nav('Guru'); await page.click('text=+ Tambah guru');
  await page.fill('input[name=nama]', 'Bu Sari'); await page.fill('input[name=username]', 'sari'); await page.click('.modal button.primary');
  await page.waitForSelector('.mono');
  const guruPw = (await page.locator('.modal .mono').first().textContent()).trim();
  ok('password guru ditampilkan', guruPw.length === 8);
  await page.click('.modal button.primary:has-text("Tutup")');
  // penugasan
  await nav('Penugasan Guru'); await page.click('text=+ Tambah penugasan');
  await page.click('.modal button.primary'); await page.waitForSelector('td:has-text("Fisika")');
  ok('penugasan guru', true);
  // siswa import
  await nav('Siswa'); await page.click('text=Impor massal');
  await page.fill('.modal textarea', '00123\tAni\tX-1\tSMA\n00124\tBudi\tX-1\tSMA');
  await page.click('.modal button.primary:has-text("Impor")'); await page.waitForSelector('.modal .mono');
  ok('impor siswa + kredensial', (await page.locator('.modal .mono').count()) === 2);
  await page.click('.modal button.primary:has-text("Tutup")');
  await page.waitForSelector('td:has-text("Ani")');
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/admin-siswa.png' : '/tmp/admin-siswa.png' });

  // guru
  await page.click('button:has-text("Keluar")');
  await page.selectOption('select[name=role]', 'guru'); await page.fill('input[name=username]', 'sari'); await page.fill('input[name=password]', guruPw);
  await page.click('button[type=submit]'); await page.waitForSelector('td:has-text("Fisika")');
  ok('guru melihat mapel', true);
  await nav('Ujian, Soal & Peserta'); await page.click('text=+ Buat ujian');
  await page.fill('input[name=judul]', 'UH Gerak'); await page.fill('input[name=durasiMenit]', '40'); await page.click('.modal button.primary');
  await page.waitForSelector('td:has-text("UH Gerak")');
  ok('buat ujian dengan waktu 40 menit', (await page.locator('td:has-text("40 mnt")').count()) === 1);
  await page.click('td button:text-is("Soal")'); await page.click('text=+ Tambah soal');
  await page.fill('.modal textarea >> nth=0', 'Satuan gaya?');
  const inputs = page.locator('.opt-row input[type=text]');
  const vals = ['Joule', 'Newton', 'Watt', 'Pascal'];
  for (let i = 0; i < 4; i++) await inputs.nth(i).fill(vals[i]);
  await page.locator('.opt-row input[type=radio]').nth(1).check();
  await page.click('.modal button.primary:has-text("Simpan")');
  await page.waitForSelector('td:has-text("Satuan gaya?")');
  ok('soal pilihan ganda tersimpan', (await page.locator('.qpreview .correct').textContent()).trim() === 'Newton');
  // tipe menjodohkan
  await page.click('text=+ Tambah soal'); await page.selectOption('.modal select', 'jodoh');
  await page.fill('.modal textarea >> nth=0', 'Jodohkan');
  const pi = page.locator('.opt-row input[type=text]');
  const pairs = [['Massa', 'kg'], ['Gaya', 'N'], ['Waktu', 's']];
  for (let i = 0; i < 3; i++) { await pi.nth(i * 2).fill(pairs[i][0]); await pi.nth(i * 2 + 1).fill(pairs[i][1]); }
  await page.click('.modal button.primary:has-text("Simpan")');
  await page.waitForSelector('td:has-text("Jodohkan")');
  ok('soal menjodohkan tersimpan', (await page.locator('text=Massa → kg').count()) === 1);
  await page.click('button:has-text("← Kembali")'); await page.waitForSelector('td:has-text("UH Gerak")');
  await page.click('td button:text-is("Peserta")'); await page.waitForSelector('td:has-text("Ani")');
  await page.click('text=Pilih yang tampil'); await page.click('button:has-text("Simpan peserta")');
  await page.waitForSelector('.toast:has-text("2 peserta")');
  ok('atur peserta', true);
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/guru-peserta.png' : '/tmp/guru-peserta.png' });

  ok('tidak ada error JS di konsol', errors.length === 0);
  if (errors.length) console.log(errors);
  await browser.close();
  process.exit(steps.every((s) => s[1]) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
