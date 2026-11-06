/** Memuat seluruh src/*.js ke satu konteks VM dengan mock Apps Script. */
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const { createGlobals } = require('./appsscript-mock');

function load() {
  const { globals, forms } = createGlobals();
  const ctx = vm.createContext(globals);
  const files = [];
  (function walk(d) { fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); }); })(path.join(__dirname, '..', 'src'));
  files.sort().forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  return { ctx, forms, run: (code) => vm.runInContext(code, ctx) };
}

/** Rakit halaman Index.html dengan include() sudah diganti (meniru HtmlService template). */
function renderIndex() {
  const src = path.join(__dirname, '..', 'src');
  const read = (n) => fs.readFileSync(path.join(src, n + '.html'), 'utf8');
  return read('web/Index').replace(/<\?!= include\('([^']+)'\) \?>/g, (_, n) => read(n));
}
module.exports = { load, renderIndex };
