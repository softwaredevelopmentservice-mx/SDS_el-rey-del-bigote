/* Configuración viva del negocio.
   js/config.js trae los valores de arranque. Si el barbero cambió precios, minutos,
   promociones u horarios desde el panel, la API manda y aquí se encima sobre los locales.
   Las reglas de promoción también viven aquí para que el sitio y el panel cuenten lo mismo
   (y lo mismo que Code.gs, que es quien tiene la última palabra al guardar). */
window.NEGOCIO = (function () {
  "use strict";

  const C = window.BARBERIA;
  const KEY = "rdb-config";
  const VIGENCIA = 5 * 60 * 1000; // 5 min: lo mismo que cachea Apps Script

  const esHora = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
  const entero = (v) => { const n = Math.round(Number(v)); return isFinite(n) ? n : null; };
  const diaDe = (f) => (f instanceof Date
    ? f.getDay()
    : new Date(Number(String(f).slice(0, 4)), Number(String(f).slice(5, 7)) - 1, Number(String(f).slice(8, 10))).getDay());

  /* ---------- lo editable, en el formato que viaja a la API ---------- */
  function instantanea() {
    const servicios = {};
    Object.keys(C.servicios).forEach((id) => {
      const s = C.servicios[id];
      servicios[id] = { nombre: s.nombre, corto: s.corto, precio: s.precio, minutos: s.minutos };
    });
    const estilos = {};
    Object.keys(C.estilos).forEach((id) => {
      const e = C.estilos[id];
      estilos[id] = { nombre: e.nombre, extra: e.extra, minutos: e.minutos };
    });
    const horario = {};
    for (let d = 0; d <= 6; d++) if (C.horario[d]) horario[d] = { abre: C.horario[d].abre, cierra: C.horario[d].cierra };
    return {
      servicios: servicios,
      estilos: estilos,
      barbaExtra: { precio: C.barbaExtra.precio, minutos: C.barbaExtra.minutos },
      promociones: (C.promociones || []).map((p) => ({
        dia: p.dia, titulo: p.titulo || "", regalo: p.regalo || "",
        porcentaje: p.porcentaje || 0, detalle: p.detalle || "", activa: p.activa !== false,
      })),
      horario: horario,
    };
  }

  /* ---------- encimar lo que vino de la API ---------- */
  function aplicar(cfg) {
    if (!cfg || typeof cfg !== "object") return false;
    const antes = JSON.stringify(instantanea());

    const servicios = cfg.servicios || {};
    Object.keys(C.servicios).forEach((id) => {
      const r = servicios[id];
      if (!r) return;
      const precio = entero(r.precio), minutos = entero(r.minutos);
      if (precio !== null && precio >= 0) C.servicios[id].precio = precio;
      if (minutos) C.servicios[id].minutos = minutos;
      if (r.nombre) C.servicios[id].nombre = r.nombre;
      if (r.corto) C.servicios[id].corto = r.corto;
    });

    const estilos = cfg.estilos || {};
    Object.keys(C.estilos).forEach((id) => {
      const r = estilos[id];
      if (!r) return;
      const extra = entero(r.extra), minutos = entero(r.minutos);
      if (extra !== null && extra >= 0) C.estilos[id].extra = extra;
      if (minutos !== null && minutos >= 0) C.estilos[id].minutos = minutos;
      if (r.nombre) C.estilos[id].nombre = r.nombre;
    });

    if (cfg.barbaExtra) {
      const precio = entero(cfg.barbaExtra.precio), minutos = entero(cfg.barbaExtra.minutos);
      if (precio !== null && precio >= 0) C.barbaExtra.precio = precio;
      if (minutos !== null && minutos >= 0) C.barbaExtra.minutos = minutos;
    }

    if (Array.isArray(cfg.promociones)) {
      C.promociones = cfg.promociones
        .filter((p) => p && p.dia >= 0 && p.dia <= 6)
        .map((p) => ({
          dia: Number(p.dia), titulo: p.titulo || "", regalo: p.regalo || "",
          porcentaje: entero(p.porcentaje) || 0, detalle: p.detalle || "", activa: p.activa !== false,
        }))
        .sort((a, b) => a.dia - b.dia);
    }

    if (cfg.horario && typeof cfg.horario === "object") {
      const h = {};
      for (let d = 0; d <= 6; d++) {
        const r = cfg.horario[d] || cfg.horario[String(d)];
        if (r && esHora(r.abre) && esHora(r.cierra)) h[d] = { abre: r.abre, cierra: r.cierra };
      }
      // Si viniera vacío sería "cerrado toda la semana": eso no se acepta por accidente.
      if (Object.keys(h).length) C.horario = h;
    }

    return antes !== JSON.stringify(instantanea());
  }

  /* ---------- promociones ---------- */
  function promo(fecha) {
    if (!fecha) return null;
    const d = diaDe(fecha);
    return (C.promociones || []).filter((p) => p.dia === d && p.activa !== false)[0] || null;
  }
  // Mismo texto que escribe Code.gs, para que la hoja y la pantalla digan lo mismo.
  function textoPromo(fecha) {
    const p = promo(fecha);
    if (!p) return "";
    return p.porcentaje ? p.porcentaje + "% de descuento" : String(p.regalo || p.titulo || "");
  }
  function precioConPromo(base, fecha) {
    const p = promo(fecha);
    const n = Number(base) || 0;
    return p && p.porcentaje ? Math.round(n * (1 - p.porcentaje / 100)) : Math.round(n);
  }

  /* ---------- caché del navegador ---------- */
  function enCache() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || "null");
      return r && r.cfg ? r : null;
    } catch (e) { return null; }
  }
  function guardarEnCache(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), cfg: cfg })); } catch (e) { /* sin almacenamiento */ }
  }

  /** Pinta de inmediato con lo último que se vio, sin esperar a la red. */
  function aplicarCache() {
    const r = enCache();
    return r ? aplicar(r.cfg) : false;
  }

  /** Trae la config de la API. Devuelve true si cambió algo de lo que ya estaba pintado. */
  async function traer(forzar) {
    if (!C.apiUrl) return false;
    const r = enCache();
    if (!forzar && r && Date.now() - r.t < VIGENCIA) return false;
    try {
      const res = await fetch(C.apiUrl + "?action=config");
      const data = await res.json();
      if (!data || !data.ok || !data.config) return false;
      guardarEnCache(data.config);
      return aplicar(data.config);
    } catch (e) {
      return false; // sin internet se sigue usando js/config.js
    }
  }

  return { aplicar, aplicarCache, traer, guardarEnCache, instantanea, promo, textoPromo, precioConPromo, diaDe };
})();
