/* El Rey del Bigote: panel del barbero */
(function () {
  "use strict";

  const C = window.BARBERIA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const DEMO = !C.apiUrl;
  const DEMO_PIN = "1234";
  const DEMO_KEY = "rdb-admin-demo";
  const SESSION_KEY = "rdb-admin-pin";
  const VER_DIAS = 8;

  const state = { pin: "", citas: [], dia: null, showCancel: false, sheet: null, loading: false };

  /* ---------- utilidades ---------- */
  const toMin = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
  const toHHMM = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const fmt12 = (h) => { let [a, b] = h.split(":").map(Number); const s = a >= 12 ? "pm" : "am"; a = a % 12 || 12; return `${a}:${String(b).padStart(2, "0")} ${s}`; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const dayLong = (s) => fromIso(s).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const money = (n) => "$" + Number(n || 0).toLocaleString("es-MX");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
  const barberName = (id) => (C.barberos.find((b) => b.id === id) || C.barberos[0] || { nombre: "" }).nombre;
  const waLink = (tel, text) => `https://wa.me/52${String(tel).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(text)}`;
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } },
  };

  /* ---------- modo demo: citas de ejemplo guardadas en este navegador ---------- */
  let demoMem = null;
  function demoLoad() {
    if (demoMem) return demoMem;
    try { demoMem = JSON.parse(localStorage.getItem(DEMO_KEY) || "null"); } catch (e) { demoMem = null; }
    if (!demoMem) demoMem = demoSeed();
    return demoMem;
  }
  function demoSave() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demoMem)); } catch (e) { /* en memoria */ } }
  function demoSeed() {
    const t = today();
    const b = (C.barberos[0] || { id: "lando" }).id;
    const rows = [
      [0, "10:00", 45, "Corte de adulto, degradado", 170, "Mateo Ramírez", "7865550101", "", "Atendida"],
      [0, "11:30", 60, "Corte de adulto, clásico + barba", 200, "Jesús Méndez", "7865550102", "Barba con toalla caliente", "Confirmada"],
      [0, "13:00", 30, "Corte de niño, escolar", 100, "Santiago Torres", "7865550103", "Viene con su mamá", "Confirmada"],
      [0, "17:30", 45, "Corte de adolescente, degradado", 140, "Kevin Álvarez", "7865550104", "", "Confirmada"],
      [1, "10:30", 40, "Corte de adulto, clásico", 150, "Iván Correa", "7865550105", "", "Confirmada"],
      [1, "16:00", 20, "Arreglo de barba", 80, "Rogelio Pineda", "7865550106", "", "Confirmada"],
      [2, "12:00", 60, "Corte de adulto, clásico + barba", 200, "Emiliano Cruz", "7865550107", "Trae foto del corte", "Confirmada"],
      [3, "11:00", 30, "Corte de niño, escolar", 100, "Leo Vargas", "7865550108", "", "Confirmada"],
    ];
    return rows.map((r, i) => {
      const fecha = iso(addDays(t, r[0]));
      const promo = (C.promociones || []).find((p) => p.dia === fromIso(fecha).getDay());
      const precio = promo && promo.porcentaje ? Math.round(r[4] * (1 - promo.porcentaje / 100)) : r[4];
      return {
        id: "demo" + i, creada: "", fecha, hora: r[1], minutos: r[2], barbero: b, servicio: r[3], precio,
        promo: promo ? (promo.regalo || `${promo.porcentaje}% de descuento`) : "", nombre: r[5], telefono: r[6], nota: r[7], estado: r[8],
      };
    });
  }

  function demoApi(op, p) {
    const list = demoLoad();
    if (p.pin !== DEMO_PIN) return { ok: false, error: "pin" };
    const find = (id) => list.find((c) => c.id === id);
    const busy = (fecha, barbero, excepto) => list.filter((c) => c.fecha === fecha && c.barbero === barbero && c.estado !== "Cancelada" && c.id !== excepto)
      .map((c) => ({ hora: c.hora, minutos: c.minutos }));
    switch (op) {
      case "login": return { ok: true };
      case "citas": return { ok: true, citas: list.filter((c) => c.fecha >= p.desde && c.fecha <= p.hasta).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)) };
      case "ocupados": return { ok: true, ocupados: busy(p.fecha, p.barbero, p.excepto) };
      case "estado": { const c = find(p.id); if (!c) return { ok: false, error: "no-existe" }; c.estado = p.estado; demoSave(); return { ok: true, cita: c }; }
      case "mover": {
        const c = find(p.id); if (!c) return { ok: false, error: "no-existe" };
        const ini = toMin(p.hora), fin = ini + c.minutos;
        if (busy(p.fecha, c.barbero, c.id).some((o) => ini < toMin(o.hora) + o.minutos && fin > toMin(o.hora))) return { ok: false, error: "ocupado" };
        c.nota = `Movida desde ${c.fecha} ${c.hora}` + (c.nota ? `. ${c.nota}` : "");
        c.fecha = p.fecha; c.hora = p.hora; c.estado = "Confirmada"; demoSave();
        return { ok: true, cita: c };
      }
      default: return { ok: false, error: "datos" };
    }
  }

  /* ---------- API ---------- */
  async function api(op, payload = {}) {
    const body = Object.assign({ action: "admin", pin: state.pin, op }, payload);
    if (DEMO) { await new Promise((r) => setTimeout(r, 250)); return demoApi(op, JSON.parse(JSON.stringify(body))); }
    const res = await fetch(C.apiUrl, { method: "POST", body: JSON.stringify(body) });
    return res.json();
  }

  const ERRORES = {
    pin: "Ese PIN no es correcto.",
    bloqueado: "Demasiados intentos. Espera 10 minutos y vuelve a probar.",
    ocupado: "Ese horario ya está ocupado. Elige otro.",
    "no-existe": "Esa cita ya no existe en la hoja. Actualiza la lista.",
    datos: "Faltan datos para hacer el cambio.",
  };
  const errText = (e) => ERRORES[e] || "No se pudo conectar con la hoja. Revisa tu internet e inténtalo otra vez.";

  /* ---------- entrada ---------- */
  async function login(pin, silent) {
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Entrando…";
    $("#pinErr").textContent = "";
    state.pin = pin;
    try {
      const r = await api("login");
      if (!r.ok) throw new Error(r.error);
      store.set(SESSION_KEY, pin);
      showApp();
    } catch (e) {
      state.pin = "";
      store.del(SESSION_KEY);
      if (!silent) {
        $("#pinErr").textContent = errText(e.message);
        const card = $(".login-card"); card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
        $("#pin").select();
      }
    } finally {
      btn.disabled = false; btn.textContent = "Entrar";
    }
  }

  function showApp() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    const b = C.barberos[0];
    $("#hello").textContent = `Hola, ${b ? b.nombre : "barbero"}`;
    const hoy = dayLong(iso(today()));
    $("#today").textContent = hoy.charAt(0).toUpperCase() + hoy.slice(1);
    if (!state.dia) state.dia = iso(today());
    load();
  }

  function logout() {
    store.del(SESSION_KEY);
    state.pin = ""; state.citas = [];
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#pin").value = "";
    $("#pin").focus();
  }

  /* ---------- carga ---------- */
  async function load(quiet) {
    if (state.loading) return;
    state.loading = true;
    const btn = $("#refresh");
    btn.classList.remove("spin"); void btn.offsetWidth; btn.classList.add("spin");
    if (!quiet && !state.citas.length) $("#citas").innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
    try {
      const desde = iso(addDays(today(), -1));
      const hasta = iso(addDays(today(), VER_DIAS + 14));
      const r = await api("citas", { desde, hasta });
      if (!r.ok) {
        if (r.error === "pin" || r.error === "bloqueado") { logout(); $("#pinErr").textContent = errText(r.error); return; }
        throw new Error(r.error);
      }
      state.citas = r.citas;
      const h = new Date();
      $("#sync").textContent = (DEMO ? "Modo demo con citas de ejemplo. " : "") + `Actualizado a las ${fmt12(toHHMM(h.getHours() * 60 + h.getMinutes()))}`;
      render();
    } catch (e) {
      $("#sync").textContent = errText(e.message);
      if (!state.citas.length) $("#citas").innerHTML = `<li class="empty"><b>Sin conexión</b>${esc(errText(e.message))}</li>`;
    } finally {
      state.loading = false;
    }
  }

  /* ---------- pintar ---------- */
  const activa = (c) => c.estado !== "Cancelada";

  function renderDays() {
    const box = $("#days");
    const t = today();
    let html = "";
    for (let i = 0; i < VER_DIAS; i++) {
      const d = addDays(t, i), k = iso(d);
      const n = state.citas.filter((c) => c.fecha === k && activa(c)).length;
      const abierto = !!C.horario[d.getDay()];
      html += `<button type="button" class="day" role="radio" aria-checked="${k === state.dia}" data-day="${k}" aria-label="${dayLong(k)}, ${n} citas${abierto ? "" : ", cerrado"}">
        ${n ? `<span class="day-count" aria-hidden="true">${n}</span>` : ""}
        <span class="day-w">${i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIAS_CORTO[d.getDay()]}</span><span class="day-n">${d.getDate()}</span><span class="day-m">${d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "")}</span>
      </button>`;
    }
    box.innerHTML = html;
    $$(".day", box).forEach((b) => b.addEventListener("click", () => { state.dia = b.dataset.day; render(); }));
  }

  function nextCita(list) {
    const now = new Date();
    const isToday = state.dia === iso(today());
    const minNow = now.getHours() * 60 + now.getMinutes();
    return list.find((c) => c.estado === "Confirmada" && (!isToday || toMin(c.hora) + c.minutos > minNow));
  }

  function render() {
    renderDays();
    const delDia = state.citas.filter((c) => c.fecha === state.dia);
    const activas = delDia.filter(activa);
    const orden = (x, y) => (x.estado === "Cancelada") - (y.estado === "Cancelada") || x.hora.localeCompare(y.hora);
    const visibles = (state.showCancel ? delDia : activas).slice().sort(orden);
    const sig = nextCita(activas.slice().sort((x, y) => x.hora.localeCompare(y.hora)));
    const isToday = state.dia === iso(today());

    $("#sCount").textContent = activas.length;
    $("#sMoney").textContent = money(activas.filter((c) => c.estado !== "No vino").reduce((s, c) => s + Number(c.precio || 0), 0));
    $("#sNext").textContent = sig ? `${fmt12(sig.hora)} ${firstName(sig.nombre)}` : "-";
    $("#sNextL").textContent = isToday ? "siguiente" : "primera cita";
    $("#listTitle").textContent = isToday ? "Citas de hoy" : `Citas del ${dayLong(state.dia)}`;

    const list = $("#citas");
    if (!visibles.length) {
      const cerrado = !C.horario[fromIso(state.dia).getDay()];
      list.innerHTML = `<li class="empty"><b>${cerrado ? "Día de descanso" : "Sin citas"}</b>${cerrado ? "Este día la barbería está cerrada." : "Cuando alguien reserve en el sitio, aparece aquí solo."}</li>`;
      return;
    }
    list.innerHTML = visibles.map((c, i) => citaHTML(c, i, sig && sig.id === c.id)).join("");
  }

  function citaHTML(c, i, isNext) {
    const cls = ["cita", isNext ? "is-next" : "", c.estado === "Cancelada" ? "is-cancel" : "", (c.estado === "Atendida" || c.estado === "No vino") ? "is-done" : ""].join(" ");
    const pendiente = c.estado === "Confirmada";
    const recordatorio = !pendiente ? `Hola ${firstName(c.nombre)}, te escribe ${barberName(c.barbero)} de ${C.nombre}.` : `Hola ${firstName(c.nombre)}, te escribe ${barberName(c.barbero)} de ${C.nombre}. Te recuerdo tu cita el ${dayLong(c.fecha)} a las ${fmt12(c.hora)}. ¡Te espero!`;
    return `<li class="${cls}" data-id="${esc(c.id)}" style="--i:${i}">
      <div class="cita-time"><b>${fmt12(c.hora).split(" ")[0]}</b><span>${fmt12(c.hora).split(" ")[1]}</span><span>${c.minutos} min</span></div>
      <div class="cita-body">
        <div class="cita-top">
          <p class="cita-name">${esc(c.nombre)}</p>
          <span class="estado estado-${esc(c.estado.replace(/\s+/g, "-"))}">${esc(c.estado)}</span>
        </div>
        <p class="cita-service">${esc(c.servicio)}</p>
        <div class="cita-meta">
          <span class="pill pill-money">${money(c.precio)}</span>
          ${c.promo ? `<span class="pill pill-promo">${esc(c.promo)}</span>` : ""}
          ${c.nota ? `<span class="pill pill-note">${esc(c.nota)}</span>` : ""}
        </div>
      </div>
      <div class="cita-actions">
          <a class="btn btn-whats" href="${waLink(c.telefono, recordatorio)}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(c.nombre)}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z"/></svg>
            ${pendiente ? "Recordar" : "WhatsApp"}
          </a>
          ${c.estado !== "Cancelada" ? `<button type="button" class="btn btn-line" data-act="mover">Recorrer</button>` : ""}
          ${pendiente ? `<button type="button" class="btn btn-line" data-act="Atendida">Atendida</button><button type="button" class="btn btn-line" data-act="No vino">No vino</button>` : ""}
          ${c.estado === "Atendida" || c.estado === "No vino" ? `<button type="button" class="btn btn-line" data-act="Confirmada">Deshacer</button>` : ""}
          ${c.estado !== "Cancelada" ? `<button type="button" class="btn btn-line" data-act="cancelar">Cancelar</button>` : `<button type="button" class="btn btn-line" data-act="Confirmada">Reactivar</button>`}
      </div>
    </li>`;
  }

  /* ---------- acciones rápidas ---------- */
  async function setEstado(id, estado) {
    const c = state.citas.find((x) => x.id === id);
    if (!c) return;
    if (estado === "Confirmada" && c.estado === "Cancelada") {
      // al reactivar, revisar que el horario siga libre
      const r = await api("ocupados", { fecha: c.fecha, barbero: c.barbero, excepto: c.id });
      if (r.ok && r.ocupados.some((o) => toMin(c.hora) < toMin(o.hora) + o.minutos && toMin(c.hora) + c.minutos > toMin(o.hora))) { toast("Ese horario ya lo ocupó otra cita. Usa Recorrer.", true); return; }
    }
    const prev = c.estado;
    c.estado = estado; render(); flash(id);
    try {
      const r = await api("estado", { id, estado });
      if (!r.ok) throw new Error(r.error);
      Object.assign(c, r.cita);
      toast(estado === "Atendida" ? `${firstName(c.nombre)} quedó como atendido` : estado === "No vino" ? `${firstName(c.nombre)} quedó como "No vino"` : "Cita reactivada");
    } catch (e) {
      c.estado = prev; render();
      toast(errText(e.message), true);
    }
  }

  function flash(id) {
    const el = document.querySelector(`.cita[data-id="${CSS.escape(id)}"]`);
    if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }

  let toastTimer = null;
  function toast(text, isErr) {
    const t = $("#toast");
    t.textContent = text; t.classList.toggle("err", !!isErr); t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  /* ---------- hoja: cancelar y recorrer ---------- */
  let lastFocus = null;
  function openSheet(kind, c) {
    state.sheet = { kind, cita: c, fecha: c.fecha, hora: null };
    lastFocus = document.activeElement;
    $("#sheetErr").textContent = "";
    $("#sheetDone").hidden = true;
    $("#sheetFoot").hidden = false;
    $("#msgBox").hidden = false;
    $("#msg").readOnly = false;
    $("#sheetWho").textContent = `${c.nombre}, ${c.servicio}. ${dayLong(c.fecha)} a las ${fmt12(c.hora)}.`;
    if (kind === "cancelar") {
      $("#sheetTitle").textContent = `¿Cancelar la cita de ${firstName(c.nombre)}?`;
      $("#moveBox").hidden = true;
      $("#sheetYes").textContent = "Sí, cancelar";
      $("#sheetYes").disabled = false;
      $("#msg").value = `Hola ${firstName(c.nombre)}, te escribe ${barberName(c.barbero)} de ${C.nombre}. Tuve que cancelar tu cita del ${dayLong(c.fecha)} a las ${fmt12(c.hora)}. Perdón por el cambio. Si quieres, te aparto otro horario.`;
    } else {
      $("#sheetTitle").textContent = `Recorrer a ${firstName(c.nombre)}`;
      $("#moveBox").hidden = false;
      $("#sheetYes").textContent = "Mover cita";
      $("#sheetYes").disabled = true;
      renderMoveDays();
      renderMoveSlots();
      updateMoveMsg();
    }
    $("#sheet").hidden = false;
    document.body.style.overflow = "hidden";
    $(".sheet-card").focus();
  }

  function closeSheet() {
    if ($("#sheet").hidden) return;
    $("#sheet").hidden = true;
    document.body.style.overflow = "";
    state.sheet = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  function renderMoveDays() {
    const s = state.sheet;
    const t = today();
    let html = "";
    for (let i = 0; i < (C.diasReserva || 10); i++) {
      const d = addDays(t, i), k = iso(d);
      const ok = !!C.horario[d.getDay()];
      html += `<button type="button" class="day" role="radio" aria-checked="${k === s.fecha}" data-mday="${k}" ${ok ? "" : "disabled"}>
        <span class="day-w">${i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIAS_CORTO[d.getDay()]}</span><span class="day-n">${d.getDate()}</span><span class="day-m">${d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "")}</span>
      </button>`;
    }
    $("#moveDays").innerHTML = html;
    $$("[data-mday]").forEach((b) => b.addEventListener("click", () => {
      s.fecha = b.dataset.mday; s.hora = null;
      $$("[data-mday]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      $("#sheetYes").disabled = true;
      renderMoveSlots(); updateMoveMsg();
    }));
  }

  async function renderMoveSlots() {
    const s = state.sheet, c = s.cita;
    const box = $("#moveSlots");
    const h = C.horario[fromIso(s.fecha).getDay()];
    if (!h) { box.innerHTML = '<p class="slots-empty">Ese día está cerrado.</p>'; return; }
    box.innerHTML = '<p class="slots-empty">Revisando la agenda…</p>';
    const fecha = s.fecha;
    let r;
    try { r = await api("ocupados", { fecha, barbero: c.barbero, excepto: c.id }); } catch (e) { r = { ok: false }; }
    if (!state.sheet || state.sheet.fecha !== fecha) return; // cambió de día mientras cargaba
    if (!r.ok) { box.innerHTML = `<p class="slots-empty">${esc(errText(r.error))}</p>`; return; }
    const now = new Date();
    const minNow = fecha === iso(today()) ? now.getHours() * 60 + now.getMinutes() : -1;
    let html = "", i = 0, libres = 0;
    for (let t = toMin(h.abre); t + c.minutos <= toMin(h.cierra); t += C.intervalo || 30) {
      if (t < minNow) continue;
      const hh = toHHMM(t);
      const actual = fecha === c.fecha && hh === c.hora;
      const ok = !actual && !r.ocupados.some((o) => t < toMin(o.hora) + o.minutos && t + c.minutos > toMin(o.hora));
      if (ok) libres++;
      html += `<button type="button" class="slot" style="--i:${i++}" role="radio" aria-checked="false" data-mhora="${hh}" ${ok ? "" : "disabled"} aria-label="${fmt12(hh)}${actual ? ", hora actual" : ok ? "" : ", ocupado"}">${fmt12(hh).replace(" ", " ")}</button>`;
    }
    box.innerHTML = libres ? html : '<p class="slots-empty">No quedan horarios libres ese día.</p>';
    $$("[data-mhora]", box).forEach((b) => b.addEventListener("click", () => {
      s.hora = b.dataset.mhora;
      $$("[data-mhora]", box).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      $("#sheetYes").disabled = false;
      updateMoveMsg();
    }));
  }

  function updateMoveMsg() {
    const s = state.sheet, c = s.cita;
    const cuando = s.hora ? `al ${dayLong(s.fecha)} a las ${fmt12(s.hora)}` : "al [elige día y hora]";
    $("#msg").value = `Hola ${firstName(c.nombre)}, te escribe ${barberName(c.barbero)} de ${C.nombre}. Tuve que recorrer tu cita del ${dayLong(c.fecha)} a las ${fmt12(c.hora)} ${cuando}. Si no te queda, contéstame y lo arreglamos.`;
  }

  async function confirmSheet() {
    const s = state.sheet;
    if (!s) return;
    const c = s.cita;
    const btn = $("#sheetYes");
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Guardando…";
    $("#sheetErr").textContent = "";
    try {
      const r = s.kind === "cancelar"
        ? await api("estado", { id: c.id, estado: "Cancelada" })
        : await api("mover", { id: c.id, fecha: s.fecha, hora: s.hora });
      if (!r.ok) throw new Error(r.error);
      const local = state.citas.find((x) => x.id === c.id);
      if (local) Object.assign(local, r.cita);
      if (s.kind === "mover") state.dia = s.fecha;
      render();
      flash(c.id);
      // paso 2: avisar al cliente con un toque
      $("#sheetFoot").hidden = true;
      $("#moveBox").hidden = true;
      $("#msg").readOnly = true;
      $("#doneMsg").textContent = s.kind === "cancelar"
        ? "Cita cancelada. El horario ya quedó libre en el sitio."
        : `Cita movida al ${dayLong(s.fecha)} a las ${fmt12(s.hora)}.`;
      $("#sheetWhats").href = waLink(c.telefono, $("#msg").value);
      $("#sheetWhatsL").textContent = `Avisar a ${firstName(c.nombre)} por WhatsApp`;
      $("#sheetDone").hidden = false;
      $("#sheetWhats").focus();
    } catch (e) {
      $("#sheetErr").textContent = errText(e.message);
      if (e.message === "ocupado" && s.kind === "mover") { s.hora = null; renderMoveSlots(); }
      btn.disabled = false;
    } finally {
      btn.textContent = label;
      if (!$("#sheetFoot").hidden && s.kind === "mover" && !s.hora) btn.disabled = true;
    }
  }

  /* ---------- eventos ---------- */
  function bind() {
    $("#loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const pin = $("#pin").value.trim();
      if (!/^\d{4,8}$/.test(pin)) { $("#pinErr").textContent = "El PIN son de 4 a 8 números."; return; }
      login(pin);
    });
    $("#pin").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); });
    $("#logout").addEventListener("click", logout);
    $("#refresh").addEventListener("click", () => load(true));
    $("#showCancel").addEventListener("change", (e) => { state.showCancel = e.target.checked; render(); });
    $("#citas").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.closest(".cita").dataset.id;
      const c = state.citas.find((x) => x.id === id);
      if (!c) return;
      const act = btn.dataset.act;
      if (act === "cancelar") openSheet("cancelar", c);
      else if (act === "mover") openSheet("mover", c);
      else setEstado(id, act);
    });
    $("#sheetYes").addEventListener("click", confirmSheet);
    $("#sheetNo").addEventListener("click", closeSheet);
    $("#sheetClose").addEventListener("click", closeSheet);
    $("#sheetDoneClose").addEventListener("click", closeSheet);
    $("#sheetWhats").addEventListener("click", () => setTimeout(closeSheet, 500));
    $("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
    $("#msg").addEventListener("focus", () => { $("#msg").readOnly = false; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    // actualizar solo cada minuto si la pestaña está visible y no hay nada abierto
    setInterval(() => { if (state.pin && document.visibilityState === "visible" && !state.sheet) load(true); }, 60000);
    document.addEventListener("visibilitychange", () => { if (state.pin && document.visibilityState === "visible" && !state.sheet) load(true); });
  }

  /* ---------- inicio ---------- */
  bind();
  if (DEMO) $("#demoHint").hidden = false;
  const saved = store.get(SESSION_KEY);
  if (saved) login(saved, true);
  else $("#pin").focus();
})();
