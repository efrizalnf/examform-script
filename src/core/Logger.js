const Log = {
  info(msg, ctx) { console.info(JSON.stringify({ msg, ctx: ctx || null })); },
  warn(msg, ctx) { console.warn(JSON.stringify({ msg, ctx: ctx || null })); },
  error(msg, err, ctx) {
    console.error(JSON.stringify({ msg, error: err && (err.stack || String(err)), ctx: ctx || null }));
  },
};
