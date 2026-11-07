// Prueba Code.gs completo (tienda + reservas) con Google Sheets, Drive y Cache simulados.
// Correr: node pruebas/tienda-backend.test.js
const { crear } = require('./simulador-gas');
const assert = require('assert');
let fails = 0, n = 0;
const t = (name, fn) => { n++; try { fn(); console.log('ok  ', name); } catch (e) { fails++; console.log('FALLA', name, '\n     ', e.message); } };

const g = crear();
g.x.configurar();
const PIN = g.props.ADMIN_PIN;
const adm = (op, extra = {}) => g.post(Object.assign({ action: 'admin', pin: PIN, op }, extra));
const stock = (id) => adm('productos').productos.find((p) => p.id === id).stock;

t('configurar crea Productos con la semilla y Pedidos vacía', () => {
  assert.equal(g.sheets.Productos.getLastRow(), 7);
  assert.equal(g.sheets.Pedidos.getLastRow(), 1);
  assert.equal(g.props.FOTOS_CARPETA, 'CARPETA1');
});
t('configurar no pisa productos existentes al correr otra vez', () => {
  g.sheets.Productos.getRange(2, 6).setValue('99');
  g.x.configurar();
  assert.equal(g.sheets.Productos.data[1][5], '99');
  g.sheets.Productos.getRange(2, 6).setValue('12');
  g.cache && Object.keys(g.cache).forEach((k) => delete g.cache[k]);
});
t('GET productos: solo visibles, con promo bien leída', () => {
  const r = g.get({ action: 'productos' });
  assert.ok(r.ok);
  assert.equal(r.productos.length, 6);
  const peine = r.productos.find((p) => p.id === 'peine-madera');
  assert.deepEqual([peine.promo.tipo, peine.promo.lleva, peine.promo.paga], ['cantidad', 2, 1]);
  const pom = r.productos.find((p) => p.id === 'pomada-formal');
  assert.deepEqual([pom.promo.tipo, pom.promo.valor, pom.stock, pom.foto], ['combo', 150, 12, 'assets/productos-pomada.jpg']);
});
t('pedido con todas las promos: totales iguales a js/tienda.js', () => {
  const r = g.post({ action: 'pedido', pedido: { nombre: 'Juan Pérez', telefono: '786 123 4567', conCorte: true, items: [
    { id: 'pomada-formal', cantidad: 1 }, { id: 'peine-madera', cantidad: 2 }, { id: 'cera-mate', cantidad: 1 }, { id: 'aceite-barba', cantidad: 1 } ] } });
  assert.ok(r.ok, JSON.stringify(r));
  // 150 (combo) + 90 (2x1) + 136 (15%) + 190 (oferta) = 566; base 180+180+160+220 = 740
  assert.equal(r.pedido.total, 566);
  assert.equal(r.pedido.subtotal, 740);
  assert.equal(r.pedido.ahorro, 174);
  assert.equal(r.pedido.lineas.find((l) => l.id === 'aceite-barba').promo, 'Oferta');
  assert.equal(stock('pomada-formal'), 11);
  assert.equal(stock('peine-madera'), 13);
  const fila = g.sheets.Pedidos.data[1];
  assert.equal(fila[11], 'Pendiente');
  assert.equal(fila[3], '7861234567');
});
t('sin corte, la pomada va a precio normal', () => {
  const r = g.post({ action: 'pedido', pedido: { nombre: 'Ana', telefono: '7860000001', items: [{ id: 'pomada-formal', cantidad: 1 }] } });
  assert.equal(r.pedido.total, 180);
});
t('3 peines con 2x1 = paga 2', () => {
  const r = g.post({ action: 'pedido', pedido: { nombre: 'Ana', telefono: '7860000002', items: [{ id: 'peine-madera', cantidad: 3 }] } });
  assert.equal(r.pedido.total, 180);
});
t('agotado: no descuenta nada y dice cuántas quedan', () => {
  const antes = stock('aceite-barba');
  const r = g.post({ action: 'pedido', pedido: { nombre: 'Ana', telefono: '7860000003', items: [{ id: 'aceite-barba', cantidad: 50 }, { id: 'cera-mate', cantidad: 1 }] } });
  assert.equal(r.error, 'agotado');
  assert.equal(r.agotados[0].disponible, antes > 20 ? 20 : antes);
  assert.equal(stock('aceite-barba'), antes);
  assert.equal(stock('cera-mate'), 7);
});
t('producto con 0 piezas no se puede pedir', () => {
  const r = g.post({ action: 'pedido', pedido: { nombre: 'Ana', telefono: '7860000003', items: [{ id: 'balsamo-barba', cantidad: 1 }] } });
  assert.equal(r.error, 'agotado');
});
t('datos malos y pedido vacío', () => {
  assert.equal(g.post({ action: 'pedido', pedido: { nombre: 'A', telefono: '7860000004', items: [{ id: 'cera-mate', cantidad: 1 }] } }).error, 'datos');
  assert.equal(g.post({ action: 'pedido', pedido: { nombre: 'Ana', telefono: '123', items: [{ id: 'cera-mate', cantidad: 1 }] } }).error, 'datos');
  assert.equal(g.post({ action: 'pedido', pedido: { nombre: 'Ana', telefono: '7860000004', items: [] } }).error, 'vacio');
  assert.equal(g.post({ action: 'pedido', pedido: { nombre: 'Ana', telefono: '7860000004', items: [{ id: 'nada', cantidad: 1 }] } }).error, 'agotado');
});
t('límite de 5 pedidos por hora por teléfono', () => {
  let r;
  for (let i = 0; i < 5; i++) r = g.post({ action: 'pedido', pedido: { nombre: 'Spam', telefono: '7869999999', items: [{ id: 'peine-madera', cantidad: 1 }] } });
  assert.ok(r.ok);
  r = g.post({ action: 'pedido', pedido: { nombre: 'Spam', telefono: '7869999999', items: [{ id: 'peine-madera', cantidad: 1 }] } });
  assert.equal(r.error, 'limite');
});
t('texto con = no se vuelve fórmula', () => {
  const r = g.post({ action: 'pedido', pedido: { nombre: '=HACK()', telefono: '7860000005', nota: '+1', items: [{ id: 'cera-mate', cantidad: 1 }] } });
  const fila = g.sheets.Pedidos.data[g.sheets.Pedidos.getLastRow() - 1];
  assert.ok(fila[2].startsWith("'"));
  assert.ok(fila[10].startsWith("'"));
});
t('admin sin PIN no entra a productos', () => {
  assert.equal(g.post({ action: 'admin', pin: '000000', op: 'productos' }).error, 'pin');
});
t('cancelar regresa piezas; reactivar las vuelve a quitar', () => {
  const peds = adm('pedidos').pedidos;
  const juan = peds.find((p) => p.nombre === 'Juan Pérez');
  const antes = stock('pomada-formal');
  let r = adm('estadoPedido', { id: juan.id, estado: 'Cancelado' });
  assert.ok(r.ok);
  assert.equal(stock('pomada-formal'), antes + 1);
  r = adm('estadoPedido', { id: juan.id, estado: 'Cancelado' });
  assert.equal(stock('pomada-formal'), antes + 1, 'cancelar dos veces no duplica');
  r = adm('estadoPedido', { id: juan.id, estado: 'Pendiente' });
  assert.equal(stock('pomada-formal'), antes);
  r = adm('estadoPedido', { id: juan.id, estado: 'Entregado' });
  assert.equal(stock('pomada-formal'), antes, 'entregar no mueve piezas');
});
t('reactivar sin piezas suficientes se niega', () => {
  const ped = adm('pedidos').pedidos.find((p) => p.nombre === 'Ana' && p.lineas[0].id === 'pomada-formal');
  adm('estadoPedido', { id: ped.id, estado: 'Cancelado' });
  const p = adm('productos').productos.find((x) => x.id === 'pomada-formal');
  p.stock = 0; adm('guardarProducto', { producto: p });
  const r = adm('estadoPedido', { id: ped.id, estado: 'Pendiente' });
  assert.equal(r.error, 'agotado');
  assert.equal(adm('pedidos').pedidos.find((x) => x.id === ped.id).estado, 'Cancelado');
});
t('guardarProducto valida las reglas de promo', () => {
  const base = { nombre: 'Shampoo', precio: 150, stock: 4, promo: { tipo: 'oferta', valor: 200 } };
  assert.equal(adm('guardarProducto', { producto: base }).error, 'datos');
  assert.equal(adm('guardarProducto', { producto: { ...base, promo: { tipo: 'porcentaje', valor: 95 } } }).error, 'datos');
  assert.equal(adm('guardarProducto', { producto: { ...base, promo: { tipo: 'cantidad', lleva: 2, paga: 2 } } }).error, 'datos');
  assert.equal(adm('guardarProducto', { producto: { ...base, promo: { tipo: 'oferta', valor: 120, desde: '2026-12-10', hasta: '2026-12-01' } } }).error, 'datos');
  assert.equal(adm('guardarProducto', { producto: { ...base, nombre: 'x' } }).error, 'datos');
});
let nuevo;
t('producto nuevo: id, orden al final y visible en el sitio', () => {
  const r = adm('guardarProducto', { producto: { nombre: 'Shampoo para barba', categoria: 'Barba', precio: 150, stock: 4, promo: { tipo: 'oferta', valor: 120, hasta: '2099-01-01' } } });
  assert.ok(r.ok, JSON.stringify(r));
  nuevo = r.producto;
  assert.ok(/^p[\w-]{8}$/.test(nuevo.id));
  assert.equal(nuevo.orden, 7);
  const pub = g.get({ action: 'productos' }).productos.find((p) => p.id === nuevo.id);
  assert.ok(pub, 'la caché se limpió');
  assert.equal(pub.promo.hasta, '2099-01-01');
});
t('promo fuera de fechas no aplica en el pedido', () => {
  const p = adm('productos').productos.find((x) => x.id === nuevo.id);
  p.promo = { tipo: 'oferta', valor: 120, desde: '2099-01-01' };
  adm('guardarProducto', { producto: p });
  const r = g.post({ action: 'pedido', pedido: { nombre: 'Leo', telefono: '7860000006', items: [{ id: nuevo.id, cantidad: 1 }] } });
  assert.equal(r.pedido.total, 150);
});
t('oculto: no sale en el sitio ni se puede pedir', () => {
  const p = adm('productos').productos.find((x) => x.id === nuevo.id);
  p.visible = false; adm('guardarProducto', { producto: p });
  assert.ok(!g.get({ action: 'productos' }).productos.some((x) => x.id === nuevo.id));
  assert.ok(adm('productos').productos.some((x) => x.id === nuevo.id), 'el panel sí lo ve');
  assert.equal(g.post({ action: 'pedido', pedido: { nombre: 'Leo', telefono: '7860000007', items: [{ id: nuevo.id, cantidad: 1 }] } }).error, 'agotado');
});
t('subir foto: va a la carpeta, URL pública; cambiarla tira la vieja', () => {
  const datos = Buffer.from('fake-jpeg').toString('base64');
  const r1 = adm('subirFoto', { nombre: 'Shampoo', tipo: 'image/jpeg', datos });
  assert.ok(r1.ok && /^https:\/\/lh3\.googleusercontent\.com\/d\/F\d+=w900$/.test(r1.foto), JSON.stringify(r1));
  const p = adm('productos').productos.find((x) => x.id === nuevo.id);
  p.foto = r1.foto; adm('guardarProducto', { producto: p });
  const r2 = adm('subirFoto', { nombre: 'Shampoo', tipo: 'image/jpeg', datos });
  p.foto = r2.foto; adm('guardarProducto', { producto: p });
  const id1 = /d\/(F\d+)/.exec(r1.foto)[1], id2 = /d\/(F\d+)/.exec(r2.foto)[1];
  assert.equal(g.files[id1].trashed, true);
  assert.equal(g.files[id2].trashed, false);
  assert.equal(adm('subirFoto', { tipo: 'image/gif', datos }).error, 'datos');
});
t('borrar producto quita la fila y su foto', () => {
  const p = adm('productos').productos.find((x) => x.id === nuevo.id);
  const fid = /d\/(F\d+)/.exec(p.foto)[1];
  assert.ok(adm('borrarProducto', { id: nuevo.id }).ok);
  assert.ok(!adm('productos').productos.some((x) => x.id === nuevo.id));
  assert.equal(g.files[fid].trashed, true);
  assert.equal(adm('borrarProducto', { id: nuevo.id }).error, 'no-existe');
});
t('las reservas siguen funcionando igual', () => {
  const r = g.post({ action: 'reservar', cita: { fecha: '2026-11-10', hora: '10:00', minutos: 40, nombre: 'Leo', telefono: '7860000008', barbero: 'lando', servicio: 'Corte', precio: 150 } });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(g.get({ action: 'config' }).ok);
});
console.log(`\n${n - fails}/${n} pruebas pasaron`);
process.exit(fails ? 1 : 0);
