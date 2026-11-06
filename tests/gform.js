/** Uji alur Google Form: admin/guru buat soal -> deploy -> siswa token -> sinkron hasil. node tests/gform.js */
const { load } = require('./harness');
const { run, forms } = load();

let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name, extra === undefined ? '' : JSON.stringify(extra)); } }
const call = (action, data, token) => run(`ApiRouter.dispatch(${JSON.stringify({ action, data, token })})`);
const must = (r, label) => { if (!r.success) throw new Error(`${label}: ${JSON.stringify(r.error)}`); return r.data; };
const login = (role, u, p) => must(call('auth.login', { role, username: u, password: p }), 'login ' + u).token;

(function main() {
  const setup = run('setup()');
  const A = login('admin', 'admin', setup.admin.password);

  console.log('# data dasar');
  const mapel = must(call('admin.mapel.save', { nama: 'IPA' }, A), 'mapel');
  const jenis = must(call('admin.jenisUjian.list', {}, A), 'jenis')[0];
  const guru = must(call('admin.guru.save', { username: 'sari', nama: 'Bu Sari' }, A), 'guru');
  const pgs = must(call('admin.penugasan.save', { guruId: guru.id, mapelId: mapel.id, jenisUjianId: jenis.id, durasiMenit: 30 }, A), 'pgs');
  const imp = must(call('admin.siswa.import', { siswa: [
    { nis: '001', nama: 'Ani', kelas: 'X-1', jenjang: 'SMA' }, { nis: '002', nama: 'Budi', kelas: 'X-1', jenjang: 'SMA' },
    { nis: '003', nama: 'Cici', kelas: 'X-1', jenjang: 'SMA' }, { nis: '004', nama: 'Dedi', kelas: 'X-1', jenjang: 'SMA' },
  ] }, A), 'import');
  const pw = {}; imp.kredensial.forEach((k) => { pw[k.nis] = k.password; });
  const G = login('guru', 'sari', guru.password);

  console.log('# admin membuat ujian & soal atas nama guru');
  const u = must(call('ujian.save', { penugasanId: pgs.id, judul: 'UH Sel', deskripsi: 'Bab 1', durasiMenit: 20, tampilNilai: true }, A), 'ujian admin');
  check('ujian dibuat admin, milik guru', u.guruId === guru.id && u.mode === 'native' && u.token.length === 6);
  const U = u.id;
  const mk = (o, tk) => must(call('soal.save', Object.assign({ ujianId: U }, o), tk || A), 'soal ' + o.tipe);
  const s1 = mk({ tipe: 'pg', teks: 'Organel penghasil energi?', opsi: ['Ribosom', 'Mitokondria', 'Nukleus'], kunci: 'B', bobot: 2 });
  mk({ tipe: 'multi', teks: 'Yang termasuk hewan:', opsi: ['Kucing', 'Mawar', 'Ayam'], kunci: ['A', 'C'], bobot: 2 }, G);
  mk({ tipe: 'isian', teks: 'Ibukota Indonesia?', kunci: ['Jakarta'], bobot: 2 });
  const s4 = mk({ tipe: 'essay', teks: 'Jelaskan fotosintesis', kunci: '', bobot: 4 });
  mk({ tipe: 'jodoh', teks: 'Jodohkan hewan', opsi: { kiri: ['Kucing', 'Ayam'], kanan: ['Mengeong', 'Berkokok', 'Menggonggong'] }, kunci: { L1: 'R1', L2: 'R2' }, bobot: 4 });
  check('guru ikut bisa menambah soal (rute bersama)', must(call('soal.list', { ujianId: U }, G), 'sl').length === 5);
  must(call('peserta.set', { ujianId: U, nisList: ['001', '002', '003'] }, A), 'peserta admin');

  console.log('# guru mengaktifkan ujian sendiri; ujian belum di-deploy');
  must(call('ujian.setAktif', { id: U, aktif: true }, G), 'aktif guru');
  const S1 = login('siswa', '001', pw['001']);
  const lst0 = must(call('siswa.ujian.list', {}, S1), 'list0').ujian[0];
  check('dashboard: mode native sebelum deploy', lst0.mode === 'native');
  must(call('ujian.setAktif', { id: U, aktif: false }, G), 'nonaktif');

  console.log('# deploy ke Google Form');
  const dep = must(call('ujian.deployForm', { id: U }, G), 'deploy');
  const form = forms[dep.formId];
  check('form dibuat', !!form && dep.baru === true && dep.formUrl.includes('/viewform') && dep.formEditUrl.includes('/edit'));
  const titles = form.items.map((i) => i.title);
  check('item: NIS, Nama, pindah halaman, lalu soal', titles[0] === 'NIS' && titles[1] === 'Nama' && form.items[2].kind === 'pagebreak' && form.items.length === 3 + 6, titles);
  check('NIS & Nama wajib, soal tidak wajib', form.items[0].required && form.items[1].required && !form.items[3].required);
  check('pilihan ganda: opsi sesuai, tanpa kunci', form.items[3].kind === 'choice' && form.items[3].choices.join('|') === 'Ribosom|Mitokondria|Nukleus');
  check('multi opsi -> checkbox', form.items[4].kind === 'checkbox');
  check('jodoh -> 2 dropdown (satu per baris kiri)', form.items[7].kind === 'dropdown' && form.items[8].kind === 'dropdown' && form.items[7].choices.length === 3);
  check('acak soal & form menerima jawaban mengikuti status ujian', form.settings.setShuffleQuestions === true && form.accepting === false);
  check('tidak ada kunci jawaban di dalam form (hanya teks pilihan)', form.items.every((i) => !('correct' in i) && !JSON.stringify(i.choices).includes('kunci')));
  const dep2 = must(call('ujian.deployForm', { id: U }, A), 'redeploy');
  check('deploy ulang memakai form yang sama (link tetap)', dep2.formId === dep.formId && dep2.baru === false && forms[dep.formId].items.length === 9);

  console.log('# kegagalan FormApp ditampilkan jelas (bukan "kesalahan server")');
  run('globalThis.__origDeploy = FormGateway.prototype.deploy; FormGateway.prototype.deploy = function () { throw new Error("You do not have permission to call FormApp.create. Required permissions: https://www.googleapis.com/auth/forms"); };');
  const bad = call('ujian.deployForm', { id: U }, G);
  check('deploy gagal -> FORM_GAGAL + pesan asli + petunjuk setup', bad.error.code === 'FORM_GAGAL' && /permission/.test(bad.error.message) && /setup/.test(bad.error.message), bad.error);
  run('FormGateway.prototype.deploy = globalThis.__origDeploy;');

  console.log('# aktif/nonaktif ikut membuka/menutup form');
  must(call('ujian.setAktif', { id: U, aktif: true }, G), 'aktif2');
  check('ujian aktif -> form menerima jawaban', form.accepting === true);

  console.log('# siswa (alur Flutter): login -> dashboard -> token -> link form');
  const S2 = login('siswa', '002', pw['002']), S3 = login('siswa', '003', pw['003']);
  const lst = must(call('siswa.ujian.list', {}, S1), 'list1').ujian[0];
  check('dashboard menampilkan ujian aktif mode gform', lst.mode === 'gform' && lst.status === 'belum' && lst.bisaMulai === true);
  check('token salah ditolak', call('siswa.ujian.start', { ujianId: U, token: 'SALAH1' }, S1).error.code === 'TOKEN_INVALID');
  check('bukan peserta ditolak', call('siswa.ujian.start', { ujianId: U, token: u.token }, login('siswa', '004', pw['004'])).error.code === 'BUKAN_PESERTA');
  const st = must(call('siswa.ujian.start', { ujianId: U, token: u.token.toLowerCase() }, S1), 'start');
  check('payload: mode gform + formUrl, tanpa soal/kunci', st.mode === 'gform' && st.formUrl.startsWith('https://docs.google.com/forms/') && !st.soal && !/kunci/.test(JSON.stringify(st)));
  check('NIS & nama terisi otomatis di link', st.formUrl.includes('=001') && st.formUrl.includes('Ani'), st.formUrl);
  check('timer server tetap berjalan (sisaDetik)', st.sesi.sisaDetik > 1190 && st.sesi.sisaDetik <= 1200);
  const again = must(call('siswa.ujian.start', { ujianId: U, token: '' }, S1), 'resume');
  check('lanjutkan tanpa token', again.mode === 'gform' && again.sesi.id === st.sesi.id);
  check('simpan jawaban via API ditolak di mode gform', call('siswa.jawaban.save', { sesiId: st.sesi.id, answers: [{ soalId: s1.id, jawaban: 'B' }] }, S1).error.code === 'MODE_GFORM');
  must(call('siswa.ujian.start', { ujianId: U, token: u.token }, S2), 'start2');
  console.log('# kode keluar pengawas (dibuat guru/admin, diverifikasi server)');
  check('ujian baru otomatis punya kode keluar 6 karakter', typeof u.kodeKeluar === 'string' && u.kodeKeluar.length === 6, u.kodeKeluar);
  check('kode keluar tidak bocor ke payload siswa', !JSON.stringify(st).includes(u.kodeKeluar) && !JSON.stringify(lst).includes(u.kodeKeluar));
  check('kode keluar salah ditolak', call('siswa.sesi.exit', { sesiId: st.sesi.id, kode: 'SALAH1' }, S1).error.code === 'KODE_KELUAR_SALAH');
  check('token ujian BUKAN kode keluar', call('siswa.sesi.exit', { sesiId: st.sesi.id, kode: u.token }, S1).error.code === 'KODE_KELUAR_SALAH');
  check('kode keluar benar diterima (tak peka huruf besar/kecil)', must(call('siswa.sesi.exit', { sesiId: st.sesi.id, kode: ' ' + u.kodeKeluar.toLowerCase() + ' ' }, S1), 'exit').ok === true);
  check('sesi milik siswa lain tidak bisa diverifikasi', call('siswa.sesi.exit', { sesiId: st.sesi.id, kode: u.kodeKeluar }, login('siswa', '002', pw['002'])).error.code === 'NOT_FOUND');
  for (let i = 0; i < 5; i++) call('siswa.sesi.exit', { sesiId: st.sesi.id, kode: 'NGAWUR' }, S1);
  check('percobaan salah berulang dikunci sementara', call('siswa.sesi.exit', { sesiId: st.sesi.id, kode: u.kodeKeluar }, S1).error.code === 'TOO_MANY_ATTEMPTS');
  const kk = must(call('ujian.generateKodeKeluar', { id: U }, G), 'gen kode');
  check('guru bisa generate ulang kode keluar', kk.kodeKeluar.length === 6 && kk.kodeKeluar !== u.kodeKeluar);
  const guru2 = must(call('admin.guru.save', { username: 'joko', nama: 'Pak Joko' }, A), 'guru2');
  check('guru lain tidak boleh generate kode keluar', call('ujian.generateKodeKeluar', { id: U }, login('guru', 'joko', guru2.password)).error.code === 'FORBIDDEN');
  must(call('siswa.ujian.start', { ujianId: U, token: u.token }, S3), 'start3');

  console.log('# cache lintas-eksekusi (tiap panggilan = eksekusi baru)');
  const fresh = () => run('Container.reset(); SpreadsheetProvider._cached = null;');
  fresh(); const g1 = must(call('admin.guru.list', {}, A), 'guru1'); fresh(); const g2 = must(call('admin.guru.list', {}, A), 'guru2 (dari cache)');
  check('daftar dari cache sama dengan pembacaan sheet', JSON.stringify(g1) === JSON.stringify(g2) && g1.length >= 1);
  must(call('admin.guru.save', { id: guru.id, username: 'sari', nama: 'Bu Sari Baru' }, A), 'ubah guru');
  fresh(); check('tulisan membatalkan cache (nama baru langsung terlihat)', must(call('admin.guru.list', {}, A), 'guru3').some((x) => x.nama === 'Bu Sari Baru'));
  fresh(); const ul1 = must(call('ujian.list', {}, A), 'ul1'); fresh(); const ul2 = must(call('ujian.list', {}, A), 'ul2');
  check('ujian.list konsisten (jumlah soal/peserta dihitung tanpa memuat seluruh Soal)', JSON.stringify(ul1) === JSON.stringify(ul2) && ul1[0].jumlahSoal === 5 && ul1[0].jumlahPeserta === 3, ul1[0] && { s: ul1[0].jumlahSoal, p: ul1[0].jumlahPeserta });
  fresh(); check('sesi login tetap valid pada eksekusi baru (users dari cache)', call('admin.guru.list', {}, A).success === true);
  const big = 'x'.repeat(95000) + 'é€';
  run(`ChunkCache.put('t:big', ${JSON.stringify(big)}, 60)`);
  check('ChunkCache memecah & merakit string >100KB', run("ChunkCache.get('t:big')") === big);
  check('ChunkCache.get kunci tak ada -> null', run("ChunkCache.get('t:none')") === null);

  console.log('# sinkron respons Form -> nilai');
  const items = Object.fromEntries(['nis', 'nama'].map((k, i) => [k, form.items[i].id]));
  const q = (n) => form.items[2 + n].id; // 1..6
  const now = Date.now();
  const full = (nis, extra) => Object.assign({
    [items.nis]: nis, [items.nama]: 'x',
    [q(1)]: 'Mitokondria', [q(2)]: ['Kucing', 'Ayam'], [q(3)]: '  jakarta ', [q(4)]: 'Proses membuat makanan', [q(5)]: 'Mengeong', [q(6)]: 'Berkokok',
  }, extra || {});
  form.__addResponse(now + 60000, full('001'));                                 // semua benar, essay menunggu
  form.__addResponse(now + 120000, full('002', { [q(1)]: 'Ribosom', [q(5)]: 'Berkokok' })); // salah 1 pg + 1 pasangan
  form.__addResponse(now + 30 * 60000, full('003'));                            // terlambat (batas 20 menit)
  form.__addResponse(now + 61000, full('001', { [q(1)]: 'Ribosom' }));          // pengiriman ganda NIS 001 (diabaikan)
  form.__addResponse(now + 62000, full('999'));                                 // NIS tak punya sesi
  const sync = must(call('hasil.syncForm', { ujianId: U }, G), 'sync');
  check('sinkron: 3 sesi, 1 ganda, 1 tanpa sesi, 1 terlambat', sync.disinkronkan === 3 && sync.ganda === 1 && sync.tanpaSesi.length === 1 && sync.terlambat === 1, sync);
  check('essay menunggu koreksi', sync.perluKoreksi === 3);
  let hasil = must(call('hasil.list', { ujianId: U }, G), 'hasil');
  const byNis = (n) => hasil.find((h) => h.nis === n);
  check('nilai: dikunci sampai essay dinilai (perluKoreksi)', byNis('001').perluKoreksi === true && byNis('001').status === 'selesai' && byNis('003').terlambat === true);
  // 001: pg 2 + multi 2 + isian 2 + jodoh 4 = 10 dari 12 (essay 4 belum) -> max total 14
  const d1 = must(call('hasil.detail', { sesiId: byNis('001').sesiId }, G), 'detail');
  check('detail menampilkan jawaban dari Form', d1.soal.find((x) => x.tipe === 'pg').jawaban === 'B' && d1.soal.find((x) => x.tipe === 'jodoh').jawaban.L1 === 'R1');
  const essayId = d1.soal.find((x) => x.tipe === 'essay').soalId;
  const sc = must(call('hasil.nilaiEssay', { sesiId: byNis('001').sesiId, soalId: essayId, skor: 4 }, G), 'essay');
  check('nilai akhir 100 setelah essay dinilai', sc.nilai === 100 && sc.perluKoreksi === false, sc);
  const sync2 = must(call('hasil.syncForm', { ujianId: U }, G), 'sync2');
  check('sinkron ulang inkremental: tidak membaca ulang respons lama', sync2.baru === 0 && sync2.disinkronkan === 0);
  const sync2p = must(call('hasil.syncForm', { ujianId: U, penuh: true }, G), 'sync2p');
  check('sinkron penuh: respons lama dilewati, tidak menimpa nilai essay', sync2p.disinkronkan === 0 && sync2p.dilewati === 3 && sync2p.ganda === 1);
  form.__addResponse(Date.now() + 40 * 60000, full('001', { [q(1)]: 'Ribosom' })); // kiriman ganda SESUDAH sinkron
  const sync2g = must(call('hasil.syncForm', { ujianId: U }, G), 'sync2g');
  check('sinkron inkremental: hanya respons baru; kiriman ganda lintas-sinkron tidak menimpa', sync2g.baru === 1 && sync2g.ganda === 1 && sync2g.disinkronkan === 0, sync2g);
  check('trigger menyinkronkan ujian aktif tanpa error', typeof run("Container.get('formResultService').syncActive()") === 'number');
  hasil = must(call('hasil.list', { ujianId: U }, G), 'hasil2');
  check('nilai 001 tetap 100 setelah sinkron ulang', byNis('001') && hasil.find((h) => h.nis === '001').nilai === 100);
  const d2 = must(call('hasil.detail', { sesiId: hasil.find((h) => h.nis === '002').sesiId }, G), 'detail2');
  check('002: pg salah, pasangan sebagian benar (2+0 + 2 + 2 + 2 dari 10, essay menunggu)', d2.soal.filter((x) => !x.manual).reduce((m, x) => m + x.skor, 0) === 6, d2.soal.map((x) => [x.tipe, x.skor]));
  const l1 = must(call('siswa.ujian.list', {}, S1), 'list-after').ujian[0];
  check('siswa melihat nilai setelah sinkron (tampilNilai)', l1.status === 'selesai' && l1.nilai === 100);

  console.log('# form usang, token, penutupan otomatis');
  const u2 = must(call('ujian.save', { penugasanId: pgs.id, judul: 'UH 2', durasiMenit: 10 }, G), 'u2');
  mk2 = (o) => must(call('soal.save', Object.assign({ ujianId: u2.id }, o), G), 'soal2');
  mk2({ tipe: 'pg', teks: 'A?', opsi: ['x', 'y'], kunci: 'A' });
  must(call('peserta.set', { ujianId: u2.id, nisList: ['001'] }, G), 'p2');
  must(call('ujian.deployForm', { id: u2.id }, G), 'dep u2');
  must(call('ujian.setAktif', { id: u2.id, aktif: true }, G), 'akt u2');
  mk2({ tipe: 'isian', teks: 'B?', kunci: ['b'] });
  check('soal berubah setelah deploy -> ujian ditandai usang', must(call('ujian.list', {}, G), 'l').find((x) => x.id === u2.id).formStale === true);
  check('siswa tidak bisa mulai saat form usang', call('siswa.ujian.start', { ujianId: u2.id, token: u2.token }, S1).error.code === 'FORM_USANG');
  must(call('ujian.deployForm', { id: u2.id }, G), 'redeploy u2');
  check('setelah deploy ulang, siswa bisa mulai', call('siswa.ujian.start', { ujianId: u2.id, token: u2.token }, S1).success === true);
  check('deploy ulang ditolak setelah ada yang mengerjakan', call('ujian.deployForm', { id: U }, G).error.code === 'UJIAN_SUDAH_DIKERJAKAN');
  check('soal duplikat opsi ditolak saat deploy', (() => {
    const u3 = must(call('ujian.save', { penugasanId: pgs.id, judul: 'UH 3' }, G), 'u3');
    must(call('soal.save', { ujianId: u3.id, tipe: 'pg', teks: 'Q', opsi: ['sama', 'Sama'], kunci: 'A' }, G), 's3');
    return call('ujian.deployForm', { id: u3.id }, G).error.code === 'VALIDATION_ERROR';
  })());
  // jadwal tutup lewat -> form ditutup trigger
  const past = new Date(Date.now() - 3600000).toISOString();
  run(`Container.get('repo.ujian').update(${JSON.stringify(u2.id)}, { selesai: ${JSON.stringify(past)} })`);
  check('trigger menutup form yang jadwalnya lewat', run('Container.get("formDeployService").closeExpired()') === 1 && forms[must(call('ujian.list', {}, G), 'l').find((x) => x.id === u2.id).formId].accepting === false);
  must(call('ujian.setAktif', { id: U, aktif: false }, A), 'nonaktif admin');
  check('menonaktifkan ujian menutup form', form.accepting === false);
  check('guru tidak bisa deploy ujian guru lain', (() => {
    const g2 = must(call('admin.guru.save', { username: 'lain', nama: 'Lain' }, A), 'g2');
    const T = login('guru', 'lain', g2.password);
    return call('ujian.deployForm', { id: U }, T).error.code === 'FORBIDDEN';
  })());

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})();
