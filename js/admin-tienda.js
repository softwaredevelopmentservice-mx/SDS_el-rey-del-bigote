/* El Rey del Bigote: la tienda en el panel del barbero (pedidos y productos) */
(function () {
  "use strict";

  const A = window.ADMIN;
  const T = window.TIENDA;
  const C = window.BARBERIA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const { api, toast, errText, loading, esc, money, waLink, firstName } = A;
  const FOTO_MAX = A.DEMO ? 700 : 1000; // en demo la foto vive en el navegador: más chica

  const state = { tab: "pedidos", pedidos: [], productos: [], todos: false, cargado: false, edit: null, borrar: false, subiendo: false };

  const NOMBRES_PROMO = {
    "": "Sin promoción",
    oferta: "Precio de oferta",
    porcentaje: "Porcentaje de descuento",
    combo: "Precio especial con corte",
    cantidad: "Por cantidad (2x1, 3x2…)",
  };

  /* ---------- carga ---------- */
  async function cargar(quiet) {
    if (!quiet) {
      if (!state.pedidos.length) $("#pedidos").innerHTML = `<li>${loading("Cargando pedidos…")}</li>`;
      if (!state.productos.length) $("#prodsAdmin").innerHTML = `<li>${loading("Cargando productos…")}</li>`;
    }
    try {
      const [rp, rr] = await Promise.all([api("pedidos", { dias: 60 }), api("productos")]);
      if (!rp.ok) throw new Error(rp.error);
      if (!rr.ok) throw new Error(rr.error);
      state.pedidos = rp.pedidos;
      state.productos = T.ordenar(rr.productos.map(T.normalizar));
      state.cargado = true;
      $("#shopSync").textContent = A.DEMO ? "Modo demo: productos y pedidos se guardan en este navegador." : "";
      renderBadge();
      if (!$("#shop").hidden) render();
    } catch (e) {
      // "datos" aquí significa que la hoja tiene el Code.gs de antes, sin tienda.
      const falta = e.message === "datos";
      const txt = falta ? "La tienda todavía no está instalada en la hoja. Hay que pegar el Code.gs nuevo y ejecutar configurar (ver INSTRUCCIONES, sección Tienda)." : errText(e.message);
      $("#shopSync").textContent = txt;
      const html = `<li class="empty"><b>${falta ? "Falta instalar" : "Sin conexión"}</b>${esc(txt)}</li>`;
      if (!state.pedidos.length) $("#pedidos").innerHTML = html;
      if (!state.productos.length) $("#prodsAdmin").innerHTML = html;
    }
  }

  const pendientes = () => state.pedidos.filter((p) => p.estado === "Pendiente");

  function renderBadge() {
    const n = pendientes().length;
    const b = $("#shopBadge");
    b.textContent = n;
    b.hidden = !n;
    $("#toShop").setAttribute("aria-label", n ? `Tienda: ${n} ${n === 1 ? "pedido pendiente" : "pedidos pendientes"}` : "Tienda");
    $("#tabPedN").textContent = n ? n : "";
  }

  /* ---------- vista ---------- */
  function abrir() {
    A.vista("shop");
    render();
    cargar(state.cargado);
  }

  function setTab(tab) {
    state.tab = tab;
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $("#tabPedidos").hidden = tab !== "pedidos";
    $("#tabProductos").hidden = tab !== "productos";
  }

  function render() {
    setTab(state.tab);
    renderPedidos();
    renderProductos();
    renderBadge();
  }

  /* ---------- pedidos ---------- */
  const hora = (creado) => {
    const [f, h] = String(creado).split(" ");
    if (!h) return creado;
    const [y, m, d] = f.split("-").map(Number);
    const dia = new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
    let [hh, mm] = h.split(":").map(Number);
    const s = hh >= 12 ? "pm" : "am"; hh = hh % 12 || 12;
    return `${dia}, ${hh}:${String(mm).padStart(2, "0")} ${s}`;
  };

  function renderPedidos() {
    const lista = state.todos ? state.pedidos : pendientes();
    const box = $("#pedidos");
    if (!state.cargado) return;
    if (!lista.length) {
      box.innerHTML = `<li class="empty"><b>${state.todos ? "Sin pedidos" : "Todo entregado"}</b>${state.todos ? "Cuando alguien aparte productos en el sitio, aparecen aquí." : "No tienes pedidos pendientes. Los nuevos aparecen aquí solos."}</li>`;
      return;
    }
    box.innerHTML = lista.map((p, i) => pedidoHTML(p, i)).join("");
  }

  function pedidoHTML(p, i) {
    const pendiente = p.estado === "Pendiente";
    const listo = `Hola ${firstName(p.nombre)}, te escribe ${A.barbero()} de ${C.nombre}. Tu pedido ${p.id} (${money(p.total)}) ya está listo` + (p.conCorte ? " para cuando vengas a tu corte." : ". Pasa por él cuando gustes.");
    const cls = ["pedido", pendiente ? "" : "is-done", p.estado === "Cancelado" ? "is-cancel" : ""].join(" ");
    return `<li class="${cls}" data-id="${esc(p.id)}" style="--i:${i}">
      <div class="pedido-top">
        <div><p class="pedido-name">${esc(p.nombre)}</p><small class="pedido-when">${esc(p.id)} · ${esc(hora(p.creado))}</small></div>
        <span class="estado estado-${esc(p.estado)}">${esc(p.estado)}</span>
      </div>
      <ul class="pedido-items">${(p.lineas || []).map((l) => `<li><span><b>${l.cantidad}×</b> ${esc(l.nombre)}${l.promo ? ` <em>${esc(l.promo)}</em>` : ""}</span><span>${money(l.total)}</span></li>`).join("")}</ul>
      <div class="cita-meta">
        <span class="pill pill-money">Total ${money(p.total)}</span>
        ${p.ahorro ? `<span class="pill pill-promo">Ahorró ${money(p.ahorro)}</span>` : ""}
        ${p.conCorte ? `<span class="pill pill-promo">Lo recoge con su corte</span>` : ""}
        ${p.nota ? `<span class="pill pill-note">${esc(p.nota)}</span>` : ""}
      </div>
      <div class="pedido-actions">
        <a class="btn btn-whats" href="${waLink(p.telefono, pendiente ? listo : `Hola ${firstName(p.nombre)}, te escribe ${A.barbero()} de ${C.nombre}.`)}" target="_blank" rel="noopener">${pendiente ? "Avisar que está listo" : "WhatsApp"}</a>
        ${pendiente ? `<button type="button" class="btn btn-line" data-ped="Entregado">Entregado</button><button type="button" class="btn btn-line" data-ped="cancelar">Cancelar</button>` : ""}
        ${p.estado === "Entregado" ? `<button type="button" class="btn btn-line" data-ped="Pendiente">Deshacer</button>` : ""}
        ${p.estado === "Cancelado" ? `<button type="button" class="btn btn-line" data-ped="Pendiente">Reactivar</button>` : ""}
      </div>
    </li>`;
  }

  async function cambiarEstado(id, estado, btn) {
    const p = state.pedidos.find((x) => x.id === id);
    if (!p) return;
    if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
    try {
      const r = await api("estadoPedido", { id, estado });
      if (!r.ok) {
        if (r.error === "agotado") {
          const n = (r.agotados || []).map((a) => `${a.nombre} (quedan ${a.disponible})`).join(", ");
          throw new Error("agotado:" + n);
        }
        throw new Error(r.error);
      }
      Object.assign(p, r.pedido);
      if (r.productos) state.productos = T.ordenar(r.productos.map(T.normalizar));
      render();
      toast(estado === "Entregado" ? `Pedido de ${firstName(p.nombre)} entregado`
        : estado === "Cancelado" ? "Pedido cancelado. Las piezas regresaron al inventario."
        : "Pedido pendiente otra vez");
    } catch (e) {
      const m = String(e.message);
      toast(m.startsWith("agotado:") ? `No alcanza para reactivarlo: ${m.slice(8)}` : errText(m), true);
      renderPedidos();
    }
  }

  /* ---------- productos: lista ---------- */
  function promoTexto(p) {
    const pr = p.promo;
    if (!pr.tipo) return "";
    const e = T.etiqueta(Object.assign({}, p, { promo: Object.assign({}, pr, { desde: "", hasta: "" }) }));
    const vig = T.vigente(p);
    let txt = e ? (pr.tipo === "oferta" ? `Oferta ${money(pr.valor)}` : e.larga) : "";
    if (!vig) txt += pr.desde && T.hoyISO() < pr.desde ? ` · empieza ${pr.desde}` : " · ya terminó";
    else if (pr.hasta) txt += ` · hasta ${pr.hasta}`;
    return txt;
  }

  function renderProductos() {
    const box = $("#prodsAdmin");
    if (!state.cargado) return;
    if (!state.productos.length) {
      box.innerHTML = `<li class="empty"><b>Sin productos</b>Agrega el primero con “Nuevo producto”.</li>`;
      return;
    }
    box.innerHTML = state.productos.map((p, i) => {
      const pt = promoTexto(p);
      return `<li style="--i:${i}"><button type="button" class="prod-row${p.visible ? "" : " is-hidden"}" data-edit="${esc(p.id)}">
        <span class="prod-row-img">${p.foto ? `<img src="${esc(p.foto)}" alt="">` : `<img src="assets/logo.svg" alt="" class="ph">`}</span>
        <span class="prod-row-info">
          <b>${esc(p.nombre)}</b>
          <small>${esc(p.categoria || "Sin categoría")} · ${money(p.precio)}</small>
          ${pt ? `<em>${esc(pt)}</em>` : ""}
        </span>
        <span class="prod-row-side">
          <span class="stock ${p.stock < 1 ? "is-out" : p.stock <= 3 ? "is-low" : ""}">${p.stock < 1 ? "Agotado" : p.stock + (p.stock === 1 ? " pieza" : " piezas")}</span>
          ${p.visible ? "" : `<span class="pill pill-note">Oculto</span>`}
        </span>
      </button></li>`;
    }).join("");
  }

  /* ---------- productos: editor ---------- */
  const NUEVO = () => T.normalizar({ nombre: "", precio: 0, stock: 1, visible: true, promo: { tipo: "" } });
  let lastFocus = null;

  function abrirEditor(id) {
    const p = id ? state.productos.find((x) => x.id === id) : NUEVO();
    if (!p) return;
    state.edit = JSON.parse(JSON.stringify(p));
    state.borrar = false;
    lastFocus = document.activeElement;
    const e = state.edit;
    $("#prodTitle").textContent = id ? "Editar producto" : "Nuevo producto";
    $("#pNombre").value = e.nombre;
    $("#pCat").value = e.categoria;
    $("#pDesc").value = e.descripcion;
    $("#pPrecio").value = id ? e.precio : "";
    $("#pStock").value = e.stock;
    $("#pVisible").checked = e.visible;
    $("#pTipo").value = e.promo.tipo;
    $("#pValor").value = e.promo.valor || "";
    $("#pLleva").value = e.promo.lleva || 2;
    $("#pPaga").value = e.promo.paga || 1;
    $("#pDesde").value = e.promo.desde;
    $("#pHasta").value = e.promo.hasta;
    $("#pErr").textContent = "";
    $("#pDelete").hidden = !id;
    $("#pDelete").textContent = "Borrar";
    $("#cats").innerHTML = Array.from(new Set(state.productos.map((x) => x.categoria).filter(Boolean))).map((c) => `<option value="${esc(c)}">`).join("");
    pintarFoto();
    pintarPromo();
    $("#prodSheet").hidden = false;
    document.body.style.overflow = "hidden";
    $("#prodSheet .sheet-card").focus();
  }

  function cerrarEditor() {
    if ($("#prodSheet").hidden) return;
    $("#prodSheet").hidden = true;
    document.body.style.overflow = "";
    state.edit = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  function pintarFoto() {
    const f = state.edit.foto;
    $("#pFotoPrev").innerHTML = state.subiendo ? loading("Subiendo foto…")
      : f ? `<img src="${esc(f)}" alt="Foto del producto">` : `<span class="foto-empty"><img src="assets/logo.svg" alt=""><small>Sin foto</small></span>`;
    $("#pFotoBtn").textContent = f ? "Cambiar foto" : "Subir foto";
    $("#pFotoQuitar").hidden = !f || state.subiendo;
  }

  /** Lee el formulario al producto en edición. */
  function leerForm() {
    const e = state.edit;
    const num = (sel) => { const v = $(sel).value.trim(); return v === "" ? 0 : Math.round(Number(v)); };
    e.nombre = $("#pNombre").value.trim();
    e.categoria = $("#pCat").value.trim();
    e.descripcion = $("#pDesc").value.trim();
    e.precio = num("#pPrecio");
    e.stock = num("#pStock");
    e.visible = $("#pVisible").checked;
    e.promo = {
      tipo: $("#pTipo").value, valor: num("#pValor"), lleva: num("#pLleva"), paga: num("#pPaga"),
      desde: $("#pDesde").value, hasta: $("#pHasta").value,
    };
    return T.normalizar(e);
  }

  /** Muestra solo los campos del tipo de promo y un ejemplo de cómo queda. */
  function pintarPromo() {
    const tipo = $("#pTipo").value;
    $("#pValorBox").hidden = !tipo || tipo === "cantidad";
    $("#pCantBox").hidden = tipo !== "cantidad";
    $("#pFechas").hidden = !tipo;
    const etq = { oferta: "Precio de oferta", porcentaje: "Descuento %", combo: "Precio con corte" }[tipo];
    if (etq) $("#pValorL").textContent = etq;
    const p = leerForm();
    const prev = $("#pPreview");
    if (!tipo || !p.precio) { prev.hidden = true; return; }
    const sinFechas = Object.assign({}, p, { promo: Object.assign({}, p.promo, { desde: "", hasta: "" }) });
    const err = T.validar(Object.assign({}, sinFechas, { nombre: p.nombre || "este producto" }));
    if (err) { prev.hidden = false; prev.className = "move-promo is-warn"; prev.textContent = err; return; }
    let txt;
    if (tipo === "oferta") txt = `Se ve como <s>${money(p.precio)}</s> <b>${money(p.promo.valor)}</b>.`;
    else if (tipo === "porcentaje") txt = `Queda en <b>${money(T.precioUnitario(sinFechas, false))}</b> (antes ${money(p.precio)}).`;
    else if (tipo === "combo") txt = `Cuesta ${money(p.precio)}; si se lo lleva con su corte, <b>${money(p.promo.valor)}</b>.`;
    else {
      const l = T.linea(sinFechas, p.promo.lleva, false);
      txt = `Si se lleva ${p.promo.lleva} paga <b>${money(l.total)}</b> en vez de ${money(l.base)}.`;
    }
    if (p.promo.desde || p.promo.hasta) txt += ` Vale ${p.promo.desde ? "del " + p.promo.desde : "desde hoy"} ${p.promo.hasta ? "al " + p.promo.hasta : "sin fecha de fin"}.`;
    prev.hidden = false; prev.className = "move-promo"; prev.innerHTML = txt;
  }

  /** Achica la foto en el navegador antes de subirla: el celular toma fotos de varios MB. */
  function achicar(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, FOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#121214"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagen")); };
      img.src = url;
    });
  }

  async function subirFoto(file) {
    if (!file || !state.edit) return;
    if (!/^image\//.test(file.type)) { $("#pErr").textContent = "Elige una imagen (JPG o PNG)."; return; }
    state.subiendo = true; pintarFoto();
    $("#pSave").disabled = true;
    try {
      const dataUrl = await achicar(file);
      const r = await api("subirFoto", { nombre: $("#pNombre").value.trim() || "producto", tipo: "image/jpeg", datos: dataUrl.split(",")[1] });
      if (!r.ok) throw new Error(r.error);
      if (state.edit) state.edit.foto = r.foto;
      $("#pErr").textContent = "";
    } catch (e) {
      $("#pErr").textContent = e.message === "imagen" ? "No pudimos leer esa imagen. Prueba con otra." : errText(e.message);
    } finally {
      state.subiendo = false;
      $("#pSave").disabled = false;
      $("#pFoto").value = "";
      if (state.edit) pintarFoto();
    }
  }

  async function guardar() {
    const p = leerForm();
    const err = T.validar(p);
    if (err) { $("#pErr").textContent = err; return; }
    const btn = $("#pSave");
    btn.disabled = true; btn.textContent = "Guardando…";
    $("#pErr").textContent = "";
    try {
      const r = await api("guardarProducto", { producto: p });
      if (!r.ok) throw new Error(r.mensaje || r.error);
      const n = T.normalizar(r.producto);
      const i = state.productos.findIndex((x) => x.id === n.id);
      if (i >= 0) state.productos[i] = n; else state.productos.push(n);
      state.productos = T.ordenar(state.productos);
      cerrarEditor();
      renderProductos();
      toast(i >= 0 ? `${n.nombre} guardado` : `${n.nombre} ya está en la tienda`);
    } catch (e) {
      $("#pErr").textContent = ERR_LARGO(e.message);
    } finally {
      btn.disabled = false; btn.textContent = "Guardar";
    }
  }
  const ERR_LARGO = (m) => (m && m.length > 12 && !/^[a-z-]+$/.test(m) ? m : errText(m));

  async function borrar() {
    const e = state.edit;
    if (!e || !e.id) return;
    const btn = $("#pDelete");
    if (!state.borrar) { state.borrar = true; btn.textContent = "¿Seguro? Toca otra vez"; return; }
    btn.disabled = true; btn.textContent = "Borrando…";
    try {
      const r = await api("borrarProducto", { id: e.id });
      if (!r.ok) throw new Error(r.error);
      state.productos = state.productos.filter((x) => x.id !== e.id);
      const nombre = e.nombre;
      cerrarEditor();
      renderProductos();
      toast(`${nombre} se quitó de la tienda`);
    } catch (err) {
      $("#pErr").textContent = errText(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- eventos ---------- */
  function bind() {
    $("#toShop").addEventListener("click", abrir);
    $("#shopBack").addEventListener("click", () => A.volver());
    $$("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    $("#pedTodos").addEventListener("change", (e) => { state.todos = e.target.checked; renderPedidos(); });
    $("#shopRefresh").addEventListener("click", () => cargar(true));
    $("#pedidos").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ped]");
      if (!b) return;
      const id = b.closest(".pedido").dataset.id;
      if (b.dataset.ped === "cancelar") {
        if (b.dataset.seguro) cambiarEstado(id, "Cancelado", b);
        else { b.dataset.seguro = "1"; b.textContent = "¿Seguro? Toca otra vez"; b.classList.add("is-warn"); }
        return;
      }
      cambiarEstado(id, b.dataset.ped, b);
    });
    $("#prodNew").addEventListener("click", () => abrirEditor(null));
    $("#prodsAdmin").addEventListener("click", (e) => { const b = e.target.closest("[data-edit]"); if (b) abrirEditor(b.dataset.edit); });
    $("#prodClose").addEventListener("click", cerrarEditor);
    $("#pCancel").addEventListener("click", cerrarEditor);
    $("#prodSheet").addEventListener("click", (e) => { if (e.target.id === "prodSheet") cerrarEditor(); });
    $("#pSave").addEventListener("click", guardar);
    $("#pDelete").addEventListener("click", borrar);
    $("#pFotoBtn").addEventListener("click", () => $("#pFoto").click());
    $("#pFoto").addEventListener("change", (e) => subirFoto(e.target.files[0]));
    $("#pFotoQuitar").addEventListener("click", () => { state.edit.foto = ""; pintarFoto(); });
    $$("[data-stock]").forEach((b) => b.addEventListener("click", () => {
      const el = $("#pStock");
      el.value = Math.max(0, Math.min(9999, (Math.round(Number(el.value)) || 0) + Number(b.dataset.stock)));
    }));
    ["#pTipo", "#pValor", "#pLleva", "#pPaga", "#pDesde", "#pHasta", "#pPrecio"].forEach((s) => $(s).addEventListener("input", pintarPromo));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarEditor(); });
    // los pedidos nuevos se asoman solos cada minuto mientras el panel está abierto
    setInterval(() => { if (state.cargado && document.visibilityState === "visible" && $("#prodSheet").hidden) cargar(true); }, 60000);
  }

  $("#pTipo").innerHTML = T.TIPOS.map((t) => `<option value="${t}">${NOMBRES_PROMO[t]}</option>`).join("");
  bind();

  window.ADMIN_TIENDA = {
    alEntrar() { cargar(true); },
    alSalir() { state.pedidos = []; state.productos = []; state.cargado = false; cerrarEditor(); renderBadge(); },
  };
})();
