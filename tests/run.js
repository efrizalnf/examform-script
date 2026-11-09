/** Uji end-to-end backend dengan mock Apps Script: node tests/run.js */
const { load } = require('./harness');
const { run } = load();

let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name, extra || ''); } }
globalThis.api = (action, data, token) => run(`ApiRouter.dispatch(${JSON.stringify({ action, data, token })})`);
const call = (action, data, token) => globalThis.api(action, data, token);
const must = (r, label) => { if (!r.success) throw new Error(`${label}: ${JSON.stringify(r.error)}`); return r.data; };

(function main() {
  console.log('# setup');
  const setup = run('setup()');
  check('admin dibuat', setup.admin && setup.admin.password);
  check('sheet default dihapus & 11 sheet dibuat', run('SpreadsheetProvider.get().getSheets().length') === 11);
  check('setup idempotent', run('setup()').admin === null);

  console.log('# auth');
  check('login salah ditolak', call('auth.login', { role: 'admin', username: 'admin', password: 'salah' }).error.code === 'INVALID_CREDENTIALS');
  const adm = must(call('auth.login', { role: 'admin', username: 'admin', password: setup.admin.password }), 'login admin');
  const A = adm.token;
  check('token palsu ditolak', call('admin.guru.list', {}, A + 'x').error.code === 'UNAUTHORIZED');
  for (let i = 0; i < 5; i++) call('auth.login', { role: 'admin', username: 'admin', password: 'x' });
  check('throttle login', call('auth.login', { role: 'admin', username: 'admin', password: setup.admin.password }).error.code === 'TOO_MANY_ATTEMPTS');
  run('CacheService.getScriptCache().remove("login_fail:admin:admin")');

  console.log('# admin: master, guru, penugasan, siswa');
  const mapel = must(call('admin.mapel.save', { nama: 'Matematika' }, A), 'mapel');
  const jenis = must(call('admin.jenisUjian.list', {}, A), 'jenis')[0];
  const guru = must(call('admin.guru.save', { username: 'budi', nama: 'Pak Budi' }, A), 'guru');
  check('password guru digenerate', guru.password && guru.password.length === 8);
  const pgs = must(call('admin.penugasan.save', { guruId: guru.id, mapelId: mapel.id, jenisUjianId: jenis.id, durasiMenit: 45 }, A), 'penugasan');
  check('penugasan duplikat ditolak', call('admin.penugasan.save', { guruId: guru.id, mapelId: mapel.id, jenisUjianId: jenis.id }, A).error.code === 'CONFLICT');
  const imp = must(call('admin.siswa.import', { siswa: [
    { nis: '00123', nama: 'Ani', kelas: 'X-1', jenjang: 'SMA' },
    { nis: '00124', nama: 'Budi', kelas: 'X-1', jenjang: 'SMA' },
    { nis: '00125', nama: 'Cici', kelas: 'X-2', jenjang: 'SMA' },
    { nama: 'tanpa nis', kelas: 'X-2', jenjang: 'SMA' },
  ] }, A), 'import');
  check('import 3 siswa, 1 gagal', imp.ditambah === 3 && imp.gagal.length === 1 && imp.kredensial.length === 3);
  check('NIS ber-nol-depan terjaga', imp.kredensial[0].nis === '00123');
  const regen = must(call('admin.siswa.generatePasswords', { kelas: 'X-1' }, A), 'regen');
  check('generate password per kelas', regen.length === 2);
  const pwAni = regen.find((r) => r.nis === '00123').password;
  const pwBudi = regen.find((r) => r.nis === '00124').password;
  check('guru tidak bisa akses admin API', call('admin.guru.list', {}, must(call('auth.login', { role: 'guru', username: 'budi', password: guru.password }), 'lg').token).error.code === 'FORBIDDEN');

  console.log('# guru: ujian, soal, peserta');
  const G = must(call('auth.login', { role: 'guru', username: 'budi', password: guru.password }), 'login guru').token;
  check('guru lihat penugasan', must(call('guru.penugasan.list', {}, G), 'pl').length === 1);
  const ujian = must(call('guru.ujian.save', { penugasanId: pgs.id, judul: 'UH 1', durasiMenit: 30, tampilNilai: true }, G), 'ujian');
  check('durasi dari guru', ujian.durasiMenit === 30 && ujian.token.length === 6 && ujian.aktif === false);
  const U = ujian.id;
  const mk = (o) => must(call('guru.soal.save', Object.assign({ ujianId: U }, o), G), 'soal ' + o.tipe);
  const s1 = mk({ tipe: 'pg', teks: '1+1?', opsi: ['1', '2', '3', '4'], kunci: 'B', bobot: 2 });
  const s2 = mk({ tipe: 'multi', teks: 'Bilangan prima?', opsi: ['2', '3', '4', '9'], kunci: ['A', 'B'], bobot: 2 });
  const s3 = mk({ tipe: 'isian', teks: 'Ibukota Indonesia?', kunci: ['Jakarta', 'DKI Jakarta'], bobot: 2 });
  const s4 = mk({ tipe: 'essay', teks: 'Jelaskan Pythagoras', kunci: 'rubrik', bobot: 4 });
  const s5 = mk({ tipe: 'jodoh', teks: 'Jodohkan', opsi: { kiri: ['Kucing', 'Ayam'], kanan: ['Mengeong', 'Berkokok', 'Menggonggong'] }, kunci: { L1: 'R1', L2: 'R2' }, bobot: 4 });
  check('kunci tidak valid ditolak', !call('guru.soal.save', { ujianId: U, tipe: 'pg', teks: 'x', opsi: ['a', 'b'], kunci: 'Z' }, G).success);
  check('tipe tak dikenal ditolak', !call('guru.soal.save', { ujianId: U, tipe: 'abc', teks: 'x' }, G).success);
  check('ujian belum bisa diaktifkan guru', call('admin.ujian.setAktif', { id: U, aktif: true }, G).error.code === 'FORBIDDEN');
  const pes = must(call('guru.peserta.get', { ujianId: U }, G), 'pes');
  check('peserta list 3 siswa', pes.length === 3);
  const setp = must(call('guru.peserta.set', { ujianId: U, nisList: ['00123', '00124'] }, G), 'set');
  check('set peserta', setp.ditambah === 2 && setp.total === 2);
  check('set peserta idempotent', must(call('guru.peserta.set', { ujianId: U, nisList: ['00123', '00124'] }, G), 'set2').ditambah === 0);

  console.log('# siswa: sebelum ujian aktif');
  const S1 = must(call('auth.login', { role: 'siswa', username: '00123', password: pwAni }), 'login siswa').token;
  check('ujian belum aktif tidak tampil', must(call('siswa.ujian.list', {}, S1), 'l0').ujian.length === 0);
  must(call('admin.ujian.setAktif', { id: U, aktif: true }, A), 'aktif');
  const list = must(call('siswa.ujian.list', {}, S1), 'l1');
  check('ujian aktif tampil', list.ujian.length === 1 && list.ujian[0].status === 'belum' && list.ujian[0].jumlahSoal === 5);
  const S3 = must(call('auth.login', { role: 'siswa', username: '00125', password: imp.kredensial[2].password }), 'login 3').token;
  check('bukan peserta tidak melihat ujian', must(call('siswa.ujian.list', {}, S3), 'l3').ujian.length === 0);
  check('bukan peserta tidak bisa mulai', call('siswa.ujian.start', { ujianId: U, token: ujian.token }, S3).error.code === 'BUKAN_PESERTA');
  check('token salah ditolak', call('siswa.ujian.start', { ujianId: U, token: 'SALAH1' }, S1).error.code === 'TOKEN_INVALID');
  check('API siswa menolak token guru', call('siswa.ujian.list', {}, G).error.code === 'FORBIDDEN');

  console.log('# siswa: mengerjakan');
  const st = must(call('siswa.ujian.start', { ujianId: U, token: ujian.token.toLowerCase() }, S1), 'start');
  check('5 soal, timer dari server', st.soal.length === 5 && st.sesi.sisaDetik > 1790 && st.sesi.sisaDetik <= 1800);
  check('kunci TIDAK bocor', !/kunci/.test(JSON.stringify(st)) && !JSON.stringify(st).includes('rubrik'));
  const byTeks = (t) => st.soal.find((q) => q.teks === t);
  const keyOf = (q, teks) => q.opsi.find((o) => o.teks === teks).key;
  const q1 = byTeks('1+1?'), q2 = byTeks('Bilangan prima?'), q5 = byTeks('Jodohkan');
  const idOf = (list, teks) => list.find((x) => x.teks === teks).id;
  const answers = [
    { soalId: q1.id, jawaban: keyOf(q1, '2') },
    { soalId: q2.id, jawaban: [keyOf(q2, '2'), keyOf(q2, '3')] },
    { soalId: byTeks('Ibukota Indonesia?').id, jawaban: '  jakarta ' },
    { soalId: byTeks('Jelaskan Pythagoras').id, jawaban: 'a2+b2=c2' },
    { soalId: q5.id, jawaban: { [idOf(q5.pasangan.kiri, 'Kucing')]: idOf(q5.pasangan.kanan, 'Mengeong'), [idOf(q5.pasangan.kiri, 'Ayam')]: idOf(q5.pasangan.kanan, 'Berkokok') } },
  ];
  const sv = must(call('siswa.jawaban.save', { sesiId: st.sesi.id, answers: answers.slice(0, 2) }, S1), 'save');
  check('simpan jawaban', sv.saved === 2);
  const resume = must(call('siswa.ujian.start', { ujianId: U, token: '' }, S1), 'resume');
  check('resume tanpa token + jawaban pulih', Object.keys(resume.jawaban).length === 2 && resume.soal[0].id === st.soal[0].id);
  check('siswa lain tak bisa akses sesi', call('siswa.sesi.get', { sesiId: st.sesi.id }, S3).error.code === 'NOT_FOUND');
  check('soal asing ditolak', !call('siswa.jawaban.save', { sesiId: st.sesi.id, answers: [{ soalId: 'soal_x', jawaban: 'A' }] }, S1).success);
  const fin = must(call('siswa.sesi.finish', { sesiId: st.sesi.id, answers: answers.slice(2) }, S1), 'finish');
  check('selesai; nilai ditahan karena essay belum dinilai', fin.sesi.status === 'selesai' && fin.hasil === null);
  check('tidak bisa simpan setelah selesai', call('siswa.jawaban.save', { sesiId: st.sesi.id, answers: answers.slice(0, 1) }, S1).error.code === 'SUDAH_SELESAI');
  check('tidak bisa mulai ulang', call('siswa.ujian.start', { ujianId: U, token: ujian.token }, S1).error.code === 'SUDAH_SELESAI');

  console.log('# guru: hasil & koreksi essay');
  const hasil = must(call('hasil.list', { ujianId: U }, G), 'hasil');
  const hasilSesi = hasil.filter((r) => r.sesiId);
  check('hasil tercatat, perlu koreksi', hasilSesi.length === 1 && hasilSesi[0].perluKoreksi === true && hasilSesi[0].nilai === 71.43);
  check('peserta yang belum mulai tampil berstatus belum, jenjang baku', hasil.length > hasilSesi.length && hasil.filter((r) => !r.sesiId).every((r) => r.status === 'belum') && hasil[0].jenjang === 'SMA/MA');
  const sc = must(call('hasil.nilaiEssay', { sesiId: st.sesi.id, soalId: s4.id, skor: 4 }, G), 'essay');
  check('nilai akhir 100 setelah essay', sc.nilai === 100 && sc.perluKoreksi === false);
  check('skor essay > bobot ditolak', !call('hasil.nilaiEssay', { sesiId: st.sesi.id, soalId: s4.id, skor: 9 }, G).success);
  const after = must(call('siswa.ujian.list', {}, S1), 'l2').ujian[0];
  check('siswa melihat nilai (tampilNilai)', after.status === 'selesai' && after.nilai === 100);
  check('soal tak bisa diubah setelah dikerjakan', call('guru.soal.save', { ujianId: U, id: s1.id, tipe: 'pg', teks: 'x', opsi: ['a', 'b'], kunci: 'A' }, G).error.code === 'UJIAN_SUDAH_DIKERJAKAN');

  console.log('# timer server & auto-finalize');
  const S2 = must(call('auth.login', { role: 'siswa', username: '00124', password: pwBudi }), 'login 2').token;
  const st2 = must(call('siswa.ujian.start', { ujianId: U, token: ujian.token }, S2), 'start2');
  must(call('siswa.jawaban.save', { sesiId: st2.sesi.id, answers: [{ soalId: st2.soal[0].id, jawaban: 'A' }] }, S2), 'save2');
  const realNow = Date.now();
  run(`Clock._override = new Date(${realNow + 31 * 60000})`);
  check('simpan setelah waktu habis ditolak', call('siswa.jawaban.save', { sesiId: st2.sesi.id, answers: [{ soalId: st2.soal[0].id, jawaban: 'B' }] }, S2).error.code === 'WAKTU_HABIS');
  check('sesi otomatis selesai', must(call('siswa.sesi.get', { sesiId: st2.sesi.id }, S2), 'get2').sesi.status === 'selesai');
  run('Clock._override = null');

  console.log('# trigger finalize');
  must(call('guru.peserta.set', { ujianId: U, nisList: ['00123', '00124', '00125'] }, G), 'set3').total;
  check('finalizeExpired tidak error', run('Container.get("studentExamService").finalizeExpired()') === 0);

  console.log('# jadwal & penonaktifan');
  must(call('guru.penugasan.setAktif', { id: pgs.id, aktif: false }, G), 'nonaktif');
  check('mapel nonaktif -> ujian hilang dari siswa', must(call('siswa.ujian.list', {}, S3), 'l5').ujian.length === 0);
  check('guru tak bisa buat ujian di mapel nonaktif', call('guru.ujian.save', { penugasanId: pgs.id, judul: 'x' }, G).error.code === 'MAPEL_NONAKTIF');
  check('aksi tak dikenal', call('foo.bar', {}, A).error.code === 'UNKNOWN_ACTION');

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})();
