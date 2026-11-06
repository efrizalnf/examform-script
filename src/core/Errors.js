/** Error aplikasi dengan kode yang stabil agar klien (Android/Web) dapat bereaksi. */
class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details || null;
  }
}

const Errors = {
  validation: (msg, details) => new AppError('VALIDATION_ERROR', msg, details),
  unauthorized: (msg) => new AppError('UNAUTHORIZED', msg || 'Sesi tidak valid atau sudah berakhir.'),
  forbidden: (msg) => new AppError('FORBIDDEN', msg || 'Anda tidak berhak mengakses fitur ini.'),
  notFound: (what) => new AppError('NOT_FOUND', `${what || 'Data'} tidak ditemukan.`),
  conflict: (msg) => new AppError('CONFLICT', msg),
  rule: (code, msg) => new AppError(code, msg),
};
