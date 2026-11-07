// Compara el cálculo de precios de js/tienda.js (sitio) contra Code.gs (backend) con pedidos al azar.
const fs = require('fs'), vm = require('vm');
const ctxJ = { window: { BARBERIA: { productos: [] } }, localStorage: { getItem: () => null, setItem() {} }, console, JSON, Math, Date };
ctxJ.window.window = ctxJ.window; vm.createContext(ctxJ);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'js', 'tienda.js'), 'utf8').replace('window.TIENDA =', 'window.TIENDA ='), ctxJ);
const T = ctxJ.window.TIENDA;
// sacar cotizar_ del contexto de Code.gs
const fsrc = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const c2 = { console, JSON, Math, Date, String, Number, Array, Object, isFinite, Utilities: { formatDate: () => '2026-11-06' }, PropertiesService: {}, CacheService: {}, SpreadsheetApp: {}, LockService: {}, ContentService: {}, DriveApp: {} };
vm.createContext(c2); vm.runInContext(fsrc + ';this.__c={cotizar_, aProducto_};', c2);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
let malos = 0;
for (let k = 0; k < 5000; k++) {
  const prods = [];
  for (let i = 0; i < 4; i++) {
    const precio = rnd(1, 500);
    const tipo = ['', 'oferta', 'porcentaje', 'combo', 'cantidad'][rnd(0, 4)];
    const promo = { tipo, valor: tipo === 'porcentaje' ? rnd(1, 90) : rnd(1, Math.max(1, precio - 1)), lleva: rnd(2, 10), paga: 1, desde: ['', '2026-11-01', '2026-12-01'][rnd(0, 2)], hasta: ['', '2026-11-30', '2026-11-05'][rnd(0, 2)] };
    promo.paga = rnd(1, promo.lleva - 1);
    prods.push(T.normalizar({ id: 'p' + i, nombre: 'P' + i, precio, stock: rnd(0, 30), visible: rnd(0, 5) > 0, promo }));
  }
  const items = prods.map((p) => ({ id: p.id, cantidad: rnd(0, 25) }));
  const conCorte = !!rnd(0, 1), hoy = '2026-11-06';
  const a = T.cotizar(prods, items, conCorte, hoy);
  const b = c2.__c.cotizar_(prods.map((p, i) => ({ fila: i + 2, p })), items, conCorte, hoy);
  const sa = JSON.stringify([a.ok, a.error, a.total, a.subtotal, (a.lineas || []).map((l) => [l.id, l.total, l.promo]), (a.agotados || []).map((x) => [x.id, x.disponible])]);
  const sb = JSON.stringify([b.ok, b.error, b.total, b.subtotal, (b.lineas || []).map((l) => [l.id, l.total, l.promo]), (b.agotados || []).map((x) => [x.id, x.disponible])]);
  if (sa !== sb) { if (malos++ < 3) console.log('DIFERENTE\n', sa, '\n', sb, JSON.stringify(prods)); }
}
console.log(malos ? `${malos} diferencias` : '5000 pedidos aleatorios: sitio y backend cobran igual');
process.exit(malos ? 1 : 0);
