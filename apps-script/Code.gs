/**
 * El Rey del Bigote: API de reservas y panel del barbero sobre Google Sheets.
 * Hecho por SDS (Software Development Service).
 *
 * PÚBLICO (sitio de reservas)
 *   GET  ?action=ocupados&fecha=YYYY-MM-DD&barbero=lando
 *        -> { ok: true, ocupados: [{ hora: "10:30", minutos: 40 }] }
 *   POST { action: "reservar", cita: {...} }
 *        -> { ok: true, id } | { ok: false, error: "ocupado" | "datos" }
 *
 * PANEL DEL BARBERO (requiere PIN, siempre por POST)
 *   POST { action: "admin", pin, op: "citas",  desde, hasta }          -> { ok, citas: [...] }
 *   POST { action: "admin", pin, op: "estado", id, estado }            -> { ok, cita }
 *   POST { action: "admin", pin, op: "mover",  id, fecha, hora }       -> { ok, cita } | { ok:false, error:"ocupado" }
 *   POST { action: "admin", pin, op: "ocupados", fecha, barbero, excepto } -> { ok, ocupados }
 *
 * Instalación: ver apps-script/INSTRUCCIONES.md
 */

const HOJA = "Citas";
const COLUMNAS = ["ID", "Creada", "Fecha", "Hora", "Minutos", "Barbero", "Servicio", "Precio", "Promo", "Nombre", "Telefono", "Nota", "Estado"];
// Índices de columna (base 0)
const C = { id: 0, creada: 1, fecha: 2, hora: 3, minutos: 4, barbero: 5, servicio: 6, precio: 7, promo: 8, nombre: 9, telefono: 10, nota: 11, estado: 12 };
const ESTADOS = ["Confirmada", "Atendida", "No vino", "Cancelada"];
const ZONA = "America/Mexico_City";

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

/* ---------------- público ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "ocupados") {
      if (!esFecha_(p.fecha)) return json_({ ok: false, error: "datos" });
      return json_({ ok: true, ocupados: ocupados_(p.fecha, String(p.barbero || "")) });
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
