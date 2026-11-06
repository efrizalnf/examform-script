/** Abstraksi waktu agar mudah diganti saat pengujian. */
const Clock = {
  _override: null,
  now() { return this._override ? new Date(this._override.getTime()) : new Date(); },
  nowMs() { return this.now().getTime(); },
  iso(date) { return (date || this.now()).toISOString(); },
  fromIso(s) { return s ? new Date(s) : null; },
  addMinutes(date, minutes) { return new Date(date.getTime() + minutes * 60000); },
};
