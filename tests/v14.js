/** Uji fitur v1.4: email guru + hak edit Form, bank soal, statistik beranda. node tests/v14.js */
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
  const mapel = must(call('admin.mapel.save', { nama: 'IPA' }, A), 'mapel');
  const mapel2 = must(call('admin.mapel.save', { nama: 'IPS' }, A), 'mapel2');
  const jenis = must(call('admin.jenisUjian.list', {}, A), 'jenis')[0];

  console.log('# email guru');
  check('format email salah ditolak', call('admin.guru.save', { username: 'x', nama: 'X', email: 'bukan-email' }, A).error.code === 'VALIDATION_ERROR');
  const g = must(call('admin.guru.save', { username: 'sari', nama: 'Bu Sari' }, A), 'guru');
  check('email opsional (kosong)', g.email === '');
  const g2 = must(call('admin.guru.save', { username: 'doni', nama: 'Pak Doni', email: 'Doni@Sekolah.SCH.id' }, A), 'guru2');
  check('email dinormalkan huruf kecil', g2.email === 'doni@sekolah.sch.id');
  check('email ganda ditolak', call('admin.guru.save', { id: g.id, username: 'sari', nama: 'Bu Sari', email: 'doni@sekolah.sch.id' }, A).error.code === 'CONFLICT');
  must(call('admin.guru.save', { id: g.id, username: 'sari', nama: 'Bu Sari', email: 'sari@sekolah.sch.id' }, A), 'ubah email');
  check('daftar guru memuat email', must(call('admin.guru.list', {}, A), 'gl').find((x) => x.id === g.id).email === 'sari@sekolah.sch.id');

  const pgs = must(call('admin.penugasan.save', { guruId: g.id, mapelId: mapel.id, jenisUjianId: jenis.id, durasiMenit: 30 }, A), 'pgs');
  const pgs2 = must(call('admin.penugasan.save', { guruId: g.id, mapelId: mapel2.id, jenisUjianId: jenis.id, durasiMenit: 30 }, A), 'pgs2');
  const G = login('guru', 'sari', g.password);
  const u1 = must(call('ujian.save', { penugasanId: pgs.id, judul: 'UH 1', durasiMenit: 20 }, G), 'u1');
  const u2 = must(call('ujian.save', { penugasanId: pgs.id, judul: 'UH 2', durasiMenit: 20 }, G), 'u2');
  const u3 = must(call('ujian.save', { penugasanId: pgs2.id, judul: 'UH IPS', durasiMenit: 20 }, G), 'u3');
  check('daftar ujian memuat email guru', must(call('ujian.list', {}, G), 'l')[0].guruEmail === 'sari@sekolah.sch.id');
  const mk = (uj, o) => must(call('soal.save', Object.assign({ ujianId: uj }, o), G), 'soal');
  mk(u1.id, { tipe: 'pg', teks: 'Organel penghasil energi?', opsi: ['Ribosom', 'Mitokondria'], kunci: 'B', bobot: 2 });
  mk(u1.id, { tipe: 'isian', teks: 'Ibukota Indonesia?', kunci: ['Jakarta'], bobot: 1 });
  mk(u1.id, { tipe: 'jodoh', teks: 'Jodohkan', opsi: { kiri: ['Kucing'], kanan: ['Mengeong', 'Berkokok'] }, kunci: { L1: 'R1' }, bobot: 2 });

  console.log('# hak edit Google Form hanya email guru terdaftar');
  const dep = must(call('ujian.deployForm', { id: u1.id }, G), 'deploy');
  check('deploy: guru beremail -> editor ditambahkan', dep.akses.status === 'ok' && forms[dep.formId].editors.join() === 'sari@sekolah.sch.id', dep.akses);
  forms[dep.formId].addEditor('orang.luar@gmail.com');
  const sync = must(call('ujian.syncEditors', { id: u1.id }, G), 'sync');
  check('editor di luar data guru dicabut', sync.status === 'ok' && forms[dep.formId].editors.join() === 'sari@sekolah.sch.id', forms[dep.formId].editors);
  const g3 = must(call('admin.guru.save', { username: 'tanpa', nama: 'Tanpa Email' }, A), 'g3');
  check('guru lain tak boleh atur editor ujian ini', call('ujian.syncEditors', { id: u1.id }, login('guru', 'tanpa', g3.password)).error.code === 'FORBIDDEN');
  must(call('admin.guru.save', { id: g.id, username: 'sari', nama: 'Bu Sari', email: 'invalid@sekolah.sch.id' }, A), 'email invalid google');
  const s2 = must(call('ujian.syncEditors', { id: u1.id }, A), 'sync2');
  check('kegagalan akun Google dilaporkan, tidak melempar', s2.status === 'gagal' && s2.gagal.length === 1, s2);
  must(call('admin.guru.save', { id: g.id, username: 'sari', nama: 'Bu Sari', email: '' }, A), 'hapus email');
  check('tanpa email -> status tanpa_email', must(call('ujian.syncEditors', { id: u1.id }, A), 'sync3').status === 'tanpa_email');
  must(call('admin.guru.save', { id: g.id, username: 'sari', nama: 'Bu Sari', email: 'sari@sekolah.sch.id' }, A), 'email kembali');

  console.log('# bank soal');
  const sv = must(call('bank.saveFromUjian', { ujianId: u1.id }, G), 'simpan bank');
  check('3 soal disimpan ke bank', sv.disimpan === 3 && sv.duplikat === 0, sv);
  const sv2 = must(call('bank.saveFromUjian', { ujianId: u1.id }, G), 'simpan lagi');
  check('simpan ulang -> duplikat dilewati', sv2.disimpan === 0 && sv2.duplikat === 3, sv2);
  const bl = must(call('bank.list', {}, G), 'bl');
  check('bank berisi 3 soal dengan nama mapel', bl.length === 3 && bl[0].mapelNama === 'IPA');
  check('filter tipe & cari', must(call('bank.list', { tipe: 'isian' }, G), 'f').length === 1 && must(call('bank.list', { q: 'organel' }, G), 'f2').length === 1);
  check('filter mapel', must(call('bank.list', { mapelId: mapel2.id }, G), 'f3').length === 0);
  check('guru lain tak melihat bank orang lain', must(call('bank.list', {}, login('guru', 'tanpa', g3.password)), 'o').length === 0);
  const T = login('guru', 'tanpa', g3.password);
  check('guru lain tak bisa impor bank orang lain', call('bank.import', { ujianId: u2.id, bankIds: [bl[0].id] }, T).error.code === 'FORBIDDEN');
  const im = must(call('bank.import', { ujianId: u2.id, bankIds: bl.map((b) => b.id) }, G), 'impor');
  check('impor 3 soal ke ujian lain', im.ditambah === 3 && im.dilewati === 0, im);
  const sl = must(call('soal.list', { ujianId: u2.id }, G), 'sl');
  check('soal hasil impor utuh (opsi, kunci, urutan)', sl.length === 3 && sl[0].opsi.length === 2 && sl[0].kunci === 'B' && sl.map((x) => x.urutan).join() === '1,2,3');
  const im2 = must(call('bank.import', { ujianId: u2.id, bankIds: bl.map((b) => b.id) }, G), 'impor2');
  check('impor ulang -> dilewati', im2.ditambah === 0 && im2.dilewati === 3, im2);
  check('soal tak bisa diimpor bila sudah ada pengerjaan', (() => {
    run(`Container.get('repo.sesi').insert({ id: 'ses_x', ujianId: '${u2.id}', nis: '1', status: 'berlangsung' })`);
    return call('bank.import', { ujianId: u2.id, bankIds: [bl[0].id] }, G).error.code === 'UJIAN_SUDAH_DIKERJAKAN';
  })());
  check('hapus dari bank', must(call('bank.remove', { id: bl[0].id }, G), 'rm').deleted && must(call('bank.list', {}, G), 'bl2').length === 2);
  check('admin melihat semua bank', must(call('bank.list', {}, A), 'ba').length === 2);

  console.log('# statistik beranda');
  const sa = must(call('dashboard.stats', {}, A), 'stat admin');
  check('admin: total sistem', sa.ujian === 3 && sa.guru === 3 && sa.soal === 6 && sa.bankSoal === 2 && sa.terbaru.length === 3 && sa.sesiBerlangsung === 1, sa);
  const sg = must(call('dashboard.stats', {}, G), 'stat guru');
  check('guru: hanya miliknya, tanpa angka siswa/guru', sg.ujian === 3 && sg.siswa === undefined && sg.formTerpasang === 1, sg);
  check('guru tanpa ujian: nol', must(call('dashboard.stats', {}, T), 'st').ujian === 0);

  console.log('# jenjang baku');
  check('jenjang tak dikenal ditolak', call('admin.siswa.save', { nis: '9', nama: 'X', kelas: '1A', jenjang: 'Kuliah' }, A).error.code === 'VALIDATION_ERROR');
  check('variasi ditulis baku (sd -> SD/MI, MTs -> SMP/MTs)', must(call('admin.siswa.save', { nis: '9', nama: 'X', kelas: '1A', jenjang: 'sd' }, A), 's1').jenjang === 'SD/MI' && must(call('admin.siswa.save', { nis: '10', nama: 'Y', kelas: '7A', jenjang: 'MTs' }, A), 's2').jenjang === 'SMP/MTs');
  check('filter siswa per jenjang', must(call('admin.siswa.list', { jenjang: 'SMP/MTs' }, A), 'f').length === 1);
  check('meta.options memuat daftar jenjang', must(call('meta.options', {}, A), 'm').jenjang.join() === 'SD/MI,SMP/MTs,SMA/MA');

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})();
