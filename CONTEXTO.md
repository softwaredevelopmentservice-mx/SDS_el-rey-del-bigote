# El Rey del Bigote: contexto del proyecto

Documento para retomar el proyecto (o dárselo a un asistente de código en VS Code).
Proyecto de **SDS (Software Development Service)**, hecho por Cristian Pérez.
Última actualización: 23 de octubre de 2026.

---

## 1. Qué es

Sitio web de reservas para la barbería **El Rey del Bigote** (Ciudad Hidalgo, Michoacán) y un **panel para el barbero** donde ve y administra sus citas, y donde cambia sus precios, promociones y horarios sin tocar código.

- **Cliente:** Lando, barbero y dueño. Hoy es el único barbero.
- **Objetivo comercial:** primer cliente de un producto que SDS quiere vender a otros negocios (barberías, estéticas, consultorios): sitio + reservas en línea + panel + avisos por WhatsApp.
- **Estado:** demo funcional publicado. Varios datos son **de ejemplo** y hay que confirmarlos con Lando (ver sección 9).

## 2. Repositorio

- GitHub: `softwaredevelopmentservice-mx/SDS_el-rey-del-bigote` (cuenta personal de GitHub, no organización; público).
- Colaboradores con escritura: `ChrisAlchemist`, `cristianperez-ctrl`.
- Push por HTTPS con **token classic** (scope `repo`) de ChrisAlchemist. Los tokens *fine-grained* no funcionan en repos de otra cuenta personal.
- Rama principal: `main`. Los cambios nuevos van en ramas `feature/...`.
- **Los commits los hace Cristian**, no el asistente.

## 3. Stack

- **Frontend:** HTML + CSS + JavaScript puro. Sin frameworks, sin build, sin `npm install`.
- **Backend actual:** Google Apps Script publicado como Web App, guardando en una hoja de Google Sheets.
- **Hosting:** estático. Funciona en Cloudflare Pages o Vercel tal cual (Framework: Other / None, sin build command).
- **WhatsApp:** enlaces `wa.me` con el mensaje prellenado (gratis, el usuario da "Enviar"). Sin API de WhatsApp todavía.

## 4. Estructura de archivos

```
index.html            Sitio público de reservas
admin.html            Panel del barbero (entra con PIN, noindex)
css/styles.css        Estilos y tokens de diseño (compartidos con el panel)
css/admin.css         Estilos solo del panel
js/config.js          DATOS DEL NEGOCIO: valores de arranque, lo único que se edita por cliente
js/negocio.js         Encima la config que el barbero guardó (API) sobre config.js + reglas de promoción
js/app.js             Lógica del sitio y de la reserva
js/admin.js           Lógica del panel
assets/logo.svg       Logo (corona roja + bigote blanco)
assets/barberos/      Retratos (lando.jpg es el de ejemplo, 800x800; lando.svg es una versión dibujada a mano)
apps-script/Code.gs   Backend en Google Apps Script
apps-script/appsscript.json
apps-script/INSTRUCCIONES.md   Cómo instalar el backend paso a paso
vercel.json           { "cleanUrls": true } para que /admin funcione
README.md
CONTEXTO.md           Este archivo
```

Nota: el `.vercelignore` que mencionaban versiones viejas de este documento **no existe**. Si se vuelve a publicar en Vercel, conviene crearlo para excluir `apps-script/` y los `.md`.

## 5. Configuración (`js/config.js`)

Todo lo del negocio **arranca** aquí. Desde que existe la pantalla de ajustes del panel, los precios, duraciones, promociones y horarios se editan desde ahí y viven en Google Sheets: `js/negocio.js` los encima sobre estos valores. Lo de `config.js` queda como valores iniciales y como respaldo si la API no responde.

- `nombre`, `ciudad`, `direccion` (EJEMPLO: "Av. Morelos Ote. 214, Col. Centro"), `mapaQuery`.
- `whatsapp`: `527861021588` (número de Cristian, solo para el demo).
- `apiUrl`: URL `/exec` del Web App de Apps Script. **Vacía = modo demo** (las citas se guardan en `localStorage` y algunos horarios salen ocupados al azar). Hoy está apuntando al Web App real, así que correr en local escribe en la hoja de verdad.
- `barberos[]`: id, nombre, rol, foto, frase, experiencia, especialidad, bio, favoritos, instagram, días que trabaja. Con 2 o más barberos, la reserva deja elegir con quién.
  La `foto` debe ser **cuadrada**: el marco es redondo y recorta las esquinas. Deja aire arriba para que no se coma el sombrero o el pelo. La miniatura de 44px del paso 1 se acerca a la cara con `transform: scale()` en `.avatar img` (`css/styles.css`); si cambias el encuadre de la foto, ajusta ese valor.
- `horario`: por día (0 = domingo). Arranque: L-S 10:00-20:00, D 10:00-15:00.
- `intervalo` (30 min) y `diasReserva` (10). Estos dos **no** se editan desde el panel.
- `servicios`: adulto $150/40 min, adolescente $120/30, niño $100/30, solo barba $80/20.
- `estilos`: clásico, escolar, degradado (+$20, +5 min).
- `barbaExtra`: +$50, +20 min (adulto + barba = $200).
- `promociones` (lunes a viernes, EJEMPLOS): regalos de la tiendita de Lando con el corte. Lunes paleta, martes cerveza (refresco a menores), miércoles refresco, **jueves 10% de descuento** (se aplica al total), viernes papitas o dulce.

## 6. Funcionalidad

### Sitio (`index.html` + `app.js`)
- Portada con el nombre en grande y un poste de barbero animado; indica si está abierto ahora.
- Cinta animada con servicios, promos de la semana (la de hoy resaltada), precios, sección del barbero, horario y mapa.
- **Reserva en 3 pasos:** servicio (para quién, estilo, barba) → día y hora libre → nombre y WhatsApp.
- Los horarios toman en cuenta la duración del servicio y lo ya ocupado.
- Ticket lateral con total, duración y promo del día.
- Al confirmar: confeti y botón que abre WhatsApp al barbero con los datos de la cita.
- Con `apiUrl` configurada, siempre consulta disponibilidad en vivo (sin caché).
- La lista de precios y el combo de portada **se pintan desde la configuración**, no están escritos a mano en el HTML (lo que está en `index.html` es solo el respaldo si falla el JS).
- Al cargar pinta de inmediato con lo que ya conoce y, si la API trae algo distinto, repinta. No se queda esperando a la red.

### Panel (`admin.html` + `admin.js`)
- Entrada con PIN (guardado en sesión del navegador). Modo demo con PIN `1234` y citas de ejemplo cuando `apiUrl` está vacía.
- Agenda de 8 días con contador por día; resumen: número de citas, por cobrar y siguiente cita.
- Por cita: **Recordar** (WhatsApp al cliente), **Recorrer** (elige día y hora libres), **Cancelar**, **Atendida**, **No vino**, **Deshacer/Reactivar**.
- Recorrer y Cancelar guardan primero y luego muestran el botón para avisar al cliente por WhatsApp con mensaje editable.
- **La promo viaja con el día.** Al recorrer una cita, la promoción pasa a ser la del día nuevo (y ninguna en fin de semana). Si eso cambia el total —por ejemplo el 10% del jueves— el panel lo avisa antes de guardar y lo mete en el mensaje al cliente. Por eso cada cita guarda también su precio sin promoción (columna `Base`).
- **Tu negocio** (engrane, arriba a la derecha): precio y minutos de cada corte, los extras (estilos y barba), las promociones de cada día —incluido apagarlas— y el horario de cada día con opción de cerrar. Valida antes de mandar: si algo viene mal no se escribe nada.
- Se actualiza cada minuto y al volver a la pestaña, salvo mientras la pantalla de ajustes está abierta.

## 7. Backend actual (Apps Script + Google Sheets)

### Hoja `Citas`
Todo como texto:
`ID | Creada | Fecha (YYYY-MM-DD) | Hora (HH:MM) | Minutos | Barbero | Servicio | Precio | Promo | Nombre | Telefono | Nota | Estado | Base`

Estados: `Confirmada`, `Atendida`, `No vino`, `Cancelada`. Las canceladas no ocupan horario.

`Precio` es lo que se cobra (ya con promoción) y `Base` el precio sin promoción. Sin esa columna no se puede recalcular cuando una cita cambia de día. Va al final para no recorrer las columnas que ya existían; `configurar()` la rellena en las citas viejas con el precio que tenían.

### Hojas de configuración (lo que edita el barbero)
- `Servicios`: `Tipo (servicio|estilo|extra) | ID | Nombre | Corto | Precio | Minutos`
- `Promos`: `Dia (0 = domingo) | Titulo | Regalo | Porcentaje | Detalle | Activa`
- `Horario`: `Dia | Abre | Cierra | Cerrado`

`configurar()` las siembra con los valores de `js/config.js` y **nunca pisa lo que ya tengan**. Tienen a propósito la misma forma que las tablas `servicios`, `promociones` y `horarios` del plan de TiDB (sección 11), para que migrar sea portar y no rediseñar.

### Contrato de la API (el frontend depende de esto)

Público:
- `GET ?action=ocupados&fecha=YYYY-MM-DD&barbero=lando` → `{ ok, ocupados: [{ hora, minutos }] }`
- `GET ?action=config` → `{ ok, config: { servicios, estilos, barbaExtra, promociones, horario, v } }`
  Solo promociones activas. Se cachea 5 min en el script y otros 5 en el navegador: **un cambio de precio tarda unos minutos en verse en el sitio**.
- `POST { action: "reservar", cita: {...} }` → `{ ok, id }` o `{ ok:false, error: "ocupado" | "datos" }`
  La cita manda también `base` (precio sin promoción).

Panel (siempre POST, con PIN):
- `{ action:"admin", pin, op:"login" }`
- `{ ..., op:"citas", desde, hasta }` → `{ ok, citas:[...] }`
- `{ ..., op:"ocupados", fecha, barbero, excepto }`
- `{ ..., op:"estado", id, estado }` → `{ ok, cita }`
- `{ ..., op:"mover", id, fecha, hora }` → `{ ok, cita }` o `error:"ocupado"`
  Recalcula `Promo` y `Precio` con las reglas del día nuevo, a partir de `Base`.
- `{ ..., op:"config" }` → `{ ok, config }` (incluye las promos apagadas, para poder volver a prenderlas)
- `{ ..., op:"guardarConfig", config }` → `{ ok, config }` o `error:"datos"`

Errores posibles: `pin`, `bloqueado` (8 PIN fallidos = 10 min), `ocupado`, `no-existe`, `datos`.

El contrato completo vive en el encabezado de `apps-script/Code.gs`. Si cambia, hay que actualizarlo ahí, aquí y en el `README.md`.

Detalles:
- El POST se manda como texto plano (sin headers) para evitar el preflight CORS de Apps Script.
- `LockService` evita que dos reservas tomen la misma hora.
- Textos que empiezan con `= + - @` se escapan para evitar fórmulas en la hoja.
- PIN en Propiedades del script (`ADMIN_PIN`); `configurar()` lo genera la primera vez y lo muestra en el registro; `cambiarPin()` lo cambia.
- Las reglas de promoción están escritas dos veces a propósito: en `Code.gs` (fuente de verdad al guardar) y en `js/negocio.js` (para que el panel pueda mostrar el precio nuevo antes de guardar). Si se cambia una, hay que cambiar la otra.

Aprendizajes de la instalación:
- Si la URL del Web App trae `/u/1/` (varias cuentas de Google abiertas), quitarlo. Debe ser `.../macros/s/.../exec`.
- `apiUrl` debe terminar en `/exec`, sin parámetros.
- Cada cambio en `Code.gs` requiere **Implementar > Administrar implementaciones > Editar > Nueva versión** (la URL no cambia).

## 8. Diseño

- Concepto: **poste de barbero**. Rojo `#d7262e`, blanco `#f4f2ee`, azul `#2a56c6` sobre negro `#0e0f12`.
- Regla de color: **rojo = acción principal y marca; azul = selección y estado**.
- Tipografía: **Big Shoulders Display** (títulos, mayúsculas) + **Hanken Grotesk** (texto). Google Fonts.
- Forma: botones y horarios en píldora; paneles con radio de 6px.
- **Foto del barbero: marco redondo** con el poste girando como aro. La píldora de "Atiende hoy" va montada en el borde, fuera del recorte, para que nunca se corte ni parta el texto en dos líneas.
- **Loading con el icono:** aro de franjas girando con el logo latiendo al centro (`.loader` en `styles.css`). Se usa al consultar horarios en el sitio, al cargar la agenda del panel y al recorrer una cita.
- Animaciones: entrada del título por líneas, poste girando, cinta de servicios, aparición al hacer scroll (con respaldo a los 3.5 s para que nunca quede oculto), confeti al confirmar. Todo respeta `prefers-reduced-motion`.
- Mobile first; probado a 390px y 1366px.

## 9. Pendiente de confirmar con Lando

- Número de WhatsApp real, dirección real y ubicación en el mapa.
- Foto real de Lando (**cuadrada 1:1**, porque el marco es redondo) y sus datos: experiencia, especialidad, bio, frase, días.
- Cuenta de Google para la hoja de citas (idealmente una de la barbería, no la personal de Cristian).
- PIN definitivo del panel.
- Horario, precios, duraciones y promociones reales: **ya no hace falta tocar código**, se cargan desde el panel. Lo que está en `config.js` son los valores de arranque.

## 10. Hosting (decisión)

- **Vercel Hobby (gratis) es solo para uso no comercial.** Sitios de clientes que pagan y la landing de SDS cuentan como comerciales. Vercel gratis queda para el portafolio personal y demos.
- **Hoy se publica en Cloudflare Pages** (gratis, 100 proyectos, 500 deploys al mes). El `vercel.json` se queda en el repo por si hace falta volver.
- Ya existe una cuenta de Vercel de SDS y una de Cloudflare.
- Cada push a `main` publica producción; las ramas generan vistas previas.

## 11. Siguiente fase: plataforma SDS multi-cliente (plan aprobado, sin código aún)

Objetivo: dejar de crear una hoja + Apps Script por cliente. Una sola base y una sola API para todos.

```
Sitios de clientes (Cloudflare Pages)
   │  apiUrl = https://sds-api.../n/<slug-del-negocio>
   ▼
API de SDS (Cloudflare Workers, repo SDS_api)
   ▼
MySQL (TiDB Cloud Serverless, compatible con MySQL)
```

- **Base:** `negocios` (slug, nombre, WhatsApp, PIN con hash y salt, activo), `citas` (con `negocio_id`, mismos campos que la hoja, incluido `base`), `intentos_pin`. Índice por `(negocio_id, fecha)`. Después: `servicios`, `promociones`, `horarios`, `empleados` — las tres primeras ya existen como hojas con esa forma.
- **API:** mismo contrato que `Code.gs` (incluidos `config` y `guardarConfig`), con el negocio en la URL (`/n/el-rey-del-bigote`), así el sitio y el panel solo cambian `apiUrl`. Transacciones para evitar choques. Credenciales como *secret* de Cloudflare (`wrangler secret put DATABASE_URL`). Conector: `@tidbcloud/serverless`.
- **Alta de clientes:** script `nuevo-negocio.mjs <slug> "<Nombre>" <WhatsApp>` que genera PIN y el SQL para pegar en TiDB. Más adelante, mini panel de SDS.
- **Plantilla:** este proyecto se vuelve la plantilla base para nuevos clientes.
- **Migración de Lando:** dar de alta `el-rey-del-bigote`, cambiar `apiUrl`, dejar la hoja como respaldo.
- **Orden:** base de datos → API → migrar a Lando → plantilla → mini panel de SDS.
- **Costo:** $0 al arrancar; presupuestar unos dólares al mes cuando haya clientes pagando.

## 12. Ideas a futuro (para vender como extra)

- **Bot de WhatsApp** con la API oficial de WhatsApp Cloud (requiere número dedicado y verificación de Meta; cobra por mensajes que inicia el negocio): reservas por chat y avisos automáticos de cancelación o cambio.
- Recordatorios automáticos el día de la cita.
- Dominio propio por cliente (por ejemplo `elreydelbigote.com`).

## 13. Cómo correrlo en local

```
cd ~/Documents/"Desarollo de software"/Freelance/Web/SDS_el-rey-del-bigote
npx serve .
```
- Sitio: `http://localhost:3000`
- Panel: `http://localhost:3000/admin`
- Para probar sin tocar la hoja real, deja `apiUrl: ""` en `js/config.js` (modo demo). En modo demo la pantalla de ajustes también funciona: guarda en el `localStorage` del navegador.

## 14. Pruebas

No hay suite de pruebas en el repo. Lo que se ha usado para verificar cambios grandes, siempre en archivos temporales fuera del proyecto:

- **Lógica de `Code.gs`**: no se puede ejecutar fuera de Google, pero sí evaluando el archivo en Node con hojas de cálculo falsas (`SpreadsheetApp`, `PropertiesService`, `CacheService` simulados). Sirve para probar el mapeo hoja↔JSON, las validaciones y las reglas de promoción.
- **Sitio y panel completos**: un servidor local en Python que imita el contrato de la API y reescribe `apiUrl` al vuelo, más Chrome headless manejando la interfaz desde una página que mete `index.html` o `admin.html` en un iframe. Ojo: `--virtual-time-budget` de Chrome congela algunos `fetch`; conviene correr en tiempo real y que la página reporte el resultado al servidor.
- Para ver cambios visuales, `rsvg-convert` renderiza los SVG y Chrome headless toma capturas de las páginas.

Si estas pruebas se van a repetir seguido, vale la pena meterlas al repo en una carpeta `pruebas/`.

## 15. Estado del trabajo (23 de octubre de 2026)

Rama `feature/cambios`, salida de `main` en `ef16288`. Cambios hechos y **sin commitear**:

1. Marco redondo para la foto del barbero, con la píldora de estado montada en el borde.
2. Retrato de Lando: ahora es `lando.jpg` (ilustración plana generada, recortada a 800x800 para el marco). El dibujo a mano `lando.svg` se queda en el repo como alternativa.
3. Loading con el logo girando, en el sitio y en el panel.
4. La promoción y el precio se recalculan cuando una cita cambia de día (columna `Base`).
5. Pantalla "Tu negocio" en el panel: precios, duraciones, extras, promociones y horarios.

**Falta un paso manual para que 4 y 5 funcionen en producción:** pegar el `Code.gs` nuevo en Apps Script, ejecutar `configurar()` y crear una versión nueva de la implementación (ver `apps-script/INSTRUCCIONES.md`, sección "Si ya tenías el script instalado de antes"). Mientras no se haga, el sitio y el panel siguen funcionando como antes.
