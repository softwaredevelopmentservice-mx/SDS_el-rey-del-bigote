/* El Rey del Bigote: la tienda en el sitio (catálogo, carrito y pedido por WhatsApp) */
(function () {
  "use strict";

  const C = window.BARBERIA;
  const T = window.TIENDA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = T.money;
  const CART_KEY = "rdb-carrito";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // enLinea: null = aún no sabemos; false = la API no tiene tienda (Code.gs viejo o sin internet).
  const state = { productos: T.inicial(), cat: "", cart: leerCarrito(), conCorte: false, enviando: false, enLinea: C.apiUrl ? null : true };
  if (!$("#tienda")) return;

  /* ---------- carrito guardado ---------- */
  function leerCarrito() {
    try { const r = JSON.parse(localStorage.getItem(CART_KEY) || "null"); return r && typeof r === "object" && !Array.isArray(r) ? r : {}; }
    catch (e) { return {}; }
  }
  function guardarCarrito() { try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) { /* sin almacenamiento */ } }

  const porId = (id) => state.productos.find((p) => p.id === id);
  const piezas = () => Object.values(state.cart).reduce((s, n) => s + n, 0);
  const lineasCarrito = () => Object.keys(state.cart).map((id) => ({ p: porId(id), n: state.cart[id] })).filter((x) => x.p);
  const hayCombo = () => lineasCarrito().some((x) => { const pr = T.vigente(x.p); return pr && pr.tipo === "combo"; });

  /** Quita del carrito lo que ya no existe y ajusta a las piezas que quedan. */
  function ajustarCarrito() {
    let cambio = false;
    Object.keys(state.cart).forEach((id) => {
      const p = porId(id);
      const max = p ? Math.min(p.stock, T.MAX_PIEZAS) : 0;
      if (state.cart[id] > max) { cambio = true; if (max > 0) state.cart[id] = max; else delete state.cart[id]; }
    });
    if (cambio) guardarCarrito();
    return cambio;
  }

  function cotizacion() {
    const items = lineasCarrito().map((x) => ({ id: x.p.id, cantidad: x.n }));
    let subtotal = 0, total = 0;
    const lineas = lineasCarrito().map((x) => {
      const l = T.linea(x.p, x.n, state.conCorte);
      subtotal += l.base; total += l.total;
      return Object.assign({ p: x.p }, l);
    });
    return { items, lineas, subtotal, total, ahorro: subtotal - total };
  }

  /* ---------- catálogo ---------- */
  const visibles = () => state.productos.filter((p) => p.visible);
  const categorias = () => Array.from(new Set(visibles().map((p) => p.categoria).filter(Boolean)));

  function renderCats() {
    const cats = categorias();
    const box = $("#shopCats");
    if (cats.length < 2) { box.hidden = true; state.cat = ""; return; }
    if (state.cat && !cats.includes(state.cat)) state.cat = "";
    box.hidden = false;
    box.innerHTML = ["", ...cats].map((c) => `<button type="button" class="chip" aria-pressed="${c === state.cat}" data-cat="${esc(c)}">${c ? esc(c) : "Todo"}</button>`).join("");
  }

  function precioHTML(p) {
    const pr = T.vigente(p);
    const unit = T.precioUnitario(p, false);
    if (pr && (pr.tipo === "oferta" || pr.tipo === "porcentaje")) return `<s>${money(p.precio)}</s>${money(unit)}`;
    return money(p.precio);
  }

  function controlHTML(p) {
    if (p.stock < 1) return `<button type="button" class="btn btn-line btn-sm" disabled>Agotado</button>`;
    const n = state.cart[p.id] || 0;
    if (!n) return `<button type="button" class="btn btn-red btn-sm" data-add="${esc(p.id)}" aria-label="Agregar ${esc(p.nombre)} a tu pedido">Agregar</button>`;
    return stepperHTML(p, n);
  }

  function stepperHTML(p, n) {
    const max = Math.min(p.stock, T.MAX_PIEZAS);
    return `<div class="stepper" role="group" aria-label="Piezas de ${esc(p.nombre)}">
      <button type="button" data-menos="${esc(p.id)}" aria-label="Quitar una">${n === 1 ? trash : "−"}</button>
      <output aria-live="polite">${n}</output>
      <button type="button" data-mas="${esc(p.id)}" aria-label="Agregar una" ${n >= max ? "disabled" : ""}>+</button>
    </div>`;
  }
  const trash = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';

  function tarjetaHTML(p, i) {
    const e = T.etiqueta(p);
    const pr = T.vigente(p);
    const agotado = p.stock < 1;
    const promoLinea = e && (pr.tipo === "combo" || pr.tipo === "cantidad") ? `<p class="prod-promo">${esc(e.larga)}</p>` : "";
    const quedan = !agotado && p.stock <= 3 ? `<p class="prod-stock">${p.stock === 1 ? "Queda 1" : `Quedan ${p.stock}`}</p>` : "";
    return `<li class="prod${agotado ? " is-out" : ""}" data-id="${esc(p.id)}" style="--i:${i}">
      <div class="prod-img">
        ${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nombre)}" loading="lazy">` : `<span class="prod-ph" aria-hidden="true"><img src="assets/logo.svg" alt=""></span>`}
        ${e ? `<span class="prod-badge">${esc(e.corta)}</span>` : ""}
        ${agotado ? `<span class="prod-out">Agotado</span>` : ""}
      </div>
      <div class="prod-body">
        ${p.categoria ? `<small class="prod-cat">${esc(p.categoria)}</small>` : ""}
        <h3 class="prod-name">${esc(p.nombre)}</h3>
        ${p.descripcion ? `<p class="prod-desc">${esc(p.descripcion)}</p>` : ""}
        ${promoLinea}
        <div class="prod-foot">
          <p class="prod-price">${precioHTML(p)}</p>
          <div class="prod-ctl">${controlHTML(p)}</div>
        </div>
        ${quedan}
      </div>
    </li>`;
  }

  function renderGrid() {
    const lista = visibles().filter((p) => !state.cat || p.categoria === state.cat);
    const grid = $("#shopGrid");
    if (!lista.length) {
      grid.innerHTML = `<li class="shop-empty"><b>Pronto</b>Estamos acomodando los productos. Pregunta en la barbería.</li>`;
      return;
    }
    grid.innerHTML = lista.map(tarjetaHTML).join("");
  }

  /** Solo cambia el botón/contador de una tarjeta, sin repintar toda la cuadrícula. */
  function refrescarTarjeta(id) {
    const p = porId(id);
    const el = document.querySelector(`.prod[data-id="${CSS.escape(id)}"] .prod-ctl`);
    if (p && el) el.innerHTML = controlHTML(p);
  }

  /* ---------- carrito: cambios ---------- */
  function cambiar(id, delta) {
    const p = porId(id);
    if (!p) return;
    const max = Math.min(p.stock, T.MAX_PIEZAS);
    const n = Math.max(0, Math.min(max, (state.cart[id] || 0) + delta));
    if (n) state.cart[id] = n; else delete state.cart[id];
    guardarCarrito();
    refrescarTarjeta(id);
    renderFab(delta > 0);
    if (!$("#cart").hidden) renderCart();
  }

  function renderFab(bump) {
    const fab = $("#cartFab");
    const n = piezas();
    if (!n) { fab.hidden = true; return; }
    const q = cotizacion();
    fab.hidden = false;
    $("#cartCount").textContent = n;
    $("#cartSum").textContent = money(q.total);
    fab.setAttribute("aria-label", `Ver tu pedido: ${n} ${n === 1 ? "pieza" : "piezas"}, ${money(q.total)}`);
    if (bump && !reduced) { fab.classList.remove("bump"); void fab.offsetWidth; fab.classList.add("bump"); }
  }

  /* ---------- carrito: panel ---------- */
  function renderCart() {
    const q = cotizacion();
    const list = $("#cartLines");
    if (!q.lineas.length) {
      list.innerHTML = `<li class="cart-empty">Tu pedido está vacío. Agrega algo de la tienda.</li>`;
      $("#cartForm").hidden = true;
      $("#cartCombo").hidden = true;
      $("#cartTotals").hidden = true;
      return;
    }
    $("#cartForm").hidden = false;
    $("#cartTotals").hidden = false;
    list.innerHTML = q.lineas.map((l) => `
      <li class="cart-line">
        <span class="cart-thumb">${l.p.foto ? `<img src="${esc(l.p.foto)}" alt="">` : `<img src="assets/logo.svg" alt="" class="ph">`}</span>
        <span class="cart-info"><b>${esc(l.p.nombre)}</b>
          <small>${money(l.p.precio)} c/u${l.promo ? ` · <em>${esc(l.promo)}</em>` : ""}</small></span>
        <span class="cart-right">${stepperHTML(l.p, l.cantidad)}
          <strong>${l.total < l.base ? `<s>${money(l.base)}</s>` : ""}${money(l.total)}</strong></span>
      </li>`).join("");
    const combo = hayCombo();
    $("#cartCombo").hidden = !combo;
    if (!combo) state.conCorte = false;
    $("#conCorte").checked = state.conCorte;
    $("#cartSub").textContent = money(q.subtotal);
    $("#cartSaveRow").hidden = !q.ahorro;
    $("#cartSave").textContent = "−" + money(q.ahorro);
    $("#cartTotal").textContent = money(q.total);
  }

  let lastFocus = null;
  function abrirCarrito() {
    lastFocus = document.activeElement;
    $("#cartView").hidden = false;
    $("#cartDone").hidden = true;
    $("#cartErr").textContent = "";
    renderCart();
    $("#cart").hidden = false;
    document.body.style.overflow = "hidden";
    $(".cart-card").focus();
  }
  function cerrarCarrito() {
    if ($("#cart").hidden) return;
    $("#cart").hidden = true;
    document.body.style.overflow = "";
    if (!$("#cartDone").hidden) { $("#cartView").hidden = false; $("#cartDone").hidden = true; }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- mandar pedido ---------- */
  const cleanPhone = (v) => { let d = String(v).replace(/\D/g, ""); if (d.length === 12 && d.startsWith("52")) d = d.slice(2); return d; };

  function validar() {
    let ok = true;
    const name = $("#cName"), phone = $("#cPhone");
    if (name.value.trim().length < 2) { $("#cNameErr").textContent = "Escribe tu nombre para apartar el pedido."; name.setAttribute("aria-invalid", "true"); ok = false; }
    else { $("#cNameErr").textContent = ""; name.removeAttribute("aria-invalid"); }
    if (cleanPhone(phone.value).length !== 10) { $("#cPhoneErr").textContent = "Tu WhatsApp a 10 dígitos, por ejemplo 7861234567."; phone.setAttribute("aria-invalid", "true"); ok = false; }
    else { $("#cPhoneErr").textContent = ""; phone.removeAttribute("aria-invalid"); }
    if (!ok) (name.getAttribute("aria-invalid") ? name : phone).focus();
    return ok;
  }

  async function enviar(e) {
    e.preventDefault();
    if (state.enviando) return;
    $("#cartErr").textContent = "";
    if (!piezas() || !validar()) return;
    const datos = {
      items: cotizacion().items, conCorte: state.conCorte,
      nombre: $("#cName").value.trim(), telefono: cleanPhone($("#cPhone").value), nota: $("#cNote").value.trim(),
    };
    const btn = $("#cartSend");
    state.enviando = true; btn.disabled = true; btn.textContent = "Apartando…";
    try {
      if (state.enLinea === false) { exito(pedidoLocal(datos), true); return; }
      const r = await T.pedir(datos);
      if (!r.ok && C.apiUrl && !state.enLinea && r.error === "datos") { exito(pedidoLocal(datos), true); return; }
      if (!r.ok) {
        if (r.error === "agotado") {
          const nuevos = await T.traer();
          if (nuevos) state.productos = nuevos;
          else (r.agotados || []).forEach((a) => { const p = porId(a.id); if (p) p.stock = a.disponible; });
          ajustarCarrito();
          renderGrid(); renderFab(); renderCart();
          const nombres = (r.agotados || []).map((a) => `${a.nombre || "un producto"} (${a.disponible ? "quedan " + a.disponible : "agotado"})`).join(", ");
          $("#cartErr").textContent = `Se acaba de mover el inventario: ${nombres}. Ya ajustamos tu pedido, revísalo y vuelve a mandarlo.`;
          return;
        }
        throw new Error(r.error);
      }
      exito(r.pedido);
    } catch (err) {
      $("#cartErr").textContent = err.message === "limite"
        ? "Ya mandaste varios pedidos en la última hora. Escríbenos directo por WhatsApp."
        : err.message === "datos" ? "Revisa tu nombre y tu WhatsApp e inténtalo otra vez."
        : "No pudimos apartar tu pedido. Revisa tu conexión e inténtalo otra vez.";
    } finally {
      state.enviando = false; btn.disabled = false; btn.textContent = "Apartar pedido";
    }
  }

  /** Sin tienda en línea: el pedido se arma aquí y solo viaja por WhatsApp (no aparta piezas). */
  function pedidoLocal(datos) {
    const q = T.cotizar(state.productos.map((p) => Object.assign({}, p, { stock: T.MAX_PIEZAS })), datos.items, datos.conCorte);
    return Object.assign({ id: "WEB", lineas: [], total: 0, ahorro: 0 }, q, datos);
  }

  function exito(ped, sinApartar) {
    const barbero = (C.barberos[0] || { nombre: "" }).nombre;
    const msg = (sinApartar ? `Hola ${barbero}, soy ${ped.nombre}. Quiero apartar en ${C.nombre}:\n` : `Hola ${barbero}, soy ${ped.nombre}. Aparté un pedido en ${C.nombre} (${ped.id}):\n`) +
      ped.lineas.map((l) => `• ${l.cantidad}× ${l.nombre}: ${money(l.total)}${l.promo ? " (" + l.promo + ")" : ""}`).join("\n") +
      `\n• Total: ${money(ped.total)}` + (ped.ahorro ? ` (ahorro ${money(ped.ahorro)})` : "") +
      (ped.conCorte ? "\n• Lo recojo cuando vaya a mi corte" : "\n• Paso a recogerlo a la barbería") +
      (ped.nota ? `\n• Nota: ${ped.nota}` : "");
    $("#cartWhats").href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(msg)}`;
    $("#cartDoneTitle").textContent = sinApartar ? "¡Ya casi!" : "¡Pedido apartado!";
    $("#cartDoneText").innerHTML = sinApartar
      ? `Tu pedido por <strong>${money(ped.total)}</strong> está listo para mandarse. Envía el WhatsApp para que ${esc(barbero)} te lo aparte. Pagas al recogerlo.`
      : `Tu pedido <strong>${esc(ped.id)}</strong> por <strong>${money(ped.total)}</strong> ya está apartado. ` +
        `Manda el WhatsApp para que ${esc(barbero)} lo tenga listo${ped.conCorte ? " para tu corte" : ""}. Pagas al recogerlo.`;
    // Las piezas ya se descontaron: el catálogo y el carrito se ponen al día.
    if (!sinApartar) ped.lineas.forEach((l) => { const p = porId(l.id); if (p) p.stock = Math.max(0, p.stock - l.cantidad); });
    state.cart = {}; state.conCorte = false; guardarCarrito();
    $("#cartView").hidden = true;
    $("#cartDone").hidden = false;
    $("#cartWhats").focus();
    renderGrid(); renderFab();
    T.traer().then((nuevos) => { if (nuevos) { state.productos = nuevos; renderCats(); renderGrid(); } });
  }

  /* ---------- eventos ---------- */
  function bind() {
    $("#shopCats").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      state.cat = b.dataset.cat;
      $$("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderGrid();
    });
    const onCtl = (e) => {
      const add = e.target.closest("[data-add]"), mas = e.target.closest("[data-mas]"), menos = e.target.closest("[data-menos]");
      if (add) { cambiar(add.dataset.add, 1); const s = document.querySelector(`.prod[data-id="${CSS.escape(add.dataset.add)}"] [data-mas]`); if (s) s.focus(); }
      else if (mas) cambiar(mas.dataset.mas, 1);
      else if (menos) cambiar(menos.dataset.menos, -1);
    };
    $("#shopGrid").addEventListener("click", onCtl);
    $("#cartLines").addEventListener("click", onCtl);
    $("#cartFab").addEventListener("click", abrirCarrito);
    $("#cartClose").addEventListener("click", cerrarCarrito);
    $("#cartDoneClose").addEventListener("click", cerrarCarrito);
    $("#cartWhats").addEventListener("click", () => setTimeout(cerrarCarrito, 500));
    $("#cart").addEventListener("click", (e) => { if (e.target.id === "cart") cerrarCarrito(); });
    $("#conCorte").addEventListener("change", (e) => { state.conCorte = e.target.checked; renderCart(); renderFab(); });
    $("#cartForm").addEventListener("submit", enviar);
    $("#cPhone").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\d\s+]/g, ""); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarCarrito(); });
  }

  /* ---------- inicio ---------- */
  ajustarCarrito();
  renderCats();
  renderGrid();
  renderFab();
  bind();
  T.traer().then((nuevos) => {
    if (state.enLinea === null) state.enLinea = !!nuevos;
    if (!nuevos) return;
    const antes = JSON.stringify(state.productos);
    state.productos = nuevos;
    ajustarCarrito();
    if (antes !== JSON.stringify(nuevos)) { renderCats(); renderGrid(); }
    renderFab();
  });
})();
