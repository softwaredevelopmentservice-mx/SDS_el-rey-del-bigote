/**
 * El Rey del Bigote: API de reservas y panel del barbero sobre Google Sheets.
 * Hecho por SDS (Software Development Service).
 *
 * PÚBLICO (sitio de reservas)
 *   GET  ?action=ocupados&fecha=YYYY-MM-DD&barbero=lando
 *        -> { ok: true, ocupados: [{ hora: "10:30", minutos: 40 }] }
 *   GET  ?action=config
 *        -> { ok: true, config: { servicios, estilos, barbaExtra, promociones, horario, v } }
 *        Lo que el barbero puede cambiar desde el panel. El sitio lo encima sobre js/config.js.
 *   POST { action: "reservar", cita: {...} }
 *        -> { ok: true, id } | { ok: false, error: "ocupado" | "datos" }
 *   GET  ?action=productos
 *        -> { ok: true, productos: [...] }   Solo los visibles, con piezas disponibles.
 *   POST { action: "pedido", pedido: { items: [{ id, cantidad }], nombre, telefono, conCorte, nota } }
 *        -> { ok: true, pedido } | { ok: false, error: "agotado", agotados: [...] } | { ok:false, error:"datos"|"vacio"|"limite" }
 *        Valida existencias, calcula promos y descuenta las piezas. El cliente luego manda el WhatsApp.
 *
 * PANEL DEL BARBERO (requiere PIN, siempre por POST)
 *   POST { action: "admin", pin, op: "citas",  desde, hasta }          -> { ok, citas: [...] }
 *   POST { action: "admin", pin, op: "estado", id, estado }            -> { ok, cita }
 *   POST { action: "admin", pin, op: "mover",  id, fecha, hora }       -> { ok, cita } | { ok:false, error:"ocupado" }
 *        Al mover se recalculan la promo y el precio con las reglas del día nuevo.
 *   POST { action: "admin", pin, op: "ocupados", fecha, barbero, excepto } -> { ok, ocupados }
 *   POST { action: "admin", pin, op: "config" }                        -> { ok, config }
 *   POST { action: "admin", pin, op: "guardarConfig", config }         -> { ok, config } | { ok:false, error:"datos" }
 *   POST { action: "admin", pin, op: "productos" }                     -> { ok, productos }  (también los ocultos)
 *   POST { action: "admin", pin, op: "guardarProducto", producto }     -> { ok, producto } | { ok:false, error:"datos", mensaje }
 *   POST { action: "admin", pin, op: "borrarProducto", id }            -> { ok }
 *   POST { action: "admin", pin, op: "subirFoto", nombre, tipo, datos } -> { ok, foto }   datos en base64; va a Drive
 *   POST { action: "admin", pin, op: "pedidos", dias }                 -> { ok, pedidos }
 *   POST { action: "admin", pin, op: "estadoPedido", id, estado }      -> { ok, pedido, productos }
 *        Cancelar regresa las piezas al inventario; reactivar las vuelve a apartar.
 *
 * Hojas: Citas (las reservas) + Servicios, Promos y Horario (lo que edita el barbero)
 *        + Productos y Pedidos (la tienda). Las fotos viven en una carpeta de Drive.
 * Instalación: ver apps-script/INSTRUCCIONES.md
 */

const HOJA = "Citas";
// "Base" es el precio sin promoción. Va al final para no recorrer las columnas que ya existían.
const COLUMNAS = ["ID", "Creada", "Fecha", "Hora", "Minutos", "Barbero", "Servicio", "Precio", "Promo", "Nombre", "Telefono", "Nota", "Estado", "Base"];
// Índices de columna (base 0)
const C = { id: 0, creada: 1, fecha: 2, hora: 3, minutos: 4, barbero: 5, servicio: 6, precio: 7, promo: 8, nombre: 9, telefono: 10, nota: 11, estado: 12, base: 13 };
const ESTADOS = ["Confirmada", "Atendida", "No vino", "Cancelada"];
const ZONA = "America/Mexico_City";

/* Hojas de configuración: lo que el barbero cambia desde el panel. */
const HOJA_SERV = "Servicios";
const HOJA_PROMOS = "Promos";
const HOJA_HORARIO = "Horario";
const COL_SERV = ["Tipo", "ID", "Nombre", "Corto", "Precio", "Minutos"];       // Tipo: servicio | estilo | extra
const COL_PROMOS = ["Dia", "Titulo", "Regalo", "Porcentaje", "Detalle", "Activa"]; // Dia: 0 domingo ... 6 sábado
const COL_HORARIO = ["Dia", "Abre", "Cierra", "Cerrado"];
const CACHE_CONFIG = "config-v1";

/* Tienda */
const HOJA_PROD = "Productos";
const HOJA_PED = "Pedidos";
const COL_PROD = ["ID", "Nombre", "Categoria", "Descripcion", "Precio", "Stock", "Visible", "Orden", "Foto",
  "PromoTipo", "PromoValor", "PromoLleva", "PromoPaga", "PromoDesde", "PromoHasta"];
const P = { id: 0, nombre: 1, categoria: 2, descripcion: 3, precio: 4, stock: 5, visible: 6, orden: 7, foto: 8,
  tipo: 9, valor: 10, lleva: 11, paga: 12, desde: 13, hasta: 14 };
const COL_PED = ["ID", "Creado", "Nombre", "Telefono", "ConCorte", "Detalle", "Lineas", "Subtotal", "Ahorro", "Total", "Nota", "Estado"];
const D = { id: 0, creado: 1, nombre: 2, telefono: 3, conCorte: 4, detalle: 5, lineas: 6, subtotal: 7, ahorro: 8, total: 9, nota: 10, estado: 11 };
const ESTADOS_PED = ["Pendiente", "Entregado", "Cancelado"];
const TIPOS_PROMO = ["", "oferta", "porcentaje", "combo", "cantidad"];
const CACHE_PROD = "productos-v1";
const MAX_PIEZAS = 20;          // por producto en un pedido
const PEDIDOS_POR_HORA = 5;     // por teléfono, para que nadie aparte todo el inventario de broma

/**
 * Valores con los que arrancan las hojas la primera vez. Son los mismos de js/config.js:
 * en cuanto el barbero guarda desde el panel, mandan las hojas y esto ya no se usa.
 */
const SEMILLA = {
  servicios: [
    ["servicio", "adulto", "Corte de adulto", "Adulto", 150, 40],
    ["servicio", "adolescente", "Corte de adolescente", "Adolescente", 120, 30],
    ["servicio", "nino", "Corte de niño", "Niño", 100, 30],
    ["servicio", "barba", "Arreglo de barba", "Solo barba", 80, 20],
    ["estilo", "clasico", "Clásico", "", 0, 0],
    ["estilo", "escolar", "Escolar", "", 0, 0],
    ["estilo", "degradado", "Degradado", "", 20, 5],
    ["extra", "barba", "Barba con el corte", "", 50, 20],
  ],
  promos: [
    [1, "Paleta de hielo", "Paleta de hielo de regalo", 0, "Con cualquier corte o barba, escoges tu paleta del refri.", "Sí"],
    [2, "Cerveza bien fría", "Cerveza de regalo", 0, "Para mayores de 18. Los menores se llevan un refresco.", "Sí"],
    [3, "Refresco o agua", "Refresco de regalo", 0, "Te refrescas mientras esperas o al salir de la silla.", "Sí"],
    [4, "10% de descuento", "", 10, "En cualquier servicio. Si reservas en línea ya te sale descontado.", "Sí"],
    [5, "Papitas o dulce", "Papitas o dulce de regalo", 0, "Lo que quieras de la tiendita para arrancar el fin de semana.", "Sí"],
  ],
  // Mismos productos de ejemplo que js/config.js. Foto relativa = archivo del sitio.
  productos: [
    ["pomada-formal", "Pomada formal Rey del Bigote", "Cabello", "La de la casa. Fijación fuerte y acabado semi mate, hecha en México.", 180, 12, "Sí", 1, "assets/productos-pomada.jpg", "combo", 150, "", "", "", ""],
    ["fussion-blue", "Pomada Fussion Blue", "Cabello", "Base agua, fijación firme extrema. Se lava fácil y no deja el pelo duro. 150 g.", 170, 10, "Sí", 2, "assets/productos-fussion-blue.jpg", "", "", "", "", "", ""],
    ["cera-mate", "Cera mate", "Cabello", "Textura sin brillo para peinados despeinados que aguantan todo el día.", 160, 8, "Sí", 3, "", "porcentaje", 15, "", "", "", ""],
    ["aceite-barba", "Aceite para barba", "Barba", "Suaviza, quita la comezón y deja la barba con olor a madera.", 220, 6, "Sí", 4, "", "oferta", 190, "", "", "", ""],
    ["balsamo-barba", "Bálsamo para barba", "Barba", "Peina y fija la barba sin dejarla tiesa.", 200, 0, "Sí", 5, "", "", "", "", "", "", ""],
    ["peine-madera", "Peine de madera", "Accesorios", "Para barba y bigote. No genera estática.", 90, 15, "Sí", 6, "", "cantidad", "", 2, 1, "", ""],
  ],
  horario: [
    [0, "10:00", "15:00", "No"],
    [1, "10:00", "20:00", "No"],
    [2, "10:00", "20:00", "No"],
    [3, "10:00", "20:00", "No"],
    [4, "10:00", "20:00", "No"],
    [5, "10:00", "20:00", "No"],
    [6, "10:00", "20:00", "No"],
  ],
};

/**
 * Ejecuta esta función desde el editor para preparar la hoja.
 * La primera vez crea el PIN del panel y lo muestra en el "Registro de ejecución".
 */
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
  hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]).setFontWeight("bold").setBackground("#0e0f12").setFontColor("#f4f2ee");
  hoja.setFrozenRows(1);
  // Todo como texto para que Sheets no convierta fechas ni horas
  hoja.getRange(1, 1, hoja.getMaxRows(), COLUMNAS.length).setNumberFormat("@");
  const regla = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build();
  hoja.getRange(2, C.estado + 1, hoja.getMaxRows() - 1, 1).setDataValidation(regla);
  hoja.setColumnWidths(1, COLUMNAS.length, 120);
  hoja.setColumnWidth(C.servicio + 1, 240);

  // Citas viejas sin "Base": el precio que se cobró pasa a ser también el precio sin promo.
  const datos = hoja.getDataRange().getDisplayValues();
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][C.id] && !datos[i][C.base]) hoja.getRange(i + 1, C.base + 1).setValue(datos[i][C.precio] || "0");
  }

  // Hojas que edita el barbero. Solo se siembran si están vacías: nunca pisan lo que ya guardó.
  sembrar_(ss, HOJA_SERV, COL_SERV, SEMILLA.servicios);
  sembrar_(ss, HOJA_PROMOS, COL_PROMOS, SEMILLA.promos);
  sembrar_(ss, HOJA_HORARIO, COL_HORARIO, SEMILLA.horario);
  // Tienda: todo como texto para que Sheets no convierta fechas de promo ni IDs.
  const hp = sembrar_(ss, HOJA_PROD, COL_PROD, []);
  hp.getRange(1, 1, hp.getMaxRows(), COL_PROD.length).setNumberFormat("@");
  if (hp.getLastRow() < 2) hp.getRange(2, 1, SEMILLA.productos.length, COL_PROD.length).setValues(SEMILLA.productos.map((r) => r.map(String)));
  const hd = sembrar_(ss, HOJA_PED, COL_PED, []);
  hd.getRange(1, 1, hd.getMaxRows(), COL_PED.length).setNumberFormat("@");
  hd.setColumnWidth(D.detalle + 1, 320);
  hd.getRange(2, D.estado + 1, hd.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS_PED, true).build());
  carpetaFotos_(); // pide el permiso de Drive desde ahora, no cuando Lando suba la primera foto
  CacheService.getScriptCache().remove(CACHE_CONFIG);
  CacheService.getScriptCache().remove(CACHE_PROD);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_PIN")) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty("ADMIN_PIN", pin);
    Logger.log("PIN del panel del barbero: " + pin + "  (guárdalo; puedes cambiarlo con cambiarPin)");
  } else {
    Logger.log("El PIN ya existe. Para verlo o cambiarlo: Configuración del proyecto > Propiedades de la secuencia de comandos > ADMIN_PIN");
  }
}

/** Cambia el PIN: escribe el nuevo entre comillas, guarda y ejecuta esta función. */
function cambiarPin() {
  const NUEVO_PIN = "";            // <- escribe aquí el nuevo PIN (4 a 8 dígitos)
  if (!/^\d{4,8}$/.test(NUEVO_PIN)) throw new Error("Escribe un PIN de 4 a 8 dígitos en NUEVO_PIN.");
  PropertiesService.getScriptProperties().setProperty("ADMIN_PIN", NUEVO_PIN);
  Logger.log("PIN actualizado.");
}

/* ---------------- utilidades ---------------- */

function hoja_() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  if (!hoja) throw new Error("Falta la hoja 'Citas'. Ejecuta configurar() primero.");
  return hoja;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const aMin_ = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
const esFecha_ = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const esHora_ = (s) => /^\d{2}:\d{2}$/.test(s || "");

// Evita que un texto que empieza con = + - @ se convierta en fórmula
const limpio_ = (v, max) => {
  let s = String(v == null ? "" : v).trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
};

function filas_() {
  return hoja_().getDataRange().getDisplayValues();
}

function aCita_(r) {
  return {
    id: r[C.id], creada: r[C.creada], fecha: r[C.fecha], hora: r[C.hora], minutos: Number(r[C.minutos]) || 30,
    barbero: r[C.barbero], servicio: r[C.servicio], precio: Number(r[C.precio]) || 0, promo: r[C.promo],
    nombre: r[C.nombre], telefono: r[C.telefono], nota: r[C.nota], estado: r[C.estado] || "Confirmada",
    base: Number(r[C.base]) || Number(r[C.precio]) || 0,
  };
}

function ocupados_(fecha, barbero, exceptoId) {
  return filas_().slice(1)
    .filter((r) => r[C.fecha] === fecha && r[C.barbero] === barbero && r[C.estado] !== "Cancelada" && r[C.id] !== exceptoId)
    .map((r) => ({ hora: r[C.hora], minutos: Number(r[C.minutos]) || 30 }));
}

function choca_(fecha, barbero, hora, minutos, exceptoId) {
  const ini = aMin_(hora), fin = ini + minutos;
  return ocupados_(fecha, barbero, exceptoId).some((o) => ini < aMin_(o.hora) + o.minutos && fin > aMin_(o.hora));
}

// Devuelve el número de fila (base 1) de una cita por su ID, o 0 si no existe
function filaPorId_(id) {
  const datos = filas_();
  for (let i = 1; i < datos.length; i++) if (datos[i][C.id] === id) return i + 1;
  return 0;
}

/* ---------------- configuración del negocio ---------------- */

function sembrar_(ss, nombre, columnas, filas) {
  const h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  h.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight("bold").setBackground("#0e0f12").setFontColor("#f4f2ee");
  h.setFrozenRows(1);
  h.setColumnWidths(1, columnas.length, 150);
  if (h.getLastRow() < 2 && filas.length) h.getRange(2, 1, filas.length, columnas.length).setValues(filas);
  return h;
}

function hojaConfig_(nombre, columnas) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nombre) || sembrar_(ss, nombre, columnas, []);
}

const siNo_ = (v) => !/^(no|false|0)$/i.test(String(v == null ? "" : v).trim());

/**
 * Lee las tres hojas y arma el objeto con la misma forma que js/config.js.
 * Con todas = true incluye las promos apagadas, para que el panel pueda volver a prenderlas.
 */
function leerConfig_(todas) {
  const serv = hojaConfig_(HOJA_SERV, COL_SERV).getDataRange().getDisplayValues().slice(1);
  const promos = hojaConfig_(HOJA_PROMOS, COL_PROMOS).getDataRange().getDisplayValues().slice(1);
  const horario = hojaConfig_(HOJA_HORARIO, COL_HORARIO).getDataRange().getDisplayValues().slice(1);

  const cfg = { servicios: {}, estilos: {}, barbaExtra: null, promociones: [], horario: {} };
  serv.forEach((r) => {
    const tipo = String(r[0] || "").trim(), id = String(r[1] || "").trim();
    if (!tipo || !id) return;
    const precio = Number(r[4]) || 0, minutos = Number(r[5]) || 0;
    if (tipo === "servicio") cfg.servicios[id] = { nombre: r[2], corto: r[3], precio: precio, minutos: minutos };
    else if (tipo === "estilo") cfg.estilos[id] = { nombre: r[2], extra: precio, minutos: minutos };
    else if (tipo === "extra" && id === "barba") cfg.barbaExtra = { precio: precio, minutos: minutos };
  });
  promos.forEach((r) => {
    const dia = Number(r[0]);
    const activa = siNo_(r[5]);
    if (!(dia >= 0 && dia <= 6) || (!activa && !todas)) return;
    cfg.promociones.push({ dia: dia, titulo: r[1], regalo: r[2], porcentaje: Number(r[3]) || 0, detalle: r[4], activa: activa });
  });
  horario.forEach((r) => {
    const dia = Number(r[0]);
    if (!(dia >= 0 && dia <= 6)) return;
    const cerrado = siNo_(r[3]) && String(r[3] || "").trim() !== "";
    if (cerrado || !esHora_(r[1]) || !esHora_(r[2])) return; // sin fila = cerrado, igual que en config.js
    cfg.horario[String(dia)] = { abre: r[1], cierra: r[2] };
  });
  cfg.promociones.sort((a, b) => a.dia - b.dia);
  cfg.v = PropertiesService.getScriptProperties().getProperty("CONFIG_V") || "";
  return cfg;
}

/** Valida y reescribe las tres hojas. Devuelve null si los datos vienen mal. */
function escribirConfig_(cfg) {
  if (!cfg || typeof cfg !== "object") return null;
  const num = (v, min, max) => { const n = Math.round(Number(v)); return isFinite(n) && n >= min && n <= max ? n : null; };

  const filasServ = [];
  const servicios = cfg.servicios || {};
  for (const id in servicios) {
    const sv = servicios[id] || {};
    const precio = num(sv.precio, 0, 99999), minutos = num(sv.minutos, 5, 480);
    if (precio === null || minutos === null) return null;
    filasServ.push(["servicio", limpio_(id, 40), limpio_(sv.nombre, 80), limpio_(sv.corto, 40), precio, minutos]);
  }
  const estilos = cfg.estilos || {};
  for (const id in estilos) {
    const e = estilos[id] || {};
    const extra = num(e.extra, 0, 99999), minutos = num(e.minutos, 0, 240);
    if (extra === null || minutos === null) return null;
    filasServ.push(["estilo", limpio_(id, 40), limpio_(e.nombre, 80), "", extra, minutos]);
  }
  if (cfg.barbaExtra) {
    const precio = num(cfg.barbaExtra.precio, 0, 99999), minutos = num(cfg.barbaExtra.minutos, 0, 240);
    if (precio === null || minutos === null) return null;
    filasServ.push(["extra", "barba", "Barba con el corte", "", precio, minutos]);
  }
  if (!filasServ.length) return null;

  const filasPromos = [];
  (cfg.promociones || []).forEach((p) => {
    const dia = num(p.dia, 0, 6), pct = num(p.porcentaje || 0, 0, 90);
    if (dia === null || pct === null) return;
    filasPromos.push([dia, limpio_(p.titulo, 60), limpio_(p.regalo, 60), pct, limpio_(p.detalle, 200), p.activa === false ? "No" : "Sí"]);
  });

  const filasHorario = [];
  for (let d = 0; d <= 6; d++) {
    const h = (cfg.horario || {})[String(d)] || (cfg.horario || {})[d];
    if (!h || !esHora_(h.abre) || !esHora_(h.cierra)) { filasHorario.push([d, "", "", "Sí"]); continue; }
    if (aMin_(h.abre) >= aMin_(h.cierra)) return null;
    filasHorario.push([d, h.abre, h.cierra, "No"]);
  }

  escribirHoja_(HOJA_SERV, COL_SERV, filasServ);
  escribirHoja_(HOJA_PROMOS, COL_PROMOS, filasPromos);
  escribirHoja_(HOJA_HORARIO, COL_HORARIO, filasHorario);
  PropertiesService.getScriptProperties().setProperty("CONFIG_V", Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd HH:mm"));
  CacheService.getScriptCache().remove(CACHE_CONFIG);
  return leerConfig_(true);
}

function escribirHoja_(nombre, columnas, filas) {
  const h = hojaConfig_(nombre, columnas);
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, columnas.length).clearContent();
  if (filas.length) h.getRange(2, 1, filas.length, columnas.length).setValues(filas);
}

/** Día de la semana de "YYYY-MM-DD" sin que la zona horaria lo recorra un día. */
function diaSemana_(fecha) {
  const p = String(fecha).split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]).getDay();
}

/** Promo que aplica ese día y el precio que resulta a partir del precio sin promo. */
function promoDe_(fecha, base, cfg) {
  const dia = diaSemana_(fecha);
  const promo = (cfg.promociones || []).filter((p) => p.dia === dia)[0];
  if (!promo) return { texto: "", precio: Math.round(base) };
  if (promo.porcentaje > 0) return { texto: promo.porcentaje + "% de descuento", precio: Math.round(base * (1 - promo.porcentaje / 100)) };
  return { texto: String(promo.regalo || promo.titulo || ""), precio: Math.round(base) };
}


/* ---------------- tienda ---------------- */

const entero_ = (v) => { const n = Math.round(Number(v)); return isFinite(n) ? n : null; };
const hoyISO_ = () => Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd");

function hojaProd_() { return hojaConfig_(HOJA_PROD, COL_PROD); }
function hojaPed_() { return hojaConfig_(HOJA_PED, COL_PED); }

function aProducto_(r) {
  const tipo = TIPOS_PROMO.indexOf(String(r[P.tipo] || "").trim()) >= 0 ? String(r[P.tipo] || "").trim() : "";
  return {
    id: String(r[P.id]), nombre: String(r[P.nombre]), categoria: String(r[P.categoria] || ""), descripcion: String(r[P.descripcion] || ""),
    precio: Math.max(0, entero_(r[P.precio]) || 0), stock: Math.max(0, entero_(r[P.stock]) || 0),
    visible: siNo_(r[P.visible]), orden: entero_(r[P.orden]) || 0, foto: String(r[P.foto] || ""),
    promo: {
      tipo: tipo,
      valor: tipo === "cantidad" ? 0 : Math.max(0, entero_(r[P.valor]) || 0),
      lleva: tipo === "cantidad" ? Math.max(0, entero_(r[P.lleva]) || 0) : 0,
      paga: tipo === "cantidad" ? Math.max(0, entero_(r[P.paga]) || 0) : 0,
      desde: esFecha_(String(r[P.desde] || "")) ? String(r[P.desde]) : "",
      hasta: esFecha_(String(r[P.hasta] || "")) ? String(r[P.hasta]) : "",
    },
  };
}

function aFilaProducto_(p) {
  const pr = p.promo;
  return [p.id, limpio_(p.nombre, 80), limpio_(p.categoria, 40), limpio_(p.descripcion, 300), String(p.precio), String(p.stock),
    p.visible ? "Sí" : "No", String(p.orden), limpio_(p.foto, 300), pr.tipo,
    pr.tipo && pr.tipo !== "cantidad" ? String(pr.valor) : "", pr.tipo === "cantidad" ? String(pr.lleva) : "",
    pr.tipo === "cantidad" ? String(pr.paga) : "", pr.desde, pr.hasta];
}

/** Productos de la hoja con su número de fila (base 1), ordenados como en el sitio. */
function leerProductos_() {
  return hojaProd_().getDataRange().getDisplayValues().slice(1)
    .map((r, i) => ({ fila: i + 2, p: aProducto_(r) }))
    .filter((x) => x.p.id && x.p.nombre)
    .sort((a, b) => a.p.orden - b.p.orden || a.p.nombre.localeCompare(b.p.nombre, "es"));
}

/** Mismas reglas que validar() de js/tienda.js. */
function validarProducto_(p) {
  if (p.nombre.length < 2) return "Ponle nombre al producto.";
  if (!(p.precio >= 1 && p.precio <= 99999)) return "Revisa el precio de " + p.nombre + ".";
  if (!(p.stock >= 0 && p.stock <= 9999)) return "Las piezas de " + p.nombre + " van de 0 a 9999.";
  const pr = p.promo;
  if (pr.desde && pr.hasta && pr.desde > pr.hasta) return "La promoción termina antes de empezar.";
  if (pr.tipo === "oferta" && !(pr.valor >= 1 && pr.valor < p.precio)) return "El precio de oferta tiene que ser menor que el normal.";
  if (pr.tipo === "porcentaje" && !(pr.valor >= 1 && pr.valor <= 90)) return "El descuento va de 1% a 90%.";
  if (pr.tipo === "combo" && !(pr.valor >= 1 && pr.valor < p.precio)) return "El precio con corte tiene que ser menor que el normal.";
  if (pr.tipo === "cantidad" && !(pr.lleva >= 2 && pr.lleva <= 10 && pr.paga >= 1 && pr.paga < pr.lleva)) return "En la promo por cantidad, se lleva más de las que paga (ej. 3x2).";
  return "";
}

/** Normaliza lo que manda el panel a la misma forma que aProducto_. */
function productoDe_(x) {
  x = x || {};
  const pr = x.promo || {};
  const fila = [x.id || "", x.nombre || "", x.categoria || "", x.descripcion || "", x.precio, x.stock, x.visible === false ? "No" : "Sí",
    x.orden || 0, x.foto || "", pr.tipo || "", pr.valor, pr.lleva, pr.paga, pr.desde || "", pr.hasta || ""];
  const p = aProducto_(fila.map((v) => (v == null ? "" : String(v))));
  p.nombre = String(x.nombre || "").trim().slice(0, 80);
  p.id = String(x.id || "").trim().slice(0, 40);
  return p;
}

function vigente_(p, hoy) {
  const pr = p.promo;
  if (!pr || !pr.tipo) return null;
  if (pr.desde && hoy < pr.desde) return null;
  if (pr.hasta && hoy > pr.hasta) return null;
  return pr;
}

/** Igual que linea() de js/tienda.js. */
function linea_(p, n, conCorte, hoy) {
  const pr = vigente_(p, hoy);
  const base = p.precio * n;
  let total;
  if (pr && pr.tipo === "cantidad") total = (Math.floor(n / pr.lleva) * pr.paga + (n % pr.lleva)) * p.precio;
  else if (pr && pr.tipo === "oferta") total = pr.valor * n;
  else if (pr && pr.tipo === "porcentaje") total = Math.round(p.precio * (1 - pr.valor / 100)) * n;
  else if (pr && pr.tipo === "combo" && conCorte) total = pr.valor * n;
  else total = base;
  let promo = "";
  if (total < base) {
    if (pr.tipo === "combo") promo = "Precio con corte";
    else if (pr.tipo === "cantidad") promo = pr.lleva + "x" + pr.paga;
    else if (pr.tipo === "porcentaje") promo = pr.valor + "% de descuento";
    else promo = "Oferta";
  }
  return { base: base, total: total, promo: promo };
}

/** Igual que cotizar() de js/tienda.js, pero también devuelve la fila de cada producto. */
function cotizar_(lista, items, conCorte, hoy) {
  const porId = {};
  lista.forEach((x) => { porId[x.p.id] = x; });
  const juntos = {};
  (Array.isArray(items) ? items : []).forEach((it) => {
    const id = String((it && it.id) || "");
    const n = entero_(it && it.cantidad) || 0;
    if (id && n > 0) juntos[id] = (juntos[id] || 0) + n;
  });
  const ids = Object.keys(juntos);
  if (!ids.length) return { ok: false, error: "vacio" };
  const lineas = [], agotados = [];
  let subtotal = 0, total = 0;
  ids.forEach((id) => {
    const x = porId[id];
    const n = Math.min(juntos[id], MAX_PIEZAS);
    if (!x || !x.p.visible) { agotados.push({ id: id, nombre: x ? x.p.nombre : "", disponible: 0 }); return; }
    if (x.p.stock < n) { agotados.push({ id: id, nombre: x.p.nombre, disponible: x.p.stock }); return; }
    const l = linea_(x.p, n, conCorte, hoy);
    lineas.push({ id: id, nombre: x.p.nombre, cantidad: n, unitario: x.p.precio, base: l.base, total: l.total, promo: l.promo, fila: x.fila, stock: x.p.stock });
    subtotal += l.base; total += l.total;
  });
  if (agotados.length) return { ok: false, error: "agotado", agotados: agotados };
  return { ok: true, lineas: lineas, subtotal: subtotal, ahorro: subtotal - total, total: total };
}

const pesos_ = (n) => "$" + Math.round(n).toLocaleString("es-MX");
function detalleTexto_(lineas) {
  return lineas.map((l) => l.cantidad + "× " + l.nombre + " (" + pesos_(l.total) + (l.promo ? ", " + l.promo : "") + ")").join("\n");
}

function aPedido_(r) {
  let lineas = [];
  try { lineas = JSON.parse(r[D.lineas] || "[]"); } catch (e) { lineas = []; }
  return {
    id: r[D.id], creado: r[D.creado], nombre: r[D.nombre], telefono: r[D.telefono], conCorte: siNo_(r[D.conCorte]) && String(r[D.conCorte]).trim() !== "",
    detalle: r[D.detalle], lineas: lineas, subtotal: Number(r[D.subtotal]) || 0, ahorro: Number(r[D.ahorro]) || 0,
    total: Number(r[D.total]) || 0, nota: r[D.nota], estado: ESTADOS_PED.indexOf(r[D.estado]) >= 0 ? r[D.estado] : "Pendiente",
  };
}

function pedidoPorId_(id) {
  const datos = hojaPed_().getDataRange().getDisplayValues();
  for (let i = 1; i < datos.length; i++) if (datos[i][D.id] === id) return { fila: i + 1, pedido: aPedido_(datos[i]) };
  return null;
}

/** Suma (o resta, con signo negativo) piezas a los productos de un pedido. */
function moverStock_(lineas, signo) {
  const hoja = hojaProd_();
  const lista = leerProductos_();
  const porId = {};
  lista.forEach((x) => { porId[x.p.id] = x; });
  if (signo < 0) {
    const falta = lineas.filter((l) => !porId[l.id] || porId[l.id].p.stock < l.cantidad);
    if (falta.length) return falta.map((l) => ({ id: l.id, nombre: l.nombre, disponible: porId[l.id] ? porId[l.id].p.stock : 0 }));
  }
  lineas.forEach((l) => {
    const x = porId[l.id];
    if (x) hoja.getRange(x.fila, P.stock + 1).setValue(String(Math.max(0, x.p.stock + signo * l.cantidad)));
  });
  CacheService.getScriptCache().remove(CACHE_PROD);
  return null;
}

/** Carpeta de Drive para las fotos, compartida "cualquiera con el enlace puede ver". */
function carpetaFotos_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("FOTOS_CARPETA");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* la borraron: se crea otra */ } }
  const carpeta = DriveApp.createFolder("El Rey del Bigote · Fotos de productos");
  carpeta.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty("FOTOS_CARPETA", carpeta.getId());
  return carpeta;
}

const fotoUrl_ = (id) => "https://lh3.googleusercontent.com/d/" + id + "=w900";
const idDeFoto_ = (url) => { const m = /googleusercontent\.com\/d\/([\w-]+)/.exec(String(url || "")); return m ? m[1] : ""; };

/** Manda a la papelera una foto que ya no usa ningún producto (solo si es de nuestra carpeta). */
function tirarFoto_(url) {
  const id = idDeFoto_(url);
  if (!id) return;
  if (leerProductos_().some((x) => idDeFoto_(x.p.foto) === id)) return;
  try {
    const f = DriveApp.getFileById(id);
    const carpeta = PropertiesService.getScriptProperties().getProperty("FOTOS_CARPETA");
    const padres = f.getParents();
    while (padres.hasNext()) if (padres.next().getId() === carpeta) { f.setTrashed(true); return; }
  } catch (e) { /* ya no existe */ }
}

function nuevoPedido_(datos) {
  datos = datos || {};
  const telefono = String(datos.telefono || "").replace(/\D/g, "").slice(-10);
  const nombre = String(datos.nombre || "").trim();
  if (nombre.length < 2 || telefono.length !== 10) return { ok: false, error: "datos" };

  const cache = CacheService.getScriptCache();
  const llave = "pedidos-" + telefono;
  const hechos = Number(cache.get(llave) || 0);
  if (hechos >= PEDIDOS_POR_HORA) return { ok: false, error: "limite" };

  const hoy = hoyISO_();
  const q = cotizar_(leerProductos_(), datos.items, !!datos.conCorte, hoy);
  if (!q.ok) return q;

  const hoja = hojaProd_();
  q.lineas.forEach((l) => hoja.getRange(l.fila, P.stock + 1).setValue(String(l.stock - l.cantidad)));
  const lineas = q.lineas.map((l) => ({ id: l.id, nombre: l.nombre, cantidad: l.cantidad, unitario: l.unitario, base: l.base, total: l.total, promo: l.promo }));
  const pedido = {
    id: "T" + Utilities.getUuid().slice(0, 6).toUpperCase(),
    creado: Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd HH:mm"),
    nombre: limpio_(nombre, 80), telefono: telefono, conCorte: !!datos.conCorte, nota: limpio_(datos.nota, 200),
    lineas: lineas, detalle: detalleTexto_(lineas), subtotal: q.subtotal, ahorro: q.ahorro, total: q.total, estado: "Pendiente",
  };
  hojaPed_().appendRow([pedido.id, pedido.creado, pedido.nombre, telefono, pedido.conCorte ? "Sí" : "No", limpio_(pedido.detalle, 2000),
    JSON.stringify(lineas), String(q.subtotal), String(q.ahorro), String(q.total), pedido.nota, "Pendiente"]);
  cache.put(llave, String(hechos + 1), 3600);
  cache.remove(CACHE_PROD);
  return { ok: true, pedido: pedido };
}

/* ---------------- público ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "ocupados") {
      if (!esFecha_(p.fecha)) return json_({ ok: false, error: "datos" });
      return json_({ ok: true, ocupados: ocupados_(p.fecha, String(p.barbero || "")) });
    }
    if (p.action === "config") {
      // Caché de 5 minutos: el sitio lo pide en cada visita y esto casi siempre responde sin abrir la hoja.
      const cache = CacheService.getScriptCache();
      const guardado = cache.get(CACHE_CONFIG);
      if (guardado) return ContentService.createTextOutput(guardado).setMimeType(ContentService.MimeType.JSON);
      const cuerpo = JSON.stringify({ ok: true, config: leerConfig_() });
      cache.put(CACHE_CONFIG, cuerpo, 300);
      return ContentService.createTextOutput(cuerpo).setMimeType(ContentService.MimeType.JSON);
    }
    if (p.action === "productos") {
      // Caché corta: las piezas cambian con cada pedido, y cada pedido la borra.
      const cache = CacheService.getScriptCache();
      const guardado = cache.get(CACHE_PROD);
      if (guardado) return ContentService.createTextOutput(guardado).setMimeType(ContentService.MimeType.JSON);
      const cuerpo = JSON.stringify({ ok: true, productos: leerProductos_().map((x) => x.p).filter((x) => x.visible) });
      cache.put(CACHE_PROD, cuerpo, 60);
      return ContentService.createTextOutput(cuerpo).setMimeType(ContentService.MimeType.JSON);
    }
    return json_({ ok: true, servicio: "El Rey del Bigote" });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { return json_({ ok: false, error: "datos" }); }

  if (body.action === "admin") return admin_(body);
  if (body.action === "pedido") {
    const lockP = LockService.getScriptLock();
    lockP.waitLock(15000); // un pedido a la vez para no vender la misma pieza dos veces
    try { return json_(nuevoPedido_(body.pedido)); }
    catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
    finally { lockP.releaseLock(); }
  }
  if (body.action !== "reservar" || !body.cita) return json_({ ok: false, error: "datos" });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // una reserva a la vez para que nadie aparte la misma hora
  try {
    const c = body.cita;
    const minutos = Number(c.minutos);
    const telefono = String(c.telefono || "").replace(/\D/g, "");
    const valido = esFecha_(c.fecha) && esHora_(c.hora) && minutos >= 10 && minutos <= 180 &&
      String(c.nombre || "").trim().length >= 2 && telefono.length === 10 && String(c.barbero || "").length > 0;
    if (!valido) return json_({ ok: false, error: "datos" });
    if (choca_(c.fecha, c.barbero, c.hora, minutos)) return json_({ ok: false, error: "ocupado" });

    const id = limpio_(c.id || Utilities.getUuid().slice(0, 8), 40);
    hoja_().appendRow([
      id, Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd HH:mm"), c.fecha, c.hora, String(minutos),
      limpio_(c.barbero, 40), limpio_(c.servicio, 120), String(Number(c.precio) || 0), limpio_(c.promo, 80),
      limpio_(c.nombre, 80), telefono, limpio_(c.nota, 200), "Confirmada",
      String(Math.round(Number(c.base) || Number(c.precio) || 0)),
    ]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- panel del barbero ---------------- */

function admin_(body) {
  // Bloqueo simple contra adivinar el PIN: 8 intentos fallidos = 10 minutos sin entrar
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get("fallos") || 0);
  if (fallos >= 8) return json_({ ok: false, error: "bloqueado" });

  const pin = PropertiesService.getScriptProperties().getProperty("ADMIN_PIN");
  if (!pin || String(body.pin || "") !== pin) {
    cache.put("fallos", String(fallos + 1), 600);
    return json_({ ok: false, error: "pin" });
  }
  cache.remove("fallos");

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    switch (body.op) {
      case "login":
        return json_({ ok: true });

      case "citas": {
        if (!esFecha_(body.desde) || !esFecha_(body.hasta)) return json_({ ok: false, error: "datos" });
        const citas = filas_().slice(1)
          .filter((r) => r[C.id] && r[C.fecha] >= body.desde && r[C.fecha] <= body.hasta)
          .map(aCita_)
          .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
        return json_({ ok: true, citas: citas });
      }

      case "ocupados": {
        if (!esFecha_(body.fecha)) return json_({ ok: false, error: "datos" });
        return json_({ ok: true, ocupados: ocupados_(body.fecha, String(body.barbero || ""), String(body.excepto || "")) });
      }

      case "config":
        return json_({ ok: true, config: leerConfig_(true) });

      case "guardarConfig": {
        const nueva = escribirConfig_(body.config);
        if (!nueva) return json_({ ok: false, error: "datos" });
        return json_({ ok: true, config: nueva });
      }

      case "estado": {
        if (ESTADOS.indexOf(body.estado) < 0) return json_({ ok: false, error: "datos" });
        const fila = filaPorId_(String(body.id || ""));
        if (!fila) return json_({ ok: false, error: "no-existe" });
        hoja_().getRange(fila, C.estado + 1).setValue(body.estado);
        return json_({ ok: true, cita: aCita_(hoja_().getRange(fila, 1, 1, COLUMNAS.length).getDisplayValues()[0]) });
      }

      case "mover": {
        if (!esFecha_(body.fecha) || !esHora_(body.hora)) return json_({ ok: false, error: "datos" });
        const id = String(body.id || "");
        const fila = filaPorId_(id);
        if (!fila) return json_({ ok: false, error: "no-existe" });
        const hoja = hoja_();
        const actual = aCita_(hoja.getRange(fila, 1, 1, COLUMNAS.length).getDisplayValues()[0]);
        if (choca_(body.fecha, actual.barbero, body.hora, actual.minutos, id)) return json_({ ok: false, error: "ocupado" });
        hoja.getRange(fila, C.fecha + 1, 1, 2).setValues([[body.fecha, body.hora]]);
        hoja.getRange(fila, C.estado + 1).setValue("Confirmada");
        // La promo va con el día: si cambia de día, cambia el regalo y, si había descuento, el precio.
        const nueva = promoDe_(body.fecha, actual.base, leerConfig_());
        hoja.getRange(fila, C.promo + 1).setValue(limpio_(nueva.texto, 80));
        hoja.getRange(fila, C.precio + 1).setValue(String(nueva.precio));
        hoja.getRange(fila, C.base + 1).setValue(String(Math.round(actual.base)));
        const nota = `Movida desde ${actual.fecha} ${actual.hora}` + (actual.nota ? `. ${actual.nota}` : "");
        hoja.getRange(fila, C.nota + 1).setValue(limpio_(nota, 200));
        return json_({ ok: true, cita: aCita_(hoja.getRange(fila, 1, 1, COLUMNAS.length).getDisplayValues()[0]) });
      }

      case "productos":
        return json_({ ok: true, productos: leerProductos_().map((x) => x.p) });

      case "guardarProducto": {
        const p = productoDe_(body.producto);
        const err = validarProducto_(p);
        if (err) return json_({ ok: false, error: "datos", mensaje: err });
        const hoja = hojaProd_();
        const lista = leerProductos_();
        const actual = p.id ? lista.filter((x) => x.p.id === p.id)[0] : null;
        if (p.id && !actual) return json_({ ok: false, error: "no-existe" });
        if (actual) {
          hoja.getRange(actual.fila, 1, 1, COL_PROD.length).setValues([aFilaProducto_(p)]);
          if (actual.p.foto && actual.p.foto !== p.foto) tirarFoto_(actual.p.foto);
        } else {
          p.id = "p" + Utilities.getUuid().slice(0, 8);
          p.orden = lista.reduce((m, x) => Math.max(m, x.p.orden), 0) + 1;
          hoja.appendRow(aFilaProducto_(p));
        }
        CacheService.getScriptCache().remove(CACHE_PROD);
        return json_({ ok: true, producto: p });
      }

      case "borrarProducto": {
        const x = leerProductos_().filter((y) => y.p.id === String(body.id || ""))[0];
        if (!x) return json_({ ok: false, error: "no-existe" });
        hojaProd_().deleteRow(x.fila);
        tirarFoto_(x.p.foto);
        CacheService.getScriptCache().remove(CACHE_PROD);
        return json_({ ok: true });
      }

      case "subirFoto": {
        const tipo = String(body.tipo || "");
        if (["image/jpeg", "image/png", "image/webp"].indexOf(tipo) < 0 || !body.datos) return json_({ ok: false, error: "datos" });
        const bytes = Utilities.base64Decode(String(body.datos));
        if (bytes.length > 3 * 1024 * 1024) return json_({ ok: false, error: "grande" });
        const nombre = limpio_(body.nombre || "producto", 60).replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, "") + " " + Utilities.formatDate(new Date(), ZONA, "yyyyMMdd-HHmmss");
        const archivo = carpetaFotos_().createFile(Utilities.newBlob(bytes, tipo, nombre));
        archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return json_({ ok: true, foto: fotoUrl_(archivo.getId()) });
      }

      case "pedidos": {
        const dias = Math.min(Math.max(entero_(body.dias) || 45, 1), 365);
        const desde = Utilities.formatDate(new Date(Date.now() - dias * 864e5), ZONA, "yyyy-MM-dd");
        const pedidos = hojaPed_().getDataRange().getDisplayValues().slice(1)
          .filter((r) => r[D.id] && String(r[D.creado]).slice(0, 10) >= desde)
          .map(aPedido_)
          .sort((a, b) => b.creado.localeCompare(a.creado));
        return json_({ ok: true, pedidos: pedidos });
      }

      case "estadoPedido": {
        if (ESTADOS_PED.indexOf(body.estado) < 0) return json_({ ok: false, error: "datos" });
        const x = pedidoPorId_(String(body.id || ""));
        if (!x) return json_({ ok: false, error: "no-existe" });
        const antes = x.pedido.estado, nuevo = body.estado;
        if (antes !== "Cancelado" && nuevo === "Cancelado") moverStock_(x.pedido.lineas, +1);
        if (antes === "Cancelado" && nuevo !== "Cancelado") {
          const falta = moverStock_(x.pedido.lineas, -1);
          if (falta) return json_({ ok: false, error: "agotado", agotados: falta });
        }
        hojaPed_().getRange(x.fila, D.estado + 1).setValue(nuevo);
        x.pedido.estado = nuevo;
        return json_({ ok: true, pedido: x.pedido, productos: leerProductos_().map((y) => y.p) });
      }

      default:
        return json_({ ok: false, error: "datos" });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
