/**
 * Konstanta global aplikasi. Hanya literal — tidak boleh bergantung pada file lain
 * agar urutan pemuatan file Apps Script tidak berpengaruh.
 */
const APP = Object.freeze({
  NAME: 'ExamForm CBT',
  VERSION: '1.4.1',
  TIMEZONE: 'Asia/Jakarta',
});

const ROLE = Object.freeze({ ADMIN: 'admin', GURU: 'guru', SISWA: 'siswa' });

const QUESTION_TYPE = Object.freeze({
  PILIHAN_GANDA: 'pg',
  MULTI_OPSI: 'multi',
  ISIAN_SINGKAT: 'isian',
  ESSAY: 'essay',
  MENJODOHKAN: 'jodoh',
});

const SESSION_STATUS = Object.freeze({
  BERLANGSUNG: 'berlangsung',
  SELESAI: 'selesai',
});

/** Status ujian dari sudut pandang siswa. */
const STUDENT_EXAM_STATUS = Object.freeze({
  BELUM: 'belum',
  BERLANGSUNG: 'berlangsung',
  SELESAI: 'selesai',
});

/** Mode pengerjaan ujian. gform = soal dikerjakan di Google Form (WebView); native = soal dirender aplikasi. */
const EXAM_MODE = Object.freeze({ GFORM: 'gform', NATIVE: 'native' });

const FORM = Object.freeze({
  LATE_GRACE_SECONDS: 90,
  CLOSE_GRACE_SECONDS: 120,
  NIS_TITLE: 'NIS',
  NAMA_TITLE: 'Nama',
  MAX_ANSWER_CHARS: 4000,
  MAX_CELL_CHARS: 45000,
});

const PROP = Object.freeze({
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  AUTH_SECRET: 'AUTH_SECRET',
});

const AUTH = Object.freeze({
  TOKEN_TTL_SECONDS: { admin: 8 * 3600, guru: 8 * 3600, siswa: 6 * 3600 },
  MAX_FAILED_LOGIN: 5,
  LOCK_SECONDS: 300,
  PASSWORD_MIN_LENGTH: 6,
  GENERATED_PASSWORD_LENGTH: 8,
});

const EXAM = Object.freeze({
  EXAM_TOKEN_LENGTH: 6,
  EXIT_CODE_LENGTH: 6,
  GRACE_SECONDS: 5,
  DEFAULT_DURATION_MINUTES: 60,
  MAX_DURATION_MINUTES: 600,
  FINALIZE_TRIGGER_MINUTES: 5,
});

/** Alfabet tanpa karakter yang mudah tertukar (0/O, 1/I/l). */
const ALPHABET = Object.freeze({
  READABLE: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  PASSWORD: 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789',
});

/** Jenjang pendidikan baku. Nilai tersimpan selalu salah satu dari daftar ini. */
const Jenjang = {
  LIST: ['SD/MI', 'SMP/MTs', 'SMA/MA'],
  /** Terima variasi penulisan (SD, mi, smp, MTS, sma, ma, SMK/MAK…) -> nilai baku; tak dikenal -> null. */
  normalize(v) {
    const t = String(v === undefined || v === null ? '' : v).toUpperCase().replace(/[^A-Z]/g, '');
    if (['SD', 'MI', 'SDMI', 'MISD'].indexOf(t) >= 0) return 'SD/MI';
    if (['SMP', 'MTS', 'SMPMTS', 'MTSSMP'].indexOf(t) >= 0) return 'SMP/MTs';
    if (['SMA', 'MA', 'SMK', 'MAK', 'SMAMA', 'MASMA'].indexOf(t) >= 0) return 'SMA/MA';
    return null;
  },
};
