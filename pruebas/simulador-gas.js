// Simulador mínimo de Apps Script para probar Code.gs
const fs = require('fs'), vm = require('vm');
function makeSheet(name) {
  const sh = { name, data: [], maxRows: 1000,
    _ensure(r, c) { while (sh.data.length < r) sh.data.push([]); for (const row of sh.data) while (row.length < c) row.push(''); },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        setValues(v) { sh._ensure(r + nr - 1, c + nc - 1); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.data[r - 1 + i][c - 1 + j] = v[i][j] == null ? '' : String(v[i][j]); return this; },
        setValue(v) { sh._ensure(r, c); sh.data[r - 1][c - 1] = String(v); return this; },
        getDisplayValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(((sh.data[r - 1 + i] || [])[c - 1 + j]) ?? ''); out.push(row); } return out; },
        setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, setNumberFormat() { return this; },
        setDataValidation() { return this; }, clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (sh.data[r - 1 + i]) sh.data[r - 1 + i][c - 1 + j] = ''; return this; },
      };
    },
    getDataRange() { const rows = sh.getLastRow(), cols = Math.max(1, ...sh.data.map(x => x.length)); return sh.getRange(1, 1, Math.max(rows, 1), cols); },
    getLastRow() { let n = 0; sh.data.forEach((row, i) => { if (row.some(v => v !== '')) n = i + 1; }); return n; },
    getMaxRows() { return sh.maxRows; },
    appendRow(v) { const n = sh.getLastRow(); sh.getRange(n + 1, 1, 1, v.length).setValues([v]); },
    deleteRow(r) { sh.data.splice(r - 1, 1); },
    setFrozenRows() {}, setColumnWidths() {}, setColumnWidth() {},
  };
  return sh;
}
function crear() {
  const sheets = {};
  const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet(n)) };
  const cache = {}; const props = {}; const files = {}; let fid = 0;
  const folder = (id) => ({ getId: () => id, setSharing() {}, createFile(blob) { const f = 'F' + (++fid); files[f] = { blob, trashed: false, parent: id }; return { getId: () => f, setSharing() {} }; } });
  const ctx = {
    console, JSON, Math, Date, String, Number, Array, Object, isFinite, Error, RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newDataValidation: () => ({ requireValueInList() { return this; }, build() { return {}; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = String(v); }, remove: (k) => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    Utilities: {
      formatDate: (d, z, f) => { const p = (n) => String(n).padStart(2, '0'); const s = { yyyy: d.getFullYear(), MM: p(d.getMonth() + 1), dd: p(d.getDate()), HH: p(d.getHours()), mm: p(d.getMinutes()), ss: p(d.getSeconds()) }; return f.replace(/yyyy|MM|dd|HH|mm|ss/g, (k) => s[k]); },
      getUuid: () => require('crypto').randomUUID(), base64Decode: (b) => Array.from(Buffer.from(b, 'base64')), newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
    DriveApp: { Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 }, createFolder: () => folder('CARPETA1'), getFolderById: (id) => folder(id),
      getFileById: (id) => { if (!files[id]) throw new Error('no'); return { setTrashed: (t) => { files[id].trashed = t; }, getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return { getId: () => files[id].parent }; } }; } }; } },
    Logger: { log: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8') + '\n;this.__x={configurar,doGet,doPost};', ctx);
  const x = ctx.__x;
  const get = (params) => JSON.parse(x.doGet({ parameter: params }).t);
  const post = (body) => JSON.parse(x.doPost({ postData: { contents: JSON.stringify(body) } }).t);
  return { x, sheets, cache, props, files, get, post };
}
module.exports = { crear };
