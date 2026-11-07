/* Tienda de El Rey del Bigote: productos, promociones y pedidos.
   Lo usan el sitio y el panel. Las reglas de precio son las mismas que aplica Code.gs
   (que tiene la última palabra al guardar un pedido); si cambias una, cambia la otra.

   Promoción de un producto (una a la vez):
     { tipo: "",           ... }                 sin promoción
     { tipo: "oferta",     valor: 180 }          precio rebajado
     { tipo: "porcentaje", valor: 15 }           15% de descuento
     { tipo: "combo",      valor: 160 }          precio si se lo lleva con su corte
     { tipo: "cantidad",   lleva: 3, paga: 2 }   3x2
   Con desde / hasta ("YYYY-MM-DD", opcionales) solo vale esos días. */
window.TIENDA = (function () {
  "use strict";

  const C = window.BARBERIA;
  const TIPOS = ["", "oferta", "porcentaje", "combo", "cantidad"];
  const MAX_PIEZAS = 20;     // por producto en un pedido
  const DEMO_KEY = "rdb-tienda-demo";
  const CACHE_KEY = "rdb-tienda";

  const entero = (v) => { const n = Math.round(Number(v)); return isFinite(n) ? n : null; };
  const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-MX");
  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /* ---------- forma y limpieza ---------- */
  function normalizar(p) {
    p = p || {};
    const pr = p.promo || {};
    const tipo = TIPOS.indexOf(pr.tipo) >= 0 ? pr.tipo : "";
    return {
      id: String(p.id || ""),
      nombre: String(p.nombre || "").trim(),
      categoria: String(p.categoria || "").trim(),
      descripcion: String(p.descripcion || "").trim(),
      precio: Math.max(0, entero(p.precio) || 0),
      stock: Math.max(0, entero(p.stock) || 0),
      visible: p.visible !== false,
      orden: entero(p.orden) || 0,
      foto: String(p.foto || ""),
      promo: {
        tipo: tipo,
        valor: tipo === "cantidad" ? 0 : Math.max(0, entero(pr.valor) || 0),
        lleva: tipo === "cantidad" ? Math.max(0, entero(pr.lleva) || 0) : 0,
        paga: tipo === "cantidad" ? Math.max(0, entero(pr.paga) || 0) : 0,
        desde: esFecha(pr.desde) ? pr.desde : "",
        hasta: esFecha(pr.hasta) ? pr.hasta : "",
      },
    };
  }

  /** Primer problema del producto, o "" si está bien. Mismas reglas que Code.gs. */
  function validar(p) {
    if (p.nombre.length < 2) return "Ponle nombre al producto.";
    if (p.precio < 1 || p.precio > 99999) return `Revisa el precio de ${p.nombre}.`;
    if (p.stock < 0 || p.stock > 9999) return `Las piezas de ${p.nombre} van de 0 a 9999.`;
    const pr = p.promo;
    if (pr.desde && pr.hasta && pr.desde > pr.hasta) return "La promoción termina antes de empezar.";
    if (pr.tipo === "oferta" && !(pr.valor >= 1 && pr.valor < p.precio)) return "El precio de oferta tiene que ser menor que el normal.";
    if (pr.tipo === "porcentaje" && !(pr.valor >= 1 && pr.valor <= 90)) return "El descuento va de 1% a 90%.";
    if (pr.tipo === "combo" && !(pr.valor >= 1 && pr.valor < p.precio)) return "El precio con corte tiene que ser menor que el normal.";
    if (pr.tipo === "cantidad" && !(pr.lleva >= 2 && pr.lleva <= 10 && pr.paga >= 1 && pr.paga < pr.lleva)) return "En la promo por cantidad, se lleva más de las que paga (ej. 3x2).";
    return "";
  }

  /* ---------- promociones ---------- */
  function vigente(p, hoy) {
    const pr = p && p.promo;
    if (!pr || !pr.tipo) return null;
    hoy = hoy || hoyISO();
    if (pr.desde && hoy < pr.desde) return null;
    if (pr.hasta && hoy > pr.hasta) return null;
    return pr;
  }

  /** Etiqueta para la tarjeta: corta ("-15%") y larga ("15% de descuento"). */
  function etiqueta(p, hoy) {
    const pr = vigente(p, hoy);
    if (!pr) return null;
    if (pr.tipo === "oferta") return { corta: "Oferta", larga: `Antes ${money(p.precio)}` };
    if (pr.tipo === "porcentaje") return { corta: `-${pr.valor}%`, larga: `${pr.valor}% de descuento` };
    if (pr.tipo === "combo") return { corta: "Con tu corte", larga: `${money(pr.valor)} si te la llevas con tu corte` };
    if (pr.tipo === "cantidad") return { corta: `${pr.lleva}x${pr.paga}`, larga: `Llévate ${pr.lleva} y paga ${pr.paga}` };
    return null;
  }

  /** Precio de una pieza ya con la promo (la de cantidad se aplica en la línea). */
  function precioUnitario(p, conCorte, hoy) {
    const pr = vigente(p, hoy);
    if (!pr) return p.precio;
    if (pr.tipo === "oferta") return pr.valor;
    if (pr.tipo === "porcentaje") return Math.round(p.precio * (1 - pr.valor / 100));
    if (pr.tipo === "combo") return conCorte ? pr.valor : p.precio;
    return p.precio;
  }

  /** Lo que cuesta llevarse `cantidad` piezas. */
  function linea(p, cantidad, conCorte, hoy) {
    const n = Math.max(0, entero(cantidad) || 0);
    const pr = vigente(p, hoy);
    const base = p.precio * n;
    let total;
    if (pr && pr.tipo === "cantidad") total = (Math.floor(n / pr.lleva) * pr.paga + (n % pr.lleva)) * p.precio;
    else total = precioUnitario(p, conCorte, hoy) * n;
    let promo = "";
    if (total < base) {
      const e = etiqueta(p, hoy);
      promo = pr.tipo === "combo" ? "Precio con corte" : pr.tipo === "oferta" ? "Oferta" : e ? (pr.tipo === "cantidad" ? e.corta : e.larga) : "";
    }
    return { cantidad: n, base: base, total: total, ahorro: base - total, promo: promo };
  }

  /**
   * Arma un pedido contra la lista de productos: valida existencias y calcula totales.
   * No cambia nada; devuelve { ok, error, agotados, lineas, subtotal, ahorro, total }.
   * Code.gs hace exactamente esto antes de descontar piezas.
   */
  function cotizar(productos, items, conCorte, hoy) {
    const porId = {};
    productos.forEach((p) => { porId[p.id] = p; });
    const juntos = {};
    (items || []).forEach((it) => {
      const id = String((it && it.id) || "");
      const n = entero(it && it.cantidad) || 0;
      if (id && n > 0) juntos[id] = (juntos[id] || 0) + n;
    });
    const ids = Object.keys(juntos);
    if (!ids.length) return { ok: false, error: "vacio" };
    const lineas = [], agotados = [];
    let subtotal = 0, total = 0;
    ids.forEach((id) => {
      const p = porId[id];
      const n = Math.min(juntos[id], MAX_PIEZAS);
      if (!p || !p.visible) { agotados.push({ id: id, nombre: p ? p.nombre : "", disponible: 0 }); return; }
      if (p.stock < n) { agotados.push({ id: id, nombre: p.nombre, disponible: p.stock }); return; }
      const l = linea(p, n, conCorte, hoy);
      lineas.push({ id: id, nombre: p.nombre, cantidad: n, unitario: p.precio, base: l.base, total: l.total, promo: l.promo });
      subtotal += l.base; total += l.total;
    });
    if (agotados.length) return { ok: false, error: "agotado", agotados: agotados };
    return { ok: true, lineas: lineas, subtotal: subtotal, ahorro: subtotal - total, total: total };
  }

  /** "2× Pomada formal ($360, 2x1)" por línea: lo que se guarda en la hoja y va al WhatsApp. */
  function detalleTexto(lineas) {
    return lineas.map((l) => `${l.cantidad}× ${l.nombre} (${money(l.total)}${l.promo ? ", " + l.promo : ""})`).join("\n");
  }

  const ordenar = (lista) => lista.slice().sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

  /* ---------- modo demo: productos y pedidos en este navegador ---------- */
  let mem = null;
  function demoLeer() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch (e) { mem = null; }
    if (!mem || !Array.isArray(mem.productos)) {
      mem = { productos: (C.productos || []).map(normalizar), pedidos: [] };
    }
    return mem;
  }
  function demoGuardar() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(mem)); } catch (e) { /* queda en memoria */ } }
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const nuevoId = (pre) => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /** Hace en el navegador lo mismo que Code.gs, para probar todo sin la hoja. */
  const demo = {
    // Siempre copias: quien las use no debe poder cambiar lo guardado por accidente.
    productos() { return copia(ordenar(demoLeer().productos)); },
    pedidos() { return copia(demoLeer().pedidos.slice().sort((a, b) => b.creado.localeCompare(a.creado))); },
    guardarProducto(p) {
      const d = demoLeer();
      p = normalizar(p);
      const err = validar(p);
      if (err) return { ok: false, error: "datos", mensaje: err };
      if (!p.id) { p.id = nuevoId("p"); p.orden = d.productos.length + 1; d.productos.push(p); }
      else {
        const i = d.productos.findIndex((x) => x.id === p.id);
        if (i < 0) return { ok: false, error: "no-existe" };
        d.productos[i] = p;
      }
      demoGuardar();
      return { ok: true, producto: copia(p) };
    },
    borrarProducto(id) {
      const d = demoLeer();
      d.productos = d.productos.filter((x) => x.id !== id);
      demoGuardar();
      return { ok: true };
    },
    crearPedido(datos) {
      const d = demoLeer();
      const q = cotizar(d.productos, datos.items, !!datos.conCorte);
      if (!q.ok) return q;
      q.lineas.forEach((l) => { const p = d.productos.find((x) => x.id === l.id); p.stock -= l.cantidad; });
      const ahora = new Date();
      const pedido = {
        id: "T" + Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0"),
        creado: `${hoyISO()} ${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`,
        nombre: datos.nombre, telefono: datos.telefono, conCorte: !!datos.conCorte, nota: datos.nota || "",
        lineas: q.lineas, detalle: detalleTexto(q.lineas), subtotal: q.subtotal, ahorro: q.ahorro, total: q.total, estado: "Pendiente",
      };
      d.pedidos.push(pedido);
      demoGuardar();
      return { ok: true, pedido: copia(pedido) };
    },
    estadoPedido(id, estado) {
      const d = demoLeer();
      const ped = d.pedidos.find((x) => x.id === id);
      if (!ped) return { ok: false, error: "no-existe" };
      const r = moverExistencias(d.productos, ped, estado);
      if (!r.ok) return r;
      ped.estado = estado;
      demoGuardar();
      return { ok: true, pedido: copia(ped), productos: copia(ordenar(d.productos)) };
    },
  };

  /** Cancelar regresa las piezas; reactivar un cancelado las vuelve a apartar (si alcanzan). */
  function moverExistencias(productos, ped, nuevo) {
    const antes = ped.estado;
    const porId = {};
    productos.forEach((p) => { porId[p.id] = p; });
    if (antes !== "Cancelado" && nuevo === "Cancelado") {
      ped.lineas.forEach((l) => { if (porId[l.id]) porId[l.id].stock += l.cantidad; });
    } else if (antes === "Cancelado" && nuevo !== "Cancelado") {
      const falta = ped.lineas.filter((l) => !porId[l.id] || porId[l.id].stock < l.cantidad);
      if (falta.length) return { ok: false, error: "agotado", agotados: falta.map((l) => ({ id: l.id, nombre: l.nombre, disponible: porId[l.id] ? porId[l.id].stock : 0 })) };
      ped.lineas.forEach((l) => { porId[l.id].stock -= l.cantidad; });
    }
    return { ok: true };
  }

  /* ---------- catálogo para el sitio ---------- */
  function enCache() {
    try { const r = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return r && Array.isArray(r.productos) ? r.productos.map(normalizar) : null; }
    catch (e) { return null; }
  }

  /** Lo que se pinta de inmediato: lo último que vio este navegador o, si no hay, config.js. */
  function inicial() {
    if (!C.apiUrl) return demo.productos();
    return ordenar(enCache() || (C.productos || []).map(normalizar));
  }

  /** Trae el catálogo en vivo (con existencias). Devuelve null si no hay conexión. */
  async function traer() {
    if (!C.apiUrl) return demo.productos();
    try {
      const res = await fetch(C.apiUrl + "?action=productos");
      const data = await res.json();
      if (!data || !data.ok || !Array.isArray(data.productos)) return null;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), productos: data.productos })); } catch (e) { /* sin almacenamiento */ }
      return ordenar(data.productos.map(normalizar));
    } catch (e) {
      return null;
    }
  }

  /** Manda el pedido. En demo lo resuelve aquí mismo. */
  async function pedir(datos) {
    if (!C.apiUrl) { await new Promise((r) => setTimeout(r, 400)); return demo.crearPedido(datos); }
    const res = await fetch(C.apiUrl, { method: "POST", body: JSON.stringify({ action: "pedido", pedido: datos }) });
    return res.json();
  }

  return {
    TIPOS, MAX_PIEZAS, hoyISO, money, normalizar, validar, vigente, etiqueta, precioUnitario, linea,
    cotizar, detalleTexto, ordenar, moverExistencias, demo, inicial, traer, pedir,
  };
})();
