/** Ringkasan angka untuk halaman Beranda (admin: seluruh sistem; guru: ujian miliknya). */
class DashboardService {
  constructor(deps) { Object.assign(this, deps); }

  stats(principal) {
    const admin = principal.role === ROLE.ADMIN;
    const ujian = this.ujian.where((u) => admin || u.guruId === principal.id);
    const ids = {}; ujian.forEach((u) => { ids[u.id] = true; });
    const perUjian = {};
    const bump = (id, k) => { const o = perUjian[id] || (perUjian[id] = { berlangsung: 0, selesai: 0 }); o[k]++; };
    this.sesi.pluck(['ujianId', 'status']).forEach((s) => {
      if (ids[s.ujianId]) bump(s.ujianId, s.status === SESSION_STATUS.SELESAI ? 'selesai' : 'berlangsung');
    });
    const soal = this.soal.pluck(['ujianId']).filter((s) => ids[s.ujianId]).length;
    const sum = (k) => Object.keys(perUjian).reduce((a, id) => a + perUjian[id][k], 0);
    const mapel = {}; this.mapel.findAll().forEach((m) => { mapel[m.id] = m.nama; });
    const now = Clock.nowMs();
    const dibuka = (u) => u.aktif && (!u.mulai || new Date(u.mulai).getTime() <= now) && (!u.selesai || new Date(u.selesai).getTime() >= now);
    const out = {
      peran: principal.role,
      ujian: ujian.length, ujianAktif: ujian.filter((u) => u.aktif).length, ujianDibuka: ujian.filter(dibuka).length,
      formTerpasang: ujian.filter((u) => u.formId).length, formPerluDeploy: ujian.filter((u) => u.formId && u.formStale).length,
      soal, sesiBerlangsung: sum('berlangsung'), sesiSelesai: sum('selesai'),
      bankSoal: this.bank.where((b) => admin || b.ownerId === principal.id).length,
      terbaru: ujian.slice().sort((a, b) => String(b.dibuatPada).localeCompare(String(a.dibuatPada))).slice(0, 6).map((u) => ({
        id: u.id, judul: u.judul, mapelNama: mapel[u.mapelId] || '-', aktif: !!u.aktif, dibuka: dibuka(u),
        berlangsung: (perUjian[u.id] || {}).berlangsung || 0, selesai: (perUjian[u.id] || {}).selesai || 0,
        formTerpasang: !!u.formId, formStale: !!u.formStale,
      })),
    };
    if (admin) {
      out.siswa = this.siswa.pluck(['id']).length;
      out.guru = this.users.where((x) => x.role === ROLE.GURU).length;
    }
    return out;
  }
}
