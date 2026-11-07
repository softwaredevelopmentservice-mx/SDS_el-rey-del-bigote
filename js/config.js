/* ==========================================================
   Configuración de El Rey del Bigote
   Cambia aquí los datos del negocio sin tocar el resto del código.
   ========================================================== */
window.BARBERIA = {
  nombre: "El Rey del Bigote",
  ciudad: "Ciudad Hidalgo, Michoacán",
  direccion: "Av. Morelos Ote. 214, Col. Centro, Ciudad Hidalgo, Mich.", // EJEMPLO: cambiar por la dirección real
  mapaQuery: "Centro, Ciudad Hidalgo, Michoacán",                          // lo que se busca en Google Maps

  // WhatsApp que recibe las confirmaciones, con lada de país (52) y sin espacios.
  // EJEMPLO: número de prueba; cambiar por el de la barbería.
  whatsapp: "527861021588",

  // URL del Web App de Google Apps Script (paso 2 del proyecto).
  // Mientras esté vacío, el sitio funciona en modo demo y guarda las citas en el navegador.
  apiUrl: "https://script.google.com/macros/s/AKfycbw2Lq2Y39nuuI48ZbrVuXqhcUUyUcJDu1SbUJ0hs8tV43uJAbhmW0dFGfV7bbRtDPWVXA/exec",

  // Barberos. Para agregar otro, copia un bloque y cambia los datos.
  // Si hay más de uno, el cliente podrá elegir con quién en la reserva.
  barberos: [
    {
      id: "lando",
      nombre: "Lando",
      rol: "Barbero y dueño",
      // EJEMPLO: retrato ilustrado. Cambiar por foto real cuadrada 1:1 (el marco es redondo).
      foto: "assets/barberos/lando.jpg",
      // Todos estos datos son EJEMPLO: confirmar con Lando.
      frase: "Aquí sales como rey o no sales.",
      experiencia: "8 años en la silla",
      especialidad: "Degradados a navaja y barba perfilada",
      bio: "Empezó cortándole el pelo a sus primos en la cochera y hoy tiene silla propia en el centro de Ciudad Hidalgo. Lo buscan por su degradado limpio, la barba con toalla caliente y la plática mientras esperas.",
      favoritos: ["Degradado bajo", "Barba con navaja", "Corte escolar", "Diseños con rayas"],
      instagram: "", // opcional, ej. "elreydelbigote"
      dias: [0, 1, 2, 3, 4, 5, 6], // días que trabaja (0 = domingo)
    },
  ],

  // Horario (0 = domingo ... 6 = sábado). Formato 24 h.
  horario: {
    0: { abre: "10:00", cierra: "15:00" },
    1: { abre: "10:00", cierra: "20:00" },
    2: { abre: "10:00", cierra: "20:00" },
    3: { abre: "10:00", cierra: "20:00" },
    4: { abre: "10:00", cierra: "20:00" },
    5: { abre: "10:00", cierra: "20:00" },
    6: { abre: "10:00", cierra: "20:00" },
  },

  intervalo: 30,     // cada cuántos minutos se ofrece un horario
  diasReserva: 10,   // cuántos días hacia adelante se puede reservar

  // Servicios base: precio en MXN y duración en minutos.
  servicios: {
    adulto:      { nombre: "Corte de adulto",      corto: "Adulto",      precio: 150, minutos: 40, estilos: ["clasico", "degradado"], barba: true },
    adolescente: { nombre: "Corte de adolescente", corto: "Adolescente", precio: 120, minutos: 30, estilos: ["escolar", "clasico", "degradado"], barba: true },
    nino:        { nombre: "Corte de niño",        corto: "Niño",        precio: 100, minutos: 30, estilos: ["escolar", "clasico", "degradado"], barba: false },
    barba:       { nombre: "Arreglo de barba",     corto: "Solo barba",  precio: 80,  minutos: 20, estilos: [], barba: false },
  },

  estilos: {
    clasico:   { nombre: "Clásico",   detalle: "Tijera y máquina, parejo", extra: 0,  minutos: 0 },
    escolar:   { nombre: "Escolar",   detalle: "Corto y presentable",      extra: 0,  minutos: 0 },
    degradado: { nombre: "Degradado", detalle: "Fade a navaja",            extra: 20, minutos: 5 },
  },

  // Barba agregada a un corte (adulto + barba = $200).
  barbaExtra: { precio: 50, minutos: 20 },

  // Promociones de lunes a viernes: regalos de la tiendita con tu corte (EJEMPLOS: confirmar con Lando).
  // dia: 1 = lunes ... 5 = viernes.
  // regalo: lo que se lleva el cliente. porcentaje: descuento sobre el total (opcional).
  promociones: [
    { dia: 1, titulo: "Paleta de hielo", regalo: "Paleta de hielo de regalo", detalle: "Con cualquier corte o barba, escoges tu paleta del refri." },
    { dia: 2, titulo: "Cerveza bien fría", regalo: "Cerveza de regalo", detalle: "Para mayores de 18. Los menores se llevan un refresco." },
    { dia: 3, titulo: "Refresco o agua", regalo: "Refresco de regalo", detalle: "Te refrescas mientras esperas o al salir de la silla." },
    { dia: 4, titulo: "10% de descuento", porcentaje: 10, detalle: "En cualquier servicio. Si reservas en línea ya te sale descontado." },
    { dia: 5, titulo: "Papitas o dulce", regalo: "Papitas o dulce de regalo", detalle: "Lo que quieras de la tiendita para arrancar el fin de semana." },
  ],

  // Tienda: productos con los que arranca la hoja "Productos" (y el modo demo).
  // Ya conectada la hoja, el barbero los maneja desde el panel y esto solo sirve si no hay internet.
  // Reales (fotos de la barbería): la pomada Rey del Bigote y la Fussion Blue. Sus precios y piezas son EJEMPLO.
  // Cera, aceite, bálsamo y peine son productos de muestra para enseñar cada tipo de promo: quitarlos antes de publicar.
  // Ver js/tienda.js para los tipos de promo.
  productos: [
    { id: "pomada-formal", nombre: "Pomada formal Rey del Bigote", categoria: "Cabello", precio: 180, stock: 12, orden: 1,
      descripcion: "La de la casa. Fijación fuerte y acabado semi mate, hecha en México.",
      foto: "assets/productos-pomada.jpg", promo: { tipo: "combo", valor: 150 } },
    { id: "fussion-blue", nombre: "Pomada Fussion Blue", categoria: "Cabello", precio: 170, stock: 10, orden: 2,
      descripcion: "Base agua, fijación firme extrema. Se lava fácil y no deja el pelo duro. 150 g.",
      foto: "assets/productos-fussion-blue.jpg", promo: { tipo: "" } },
    { id: "cera-mate", nombre: "Cera mate", categoria: "Cabello", precio: 160, stock: 8, orden: 3,
      descripcion: "Textura sin brillo para peinados despeinados que aguantan todo el día.",
      foto: "", promo: { tipo: "porcentaje", valor: 15 } },
    { id: "aceite-barba", nombre: "Aceite para barba", categoria: "Barba", precio: 220, stock: 6, orden: 4,
      descripcion: "Suaviza, quita la comezón y deja la barba con olor a madera.",
      foto: "", promo: { tipo: "oferta", valor: 190 } },
    { id: "balsamo-barba", nombre: "Bálsamo para barba", categoria: "Barba", precio: 200, stock: 0, orden: 5,
      descripcion: "Peina y fija la barba sin dejarla tiesa.", foto: "", promo: { tipo: "" } },
    { id: "peine-madera", nombre: "Peine de madera", categoria: "Accesorios", precio: 90, stock: 15, orden: 6,
      descripcion: "Para barba y bigote. No genera estática.", foto: "", promo: { tipo: "cantidad", lleva: 2, paga: 1 } },
  ],
};
