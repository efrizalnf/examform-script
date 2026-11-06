/**
 * Definisi tabel (sheet). Menambah kolom baru = tambahkan di akhir daftar `columns`;
 * SheetRepository otomatis menambah header yang belum ada (migrasi ringan).
 * `minRows` (opsional) = ukuran grid awal yang sudah berformat teks.
 * Tipe kolom: string (default) | number | bool | json.
 */
const Schema = {
  users: {
    sheet: 'Users',
    columns: [
      { name: 'id' }, { name: 'username' }, { name: 'nama' },
      { name: 'role' }, // admin | guru
      { name: 'passwordHash' }, { name: 'salt' },
      { name: 'aktif', type: 'bool' }, { name: 'dibuatPada' },
    ],
  },
  siswa: {
    sheet: 'Siswa', minRows: 5000,
    columns: [
      { name: 'id' }, // = nis
      { name: 'nis' }, { name: 'nama' }, { name: 'kelas' }, { name: 'jenjang' },
      { name: 'passwordHash' }, { name: 'salt' },
      { name: 'aktif', type: 'bool' }, { name: 'dibuatPada' },
    ],
  },
  mapel: {
    sheet: 'Mapel',
    columns: [{ name: 'id' }, { name: 'nama' }],
  },
  jenisUjian: {
    sheet: 'JenisUjian',
    columns: [{ name: 'id' }, { name: 'nama' }],
  },
  /** Penugasan guru: guru + mapel + jenis ujian + waktu ujian default. `aktif` diatur guru. */
  penugasan: {
    sheet: 'Penugasan',
    columns: [
      { name: 'id' }, { name: 'guruId' }, { name: 'mapelId' }, { name: 'jenisUjianId' },
      { name: 'durasiMenit', type: 'number' }, { name: 'aktif', type: 'bool' },
    ],
  },
  ujian: {
    sheet: 'Ujian',
    columns: [
      { name: 'id' }, { name: 'guruId' }, { name: 'penugasanId' },
      { name: 'mapelId' }, { name: 'jenisUjianId' },
      { name: 'judul' }, { name: 'deskripsi' },
      { name: 'durasiMenit', type: 'number' },
      { name: 'mulai' }, { name: 'selesai' }, // jendela jadwal (ISO, opsional)
      { name: 'token' },
      { name: 'aktif', type: 'bool' }, // diatur admin
      { name: 'acakSoal', type: 'bool' }, { name: 'acakOpsi', type: 'bool' },
      { name: 'tampilNilai', type: 'bool' },
      { name: 'dibuatPada' },
    ],
  },
  soal: {
    sheet: 'Soal', minRows: 3000,
    columns: [
      { name: 'id' }, { name: 'ujianId' }, { name: 'tipe' }, { name: 'teks' },
      { name: 'opsi', type: 'json' }, { name: 'kunci', type: 'json' },
      { name: 'bobot', type: 'number' }, { name: 'urutan', type: 'number' },
      { name: 'aktif', type: 'bool' }, { name: 'dibuatPada' },
    ],
  },
  peserta: {
    sheet: 'Peserta', minRows: 10000,
    columns: [{ name: 'id' }, { name: 'ujianId' }, { name: 'nis' }],
  },
  sesi: {
    sheet: 'Sesi', minRows: 5000,
    columns: [
      { name: 'id' }, { name: 'ujianId' }, { name: 'nis' },
      { name: 'mulai' }, { name: 'batas' }, { name: 'selesai' },
      { name: 'status' },
      { name: 'layout', type: 'json' },
      { name: 'skorPerolehan', type: 'number' }, { name: 'skorMaksimum', type: 'number' },
      { name: 'nilai', type: 'number' },
      { name: 'perluKoreksi', type: 'bool' },
    ],
  },
  jawaban: {
    sheet: 'Jawaban', minRows: 30000,
    columns: [
      { name: 'id' }, // sesiId:soalId
      { name: 'sesiId' }, { name: 'soalId' },
      { name: 'jawaban', type: 'json' },
      { name: 'skor', type: 'number' }, // diisi manual guru untuk essay
      { name: 'diubahPada' },
    ],
  },
};
