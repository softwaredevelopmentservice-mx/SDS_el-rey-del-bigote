# El Rey del Bigote — sitio de reservas

Sitio estático (HTML, CSS y JS sin dependencias) para la barbería El Rey del Bigote, Ciudad Hidalgo, Michoacán.
Hecho por SDS (Software Development Service).

## Estructura
```
index.html            Sitio de reservas
admin.html            Panel del barbero (PIN)
css/styles.css        Estilos (paleta, tipografía, responsive)
js/config.js          DATOS DEL NEGOCIO: barberos, precios, horario, WhatsApp, URL de la API
js/negocio.js         Encima lo que el barbero guardó desde el panel + reglas de promoción
js/app.js             Lógica de la reserva
js/admin.js           Lógica del panel
js/tienda.js          Tienda: precios, promos y pedidos (mismas reglas que Code.gs)
js/tienda-ui.js       Tienda en el sitio (catálogo, carrito, pedido por WhatsApp)
js/admin-tienda.js    Tienda en el panel (pedidos y productos)
css/admin.css         Estilos del panel
assets/logo.svg       Logo dorado (corona sobre bigote); assets/icono.svg es el favicon
assets/barberos/      Retratos (lando.jpg es el de ejemplo; lando.svg es una versión dibujada a mano)
apps-script/          Código del backend en Google Sheets e instrucciones
pruebas/              Pruebas del backend en Node (node pruebas/tienda-backend.test.js)
```

## Qué cambia el barbero y qué se cambia en el código
Con la hoja conectada, **precios, duraciones, promociones y horarios se editan desde el panel**
(`/admin` > engrane). Eso manda sobre `js/config.js`, que queda como valores de arranque y
respaldo si la API no responde. El sitio toma los cambios en unos minutos (se cachean 5 min).

**Productos de la tienda** (foto, precio, piezas, promos) y **pedidos** se manejan desde el panel,
en la bolsa. Las fotos se guardan en Drive. Instalación: `apps-script/INSTRUCCIONES.md`, sección "Tienda".

## Cambios comunes (solo en `js/config.js`)
- **Número de WhatsApp**: `whatsapp` (con 52 y sin espacios).
- **Foto de Lando**: pon `lando.jpg` **cuadrada (1:1)** en `assets/barberos/` y cambia `foto`. El marco del sitio es redondo.
- **Agregar barbero**: copia el bloque de Lando dentro de `barberos`. Con 2 o más, la reserva deja elegir barbero.
- **Precios y duración**: `servicios`, `estilos` y `barbaExtra` (o desde el panel).
- **Horario**: `horario` (0 = domingo) (o desde el panel).

## Modo demo vs. Google Sheets
- Con `apiUrl: ""` el sitio funciona en **modo demo**: algunos horarios salen ocupados al azar y las citas se guardan en el navegador.
- Para guardar las citas de verdad: sigue `apps-script/INSTRUCCIONES.md` (Google Sheets + Apps Script) y pega la URL del Web App en `apiUrl`.
  - `GET  ?action=ocupados&fecha=YYYY-MM-DD&barbero=lando` → `{ "ocupados": [{ "hora": "10:30", "minutos": 40 }] }`
  - `GET  ?action=config` → precios, promos y horarios que guardó el barbero
  - `POST { action: "reservar", cita: {...} }` → `{ "ok": true }` o `{ "ok": false, "error": "ocupado" }`
  - El contrato completo, incluidas las operaciones del panel, está en el encabezado de `apps-script/Code.gs`.

## Probar en local
```
npx serve .        # o: python3 -m http.server 8080
```

## Publicar en Vercel
```
npx vercel --prod
```
(o arrastra la carpeta en vercel.com/new). No necesita build.
