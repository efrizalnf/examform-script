/** Validasi input sederhana. Semua fungsi melempar Errors.validation bila gagal. */
const Validate = {
  object(value, name) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw Errors.validation(`${name || 'Data'} harus berupa objek.`);
    }
    return value;
  },
  string(value, name, opts) {
    const o = Object.assign({ min: 1, max: 500, required: true }, opts);
    if (value === undefined || value === null || value === '') {
      if (!o.required) return '';
      throw Errors.validation(`${name} wajib diisi.`);
    }
    const s = String(value).trim();
    if (s.length < o.min) throw Errors.validation(`${name} wajib diisi.`);
    if (s.length > o.max) throw Errors.validation(`${name} maksimal ${o.max} karakter.`);
    return s;
  },
  oneOf(value, allowed, name) {
    if (allowed.indexOf(value) < 0) {
      throw Errors.validation(`${name} harus salah satu dari: ${allowed.join(', ')}.`);
    }
    return value;
  },
  int(value, name, opts) {
    const o = Object.assign({ min: 0, max: 1e9 }, opts);
    const n = Number(value);
    if (!isFinite(n) || Math.floor(n) !== n) throw Errors.validation(`${name} harus bilangan bulat.`);
    if (n < o.min || n > o.max) throw Errors.validation(`${name} harus antara ${o.min} dan ${o.max}.`);
    return n;
  },
  number(value, name, opts) {
    const o = Object.assign({ min: 0, max: 1e9 }, opts);
    const n = Number(value);
    if (!isFinite(n)) throw Errors.validation(`${name} harus berupa angka.`);
    if (n < o.min || n > o.max) throw Errors.validation(`${name} harus antara ${o.min} dan ${o.max}.`);
    return n;
  },
  bool(value) { return value === true || String(value).toUpperCase() === 'TRUE'; },
  array(value, name, opts) {
    const o = Object.assign({ min: 0, max: 5000 }, opts);
    if (!Array.isArray(value)) throw Errors.validation(`${name} harus berupa daftar.`);
    if (value.length < o.min) throw Errors.validation(`${name} minimal ${o.min} item.`);
    if (value.length > o.max) throw Errors.validation(`${name} maksimal ${o.max} item.`);
    return value;
  },
  isoDateOrEmpty(value, name) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) throw Errors.validation(`${name} bukan tanggal yang valid.`);
    return d.toISOString();
  },
};
