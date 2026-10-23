/* El Rey del Bigote: lógica del sitio y de la reserva */
(function () {
  "use strict";

  const C = window.BARBERIA;
  const N = window.NEGOCIO;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const STORE_KEY = "rdb-citas-demo";
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const state = { barber: null, who: null, style: null, beard: false, date: null, time: null, step: 1 };

  /* ---------- utilidades ---------- */
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const toHHMM = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  const fmt12 = (hhmm) => { let [h, m] = hhmm.split(":").map(Number); const s = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${s}`; };
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const money = (n) => "$" + n.toLocaleString("es-MX");
  const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? " " + (min % 60) + " min" : ""}` : `${min} min`);
  const dayLong = (d) => d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const sameDay = (a, b) => a && b && isoDate(a) === isoDate(b);
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }

  /* ---------- promociones ---------- */
  const promoFor = (date) => N.promo(date);

  const PROMO_ICONS = {
    1: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8h16a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z"/><path d="M24 34v8"/><path d="M12 20l24-6"/></svg>',
    2: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14h20v26a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2Z"/><path d="M32 18h4a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4"/><path d="M12 14c0-4 3-6 6-6 1-2 3-3 5-3s4 1 5 3c3 0 4 2 4 6"/><path d="M18 22v12M26 22v12"/></svg>',
    3: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14h20l-3 28H17Z"/><path d="M26 14l4-10 6 2"/><path d="M15 24h18"/></svg>',
    4: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M36 12 12 36"/><circle cx="15" cy="15" r="5"/><circle cx="33" cy="33" r="5"/></svg>',
    5: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6h20l-2 6 2 6-2 6 2 6-2 6 2 6H14l2-6-2-6 2-6-2-6 2-6Z"/><path d="M20 20h8M20 28h8"/></svg>',
    // Para un día al que el barbero le ponga promo desde el panel y no tenga dibujo propio.
    regalo: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20h32v20a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Z"/><path d="M6 14h36v6H6Z"/><path d="M24 14v28"/><path d="M24 14c-6 0-10-2-10-5s4-3 6-1 4 6 4 6Zm0 0c6 0 10-2 10-5s-4-3-6-1-4 6-4 6Z"/></svg>',
  };

  function renderPromos() {
    const list = $("#promoList");
    const hoy = new Date().getDay();
    list.innerHTML = (C.promociones || []).filter((p) => p.activa !== false).map((p, i) => `
      <li class="promo${p.dia === hoy ? " is-today" : ""}" data-reveal style="--i:${i}">
        <span class="promo-day">${DIAS_CORTO[p.dia]}</span>
        ${p.dia === hoy ? '<span class="promo-tag">Hoy</span>' : ""}
        <span class="promo-icon" aria-hidden="true">${PROMO_ICONS[p.dia] || PROMO_ICONS.regalo}</span>
        <h3 class="promo-title">${esc(p.titulo)}</h3>
        <p class="promo-text"><span class="visually-hidden">${DIAS[p.dia]}: </span>${esc(p.detalle)}</p>
      </li>`).join("");
  }

  /* ---------- cálculo del servicio ---------- */
  function quote() {
    if (!state.who) return null;
    const s = C.servicios[state.who];
    let precio = s.precio, minutos = s.minutos;
    let texto = s.nombre;
    if (state.style) {
      const e = C.estilos[state.style];
      precio += e.extra; minutos += e.minutos;
      texto += `, ${e.nombre.toLowerCase()}`;
    }
    if (state.beard && s.barba) { precio += C.barbaExtra.precio; minutos += C.barbaExtra.minutos; texto += " + barba"; }
    const base = precio;
    const promo = promoFor(state.date);
    const promoTexto = N.textoPromo(state.date);
    precio = N.precioConPromo(base, state.date);
    return { base, precio, minutos, texto, promo, promoTexto };
  }

  /* ---------- citas guardadas (demo) ---------- */
  function readLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch (e) { return []; } }
  function writeLocal(list) { try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* sin almacenamiento */ } }

  const busyCache = new Map();
  async function getBusy(barberId, date) {
    const key = barberId + "|" + isoDate(date);
    if (!C.apiUrl && busyCache.has(key)) return busyCache.get(key); // con la hoja conectada siempre se consulta en vivo
    let busy = [];
    if (C.apiUrl) {
      try {
        const res = await fetch(`${C.apiUrl}?action=ocupados&fecha=${isoDate(date)}&barbero=${encodeURIComponent(barberId)}`);
        const data = await res.json();
        busy = (data.ocupados || []).map((o) => ({ inicio: toMin(o.hora), fin: toMin(o.hora) + Number(o.minutos || C.intervalo) }));
      } catch (e) { console.warn("No se pudo leer la agenda", e); return null; }
    } else {
      const h = C.horario[date.getDay()];
      for (let t = toMin(h.abre); t < toMin(h.cierra); t += C.intervalo) {
        if (hash01(key + toHHMM(t)) < 0.28) busy.push({ inicio: t, fin: t + C.intervalo });
      }
      readLocal().filter((c) => c.barbero === barberId && c.fecha === isoDate(date))
        .forEach((c) => busy.push({ inicio: toMin(c.hora), fin: toMin(c.hora) + c.minutos }));
    }
    busyCache.set(key, busy);
    return busy;
  }

  /* ---------- barberos ---------- */
  const barberById = (id) => C.barberos.find((b) => b.id === id);
  const worksOn = (b, d) => b.dias.includes(d.getDay()) && !!C.horario[d.getDay()];
  const loading = (txt) => `<div class="loader" role="status"><span class="loader-pole" aria-hidden="true"><img src="assets/logo.svg" alt=""></span><span>${txt}</span></div>`;
  const avatar = (b) => `<span class="avatar">${b.foto ? `<img src="${esc(b.foto)}" alt="">` : `<b>${esc(b.nombre[0])}</b>`}</span>`;

  function daysText(dias) {
    if (dias.length === 7) return "Todos los días";
    return [1, 2, 3, 4, 5, 6, 0].filter((d) => dias.includes(d)).map((d) => DIAS[d]).join(", ").replace(/^./, (c) => c.toUpperCase());
  }

  function renderCrew() {
    const list = $("#crew");
    const now = new Date();
    const logo = document.querySelector(".brand img").getAttribute("src");
    list.innerHTML = C.barberos.map((b) => {
      const hoy = worksOn(b, now);
      return `
      <article class="barber">
        <div class="portrait-box" data-reveal>
          <div class="portrait">
            <div class="portrait-in">
              ${b.foto
                ? `<img src="${esc(b.foto)}" alt="Foto de ${esc(b.nombre)}" loading="lazy">`
                : `<div class="portrait-empty"><img src="${esc(logo)}" alt=""><b>${esc(b.nombre)}</b><small>Foto próximamente</small></div>`}
            </div>
          </div>
          <span class="portrait-tag${hoy ? "" : " off"}">${hoy ? "Atiende hoy" : "Descansa hoy"}</span>
        </div>
        <div class="barber-info" data-reveal style="--i:1">
          <h3 class="barber-name">${esc(b.nombre)}</h3>
          <p class="barber-role">${esc(b.rol)}</p>
          ${b.frase ? `<p class="barber-quote">“${esc(b.frase)}”</p>` : ""}
          ${b.bio ? `<p class="barber-bio">${esc(b.bio)}</p>` : ""}
          ${b.favoritos && b.favoritos.length ? `<ul class="barber-tags" aria-label="Lo que más hace">${b.favoritos.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
          <dl class="barber-facts">
            ${b.experiencia ? `<div><dt>Experiencia</dt><dd>${esc(b.experiencia)}</dd></div>` : ""}
            ${b.especialidad ? `<div><dt>Especialidad</dt><dd>${esc(b.especialidad)}</dd></div>` : ""}
            <div><dt>Días</dt><dd>${daysText(b.dias)}</dd></div>
          </dl>
          <div class="barber-actions">
            <a class="btn btn-red" href="#reserva" data-book="${esc(b.id)}">Reservar con ${esc(b.nombre)}</a>
            ${b.instagram ? `<a class="btn btn-line" href="https://instagram.com/${esc(b.instagram)}" target="_blank" rel="noopener">Ver sus cortes</a>` : ""}
          </div>
        </div>
      </article>`;
    }).join("");
    $$("[data-book]", list).forEach((a) => a.addEventListener("click", () => { selectBarber(a.dataset.book); goStep(1, false); }));
  }

  function renderBarberPick() {
    const box = $("#barberPick");
    if (C.barberos.length === 1) {
      const b = C.barberos[0];
      state.barber = b.id;
      box.innerHTML = `<div class="barber-chip solo">${avatar(b)}<span><small>Te atiende</small><strong>${esc(b.nombre)}</strong></span></div>`;
      return;
    }
    box.setAttribute("role", "radiogroup");
    box.setAttribute("aria-label", "Barbero");
    box.innerHTML = C.barberos.map((b) => `
      <button type="button" class="barber-chip" role="radio" aria-checked="false" data-barber="${esc(b.id)}">
        ${avatar(b)}<span><strong>${esc(b.nombre)}</strong><small>${esc(b.rol)}</small></span>
      </button>`).join("");
    $$("[data-barber]", box).forEach((btn) => btn.addEventListener("click", () => selectBarber(btn.dataset.barber)));
  }

  function selectBarber(id) {
    state.barber = id;
    $$("[data-barber]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.barber === id)));
    state.date = null; state.time = null;
    busyCache.clear();
    renderDays();
    onServiceChange();
  }

  /* ---------- paso 1: servicio ---------- */
  function renderWho() {
    $("#who").innerHTML = Object.entries(C.servicios).map(([id, s]) => `
      <button type="button" class="choice" role="radio" aria-checked="false" data-who="${id}">
        <span class="choice-name">${esc(s.corto)}</span>
        <span class="choice-meta">${s.minutos} min</span>
        <span class="choice-price">${money(s.precio)}</span>
      </button>`).join("");
    $$("[data-who]").forEach((b) => b.addEventListener("click", () => selectWho(b.dataset.who)));
  }

  function selectWho(id, style) {
    state.who = id;
    $$("[data-who]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.who === id)));
    const s = C.servicios[id];
    const block = $("#styleBlock");
    if (s.estilos.length) {
      if (style && s.estilos.includes(style)) state.style = style;
      else if (!s.estilos.includes(state.style)) state.style = s.estilos[0];
      $("#styles").innerHTML = s.estilos.map((e) => {
        const st = C.estilos[e];
        return `<button type="button" class="choice" role="radio" aria-checked="${e === state.style}" data-style="${e}">
          <span class="choice-name">${st.nombre}</span>
          <span class="choice-meta">${st.detalle}</span>
          <span class="choice-price">${st.extra ? "+" + money(st.extra) : "Incluido"}</span>
        </button>`;
      }).join("");
      $$("[data-style]").forEach((b) => b.addEventListener("click", () => {
        state.style = b.dataset.style;
        $$("[data-style]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        onServiceChange();
      }));
      block.hidden = false;
    } else { state.style = null; block.hidden = true; }
    $("#beardBlock").hidden = !s.barba;
    if (!s.barba) { state.beard = false; $("#beard").checked = false; }
    onServiceChange();
  }

  function onServiceChange() {
    $("#toStep2").disabled = !(state.barber && state.who);
    state.time = null;
    if (state.date) renderSlots();
    updateTicket(true);
  }

  /* ---------- paso 2: día y hora ---------- */
  function renderDays() {
    const box = $("#days");
    const base = today();
    const b = barberById(state.barber);
    let html = "";
    for (let i = 0; i < C.diasReserva; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const can = b ? worksOn(b, d) : !!C.horario[d.getDay()];
      const promo = promoFor(d);
      const w = i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIAS_CORTO[d.getDay()];
      html += `<button type="button" class="day" role="radio" aria-checked="${sameDay(d, state.date)}" data-date="${isoDate(d)}" ${can ? "" : "disabled"}
        aria-label="${dayLong(d)}${promo ? ", promo: " + esc(promo.titulo) : ""}${can ? "" : ", cerrado"}">
        ${promo ? '<span class="day-gift" aria-hidden="true"></span>' : ""}
        <span class="day-w">${w}</span><span class="day-n">${d.getDate()}</span><span class="day-m">${d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "")}</span>
      </button>`;
    }
    box.innerHTML = html;
    $$(".day", box).forEach((btn) => btn.addEventListener("click", () => {
      const [y, m, dd] = btn.dataset.date.split("-").map(Number);
      state.date = new Date(y, m - 1, dd);
      state.time = null;
      $$(".day", box).forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
      renderPromoHint();
      renderSlots();
      updateTicket(true);
    }));
  }

  function renderPromoHint() {
    const el = $("#promoHint");
    const p = promoFor(state.date);
    if (!p) { el.hidden = true; return; }
    el.innerHTML = `Promo del ${DIAS[p.dia]}: <strong>${esc(p.titulo)}</strong>. ${esc(p.detalle)}`;
    el.hidden = false;
  }

  async function renderSlots() {
    const box = $("#slots");
    $("#toStep3").disabled = true;
    if (!state.date) { box.innerHTML = `<p class="slots-empty">Elige un día para ver los horarios.</p>`; return; }
    const q = quote();
    const dur = q ? q.minutos : C.intervalo;
    const h = C.horario[state.date.getDay()];
    box.innerHTML = loading("Revisando la agenda…");
    const busy = await getBusy(state.barber, state.date);
    if (!busy) { box.innerHTML = `<p class="slots-empty">No pudimos revisar la agenda. Revisa tu conexión y vuelve a elegir el día.</p>`; return; }
    const now = new Date();
    const minNow = sameDay(state.date, now) ? now.getHours() * 60 + now.getMinutes() + 15 : -1;
    let html = "", libres = 0, i = 0;
    for (let t = toMin(h.abre); t + dur <= toMin(h.cierra); t += C.intervalo) {
      if (t < minNow) continue;
      const ok = !busy.some((b) => t < b.fin && t + dur > b.inicio);
      if (ok) libres++;
      const hh = toHHMM(t);
      html += `<button type="button" class="slot" style="--i:${i++}" role="radio" aria-checked="${state.time === hh}" data-time="${hh}" ${ok ? "" : "disabled"} aria-label="${fmt12(hh)}${ok ? "" : ", ocupado"}">${fmt12(hh).replace(" ", " ")}</button>`;
    }
    box.innerHTML = libres ? html : `<p class="slots-empty">Ya no quedan horarios este día. Prueba con otro.</p>`;
    $$(".slot:not([disabled])", box).forEach((btn) => btn.addEventListener("click", () => {
      state.time = btn.dataset.time;
      $$(".slot", box).forEach((x) => x.setAttribute("aria-checked", String(x === btn)));
      $("#toStep3").disabled = false;
      updateTicket();
    }));
  }

  /* ---------- pasos ---------- */
  function goStep(n, scroll = true) {
    state.step = n;
    $$(".panel").forEach((p) => p.classList.toggle("is-active", Number(p.dataset.panel) === n));
    $$(".steps li").forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle("is-active", s === n);
      li.classList.toggle("is-done", s < n);
      if (s === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    if (n === 2) { if (!$("#days").children.length) renderDays(); renderPromoHint(); renderSlots(); }
    if (scroll) {
      const top = $("#reserva").getBoundingClientRect().top;
      if (top < -40 || top > window.innerHeight * 0.5) $("#reserva").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    if (n === 3) setTimeout(() => $("#name").focus({ preventScroll: true }), 350);
  }

  /* ---------- ticket ---------- */
  function setDD(id, text, pending) { const el = $(id); el.textContent = text; el.classList.toggle("pending", !!pending); }
  function updateTicket(bump) {
    const b = barberById(state.barber);
    const q = quote();
    setDD("#tBarber", b ? b.nombre : "Por elegir", !b);
    setDD("#tService", q ? q.texto : "Elige un servicio", !q);
    setDD("#tDay", state.date ? dayLong(state.date) : "Por elegir", !state.date);
    setDD("#tTime", state.time ? fmt12(state.time) : "Por elegir", !state.time);
    setDD("#tDur", q ? fmtDur(q.minutos) : "-", !q);
    const row = $("#tPromoRow");
    if (q && q.promoTexto) { $("#tPromo").textContent = q.promoTexto; row.hidden = false; } else row.hidden = true;
    $("#tTotal").innerHTML = q && q.precio !== q.base ? `<s>${money(q.base)}</s>${money(q.precio)}` : money(q ? q.precio : 0);
    if (bump) { const t = $("#ticket"); t.classList.remove("bump"); void t.offsetWidth; t.classList.add("bump"); }
  }

  /* ---------- paso 3: datos y confirmación ---------- */
  function cleanPhone(v) { let d = v.replace(/\D/g, ""); if (d.length === 12 && d.startsWith("52")) d = d.slice(2); return d; }

  function validate() {
    let ok = true;
    const name = $("#name"), phone = $("#phone");
    if (name.value.trim().length < 2) { $("#nameErr").textContent = "Escribe tu nombre para apartar la cita."; name.setAttribute("aria-invalid", "true"); ok = false; }
    else { $("#nameErr").textContent = ""; name.removeAttribute("aria-invalid"); }
    if (cleanPhone(phone.value).length !== 10) { $("#phoneErr").textContent = "Escribe tu WhatsApp a 10 dígitos, por ejemplo 7861234567."; phone.setAttribute("aria-invalid", "true"); ok = false; }
    else { $("#phoneErr").textContent = ""; phone.removeAttribute("aria-invalid"); }
    if (!ok) (name.getAttribute("aria-invalid") ? name : phone).focus();
    return ok;
  }

  async function submit(e) {
    e.preventDefault();
    $("#formErr").textContent = "";
    if (!state.barber || !state.who || !state.date || !state.time) { goStep(!state.who ? 1 : 2); return; }
    if (!validate()) return;
    const q = quote();
    const b = barberById(state.barber);
    const cita = {
      id: Date.now().toString(36), creada: new Date().toISOString(),
      barbero: b.id, barberoNombre: b.nombre,
      fecha: isoDate(state.date), hora: state.time, minutos: q.minutos,
      servicio: q.texto, precio: q.precio, base: q.base, promo: q.promoTexto || "",
      nombre: $("#name").value.trim(), telefono: cleanPhone($("#phone").value), nota: $("#note").value.trim(),
    };
    const btn = $("#confirm");
    btn.disabled = true; btn.textContent = "Apartando…";
    try {
      if (C.apiUrl) {
        const res = await fetch(C.apiUrl, { method: "POST", body: JSON.stringify({ action: "reservar", cita }) });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "No se pudo guardar");
      } else { const list = readLocal(); list.push(cita); writeLocal(list); }
      busyCache.clear();
      showDone(cita);
    } catch (err) {
      const taken = err.message === "ocupado";
      $("#formErr").textContent = taken ? "Alguien acaba de apartar esa hora. Elige otra, por favor."
        : err.message === "datos" ? "Revisa tu nombre y tu WhatsApp e inténtalo otra vez."
        : "No pudimos apartar tu cita. Revisa tu conexión e inténtalo otra vez.";
      if (taken) { state.time = null; goStep(2); }
    } finally { btn.disabled = false; btn.textContent = "Confirmar cita"; }
  }

  function confetti() {
    if (reduced) return;
    const box = document.createElement("div");
    box.className = "confetti";
    const colors = ["#d7262e", "#f4f2ee", "#2a56c6"];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement("i");
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[i % 3];
      p.style.setProperty("--x", (Math.random() * 30 - 15) + "vw");
      p.style.setProperty("--r", (Math.random() * 900 - 450) + "deg");
      p.style.setProperty("--d", (1.8 + Math.random() * 1.6) + "s");
      p.style.animationDelay = Math.random() * 0.4 + "s";
      p.style.width = (6 + Math.random() * 8) + "px";
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4500);
  }

  let lastFocus = null;
  function showDone(cita) {
    const d = state.date;
    const msg =
      `Hola ${cita.barberoNombre}, soy ${cita.nombre}. Aparté cita en El Rey del Bigote:\n` +
      `• ${cita.servicio}\n• ${dayLong(d)} a las ${fmt12(cita.hora)}\n• Total: ${money(cita.precio)}` +
      (cita.promo ? `\n• Promo: ${cita.promo}` : "") + (cita.nota ? `\n• Nota: ${cita.nota}` : "");
    $("#doneWhats").href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(msg)}`;
    $("#doneText").innerHTML = `Te esperamos el <strong>${esc(dayLong(d))}</strong> a las <strong>${fmt12(cita.hora)}</strong> con <strong>${esc(cita.barberoNombre)}</strong>.` +
      (cita.promo ? ` Ese día te toca <strong>${esc(cita.promo.toLowerCase())}</strong>.` : "") + " Manda la confirmación para que te tenga en su lista.";
    lastFocus = document.activeElement;
    $("#done").hidden = false;
    document.body.style.overflow = "hidden";
    $(".done-card").focus();
    confetti();
  }
  function closeDone() {
    if ($("#done").hidden) return;
    $("#done").hidden = true;
    document.body.style.overflow = "";
    state.time = null; state.date = null; state.beard = false;
    $("#flow").reset();
    $$(".day").forEach((x) => x.setAttribute("aria-checked", "false"));
    goStep(1, false);
    updateTicket();
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- portada, horario y mapa ---------- */
  function renderPrices() {
    const list = $("#priceList");
    if (!list) return;
    let i = 0, html = "";
    Object.keys(C.servicios).forEach((id) => {
      const s = C.servicios[id];
      html += `<div data-reveal style="--i:${i++}"><dt>${esc(s.nombre)}<small>${fmtDur(s.minutos)}</small></dt><dd>${money(s.precio)}</dd></div>`;
    });
    Object.keys(C.estilos).forEach((id) => {
      const e = C.estilos[id];
      if (!e.extra) return;
      html += `<div data-reveal style="--i:${i++}"><dt>${esc(e.nombre)}<small>A cualquier corte</small></dt><dd>+${money(e.extra)}</dd></div>`;
    });
    list.innerHTML = html;

    const adulto = C.servicios.adulto;
    if (adulto && C.barbaExtra) {
      const total = adulto.precio + C.barbaExtra.precio;
      const mins = adulto.minutos + C.barbaExtra.minutos;
      $("#comboPrice").innerHTML = `<span>$</span>${total.toLocaleString("es-MX")}`;
      $("#comboNote").textContent = `El favorito de la casa. ${mins === 60 ? "Una hora" : fmtDur(mins)} en la silla.`;
    }
  }

  function renderStatus() {
    const now = new Date();
    const h = C.horario[now.getDay()];
    const el = $("#status");
    const m = now.getHours() * 60 + now.getMinutes();
    if (h && m >= toMin(h.abre) && m < toMin(h.cierra)) {
      el.className = "status open";
      el.textContent = `Abierto ahora, cierra a las ${fmt12(h.cierra)}`;
      return;
    }
    for (let i = 0; i < 8; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i);
      const hh = C.horario[d.getDay()];
      if (!hh || (i === 0 && m >= toMin(hh.abre))) continue;
      const cuando = i === 0 ? "hoy" : i === 1 ? "mañana" : "el " + DIAS[d.getDay()];
      el.className = "status closed";
      el.textContent = `Cerrado, abrimos ${cuando} a las ${fmt12(hh.abre)}`;
      break;
    }
  }

  function renderVisit() {
    const t = new Date().getDay();
    $("#hours").innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d, i) => {
      const h = C.horario[d];
      return `<li class="${d === t ? "today" : ""}" data-reveal style="--i:${i}"><b>${DIAS_CORTO[d]}${d === t ? " · hoy" : ""}</b><span>${h ? `${fmt12(h.abre)}<br>a ${fmt12(h.cierra)}` : "Cerrado"}</span></li>`;
    }).join("");
    $("#addr").textContent = C.direccion;
    $("#map").src = `https://www.google.com/maps?q=${encodeURIComponent(C.mapaQuery)}&z=15&output=embed`;
    $("#mapsLink").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(C.mapaQuery)}`;
    $("#whatsDirect").href = `https://wa.me/${C.whatsapp}?text=${encodeURIComponent("Hola, quiero información de El Rey del Bigote.")}`;
    $("#year").textContent = new Date().getFullYear();
  }

  /* ---------- aparición al hacer scroll ---------- */
  let io = null;
  function observar(cont) {
    if (!document.documentElement.classList.contains("reveal-on")) return;
    $$("[data-reveal]", cont).forEach((el) => {
      if (!io || el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
      else io.observe(el);
    });
  }

  function setupReveal() {
    $$(".promos .h2, .promos .lead, .prices-feature, .price-list div, .crew .h2, .booking .h2, .booking .lead, .visit .h2").forEach((el, i) => {
      if (!el.hasAttribute("data-reveal")) { el.setAttribute("data-reveal", ""); if (el.matches(".price-list div")) el.style.setProperty("--i", i % 6); }
    });
    if (reduced || !("IntersectionObserver" in window)) return;
    document.documentElement.classList.add("reveal-on");
    io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    $$("[data-reveal]").forEach((el) => {
      // lo que ya está en pantalla al cargar se muestra de inmediato
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
      else io.observe(el);
    });
    // respaldo: si el visor no avisa del scroll, todo se muestra a los pocos segundos
    setTimeout(() => $$("[data-reveal]:not(.in)").forEach((el) => el.classList.add("in")), 3500);
  }

  /* ---------- eventos ---------- */
  function bind() {
    $$("[data-next]").forEach((b) => b.addEventListener("click", () => goStep(Number(b.dataset.next))));
    $$("[data-prev]").forEach((b) => b.addEventListener("click", () => goStep(Number(b.dataset.prev))));
    $("#beard").addEventListener("change", (e) => { state.beard = e.target.checked; onServiceChange(); });
    $("#flow").addEventListener("submit", submit);
    $("#phone").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/[^\d\s+]/g, ""); });
    $("#doneClose").addEventListener("click", closeDone);
    $("#doneWhats").addEventListener("click", () => setTimeout(closeDone, 400));
    $$('[data-quick="combo"]').forEach((a) => a.addEventListener("click", () => {
      selectWho("adulto", "clasico");
      state.beard = true; $("#beard").checked = true; onServiceChange();
      goStep(1, false);
    }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDone(); return; }
      const el = document.activeElement;
      if (!el || el.getAttribute("role") !== "radio" || !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      const group = $$('[role="radio"]:not([disabled])', el.parentElement);
      const next = group[(group.indexOf(el) + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + group.length) % group.length];
      if (next) { e.preventDefault(); next.focus(); next.click(); }
    });
  }

  /* ---------- inicio ---------- */
  /* Pinta de inmediato con js/config.js y lo último que vio este navegador; si el barbero
     cambió algo desde el panel, la API lo corrige en cuanto responde. */
  N.aplicarCache();
  renderStatus();
  renderPromos();
  renderPrices();
  renderVisit();
  renderCrew();
  renderBarberPick();
  renderWho();
  bind();
  updateTicket();

  // Repinta solo si lo que guardó el barbero es distinto de lo que ya estaba en pantalla.
  N.traer().then((cambio) => {
    if (!cambio) return;
    renderStatus();
    renderPromos();
    renderPrices();
    renderVisit();
    renderWho();
    if (state.date) { renderDays(); renderPromoHint(); renderSlots(); }
    updateTicket();
    ["#promoList", "#priceList", "#hours"].forEach((sel) => observar($(sel)));
  });
  setupReveal();
  setInterval(renderStatus, 60000);
})();
