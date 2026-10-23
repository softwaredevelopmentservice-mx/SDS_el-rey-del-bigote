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
 *
 * PANEL DEL BARBERO (requiere PIN, siempre por POST)
 *   POST { action: "admin", pin, op: "citas",  desde, hasta }          -> { ok, citas: [...] }
 *   POST { action: "admin", pin, op: "estado", id, estado }            -> { ok, cita }
 *   POST { action: "admin", pin, op: "mover",  id, fecha, hora }       -> { ok, cita } | { ok:false, error:"ocupado" }
 *        Al mover se recalculan la promo y el precio con las reglas del día nuevo.
 *   POST { action: "admin", pin, op: "ocupados", fecha, barbero, excepto } -> { ok, ocupados }
 *   POST { action: "admin", pin, op: "config" }                        -> { ok, config }
 *   POST { action: "admin", pin, op: "guardarConfig", config }         -> { ok, config } | { ok:false, error:"datos" }
 *
 * Hojas: Citas (las reservas) + Servicios, Promos y Horario (lo que edita el barbero).
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
  CacheService.getScriptCache().remove(CACHE_CONFIG);

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
    return json_({ ok: true, servicio: "El Rey del Bigote" });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { return json_({ ok: false, error: "datos" }); }

  if (body.action === "admin") return admin_(body);
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

      default:
        return json_({ ok: false, error: "datos" });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
