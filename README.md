# El Rey del Bigote — sitio de reservas

Sitio estático (HTML, CSS y JS sin dependencias) para la barbería El Rey del Bigote, Ciudad Hidalgo, Michoacán.
Hecho por SDS (Software Development Service).

## Estructura
```
index.html            Sitio de reservas
admin.html            Panel del barbero (PIN)
css/styles.css        Estilos (paleta, tipografía, responsive)
js/config.js          DATOS DEL NEGOCIO: barberos, precios, horario, WhatsApp, URL de la API
js/app.js             Lógica de la reserva
js/admin.js           Lógica del panel
css/admin.css         Estilos del panel
assets/logo.svg       Logo (corona sobre bigote)
assets/barberos/      Fotos de los barberos (lando.svg es un retrato ilustrado de ejemplo)
apps-script/          Código del backend en Google Sheets e instrucciones
```

## Cambios comunes (solo en `js/config.js`)
- **Número de WhatsApp**: `whatsapp` (con 52 y sin espacios).
- **Foto de Lando**: pon `lando.jpg` (cuadrada o vertical) en `assets/barberos/` y cambia `foto`.
- **Agregar barbero**: copia el bloque de Lando dentro de `barberos`. Con 2 o más, la reserva deja elegir barbero.
- **Precios y duración**: `servicios`, `estilos` y `barbaExtra`.
- **Horario**: `horario` (0 = domingo).

## Modo demo vs. Google Sheets
- Con `apiUrl: ""` el sitio funciona en **modo demo**: algunos horarios salen ocupados al azar y las citas se guardan en el navegador.
- Para guardar las citas de verdad: sigue `apps-script/INSTRUCCIONES.md` (Google Sheets + Apps Script) y pega la URL del Web App en `apiUrl`.
  - `GET  ?action=ocupados&fecha=YYYY-MM-DD&barbero=lando` → `{ "ocupados": [{ "hora": "10:30", "minutos": 40 }] }`
  - `POST { action: "reservar", cita: {...} }` → `{ "ok": true }` o `{ "ok": false, "error": "ocupado" }`

## Probar en local
```
npx serve .        # o: python3 -m http.server 8080
```

## Publicar en Vercel
```
npx vercel --prod
```
(o arrastra la carpeta en vercel.com/new). No necesita build.
