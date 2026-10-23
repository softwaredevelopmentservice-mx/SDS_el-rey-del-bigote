# Conectar las reservas a Google Sheets (10 minutos)

Las citas se guardan en una hoja de Google Sheets que Lando puede ver desde la app de Sheets en su celular.

## 1. Crear la hoja
1. Entra a sheets.google.com con la cuenta donde vivirán las citas (idealmente una cuenta de la barbería).
2. Crea una hoja en blanco y llámala **El Rey del Bigote - Citas**.

## 2. Pegar el código
1. En la hoja: **Extensiones > Apps Script**.
2. Borra lo que trae `Código.gs` y pega todo el contenido de `apps-script/Code.gs`.
3. (Opcional) En **Configuración del proyecto** marca "Mostrar el archivo de manifiesto appsscript.json" y pega el contenido de `apps-script/appsscript.json`. Esto fija la zona horaria a Ciudad de México.
4. Guarda (Ctrl/Cmd + S).

## 3. Preparar la hoja
1. Arriba, en el selector de funciones, elige **configurar** y dale **Ejecutar**.
2. Google pedirá permisos: acepta con la misma cuenta. Si sale "Google no verificó esta app", entra a **Configuración avanzada > Ir a ... (no seguro)**. Es tu propio script.
3. Vuelve a la hoja: ya deben existir las pestañas **Citas**, **Servicios**, **Promos** y **Horario**.
   - **Citas** guarda las reservas. **Servicios**, **Promos** y **Horario** son lo que Lando edita desde el panel; se crean con los valores de arranque y solo se llenan si están vacías, así que ejecutar `configurar()` otra vez nunca pisa lo que él ya guardó.

## 4. Publicar como Web App
1. **Implementar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
4. **Implementar** y copia la URL que termina en `/exec`.

## 5. Conectar el sitio
1. Abre `js/config.js` y pega la URL en `apiUrl`:
   ```js
   apiUrl: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```
2. Sube los cambios a Vercel (`npx vercel --prod`).

Listo: los horarios ocupados salen de la hoja y cada reserva nueva aparece como una fila con estado **Confirmada**.

## Panel del barbero (`/admin`)
1. Si ya tenías el script, pega otra vez TODO el `Code.gs` nuevo y guarda.
2. Ejecuta **configurar** otra vez. Abajo, en **Registro de ejecución**, aparece el **PIN del panel** (6 números). Guárdalo y dáselo a Lando.
   - Para cambiarlo: abre la función `cambiarPin`, escribe el nuevo PIN en `NUEVO_PIN`, guarda y ejecútala.
   - Para verlo después: Configuración del proyecto (engrane) > Propiedades de la secuencia de comandos > `ADMIN_PIN`.
3. **Implementar > Administrar implementaciones > lápiz > Versión: Nueva versión > Implementar.** La URL no cambia.
4. Sube el sitio a Vercel. El panel queda en `tusitio.vercel.app/admin`.
5. Lando entra con su PIN desde el celular. Tip: en el navegador, "Agregar a pantalla de inicio" para tenerlo como app.

Qué puede hacer en el panel:
- Ver las citas de hoy y de los próximos días, con lo que va a cobrar y quién sigue.
- **Recordar**: abre WhatsApp con un recordatorio listo para el cliente.
- **Recorrer**: elige otro día y hora libre. Se actualiza la hoja y el sitio, y luego le avisa al cliente por WhatsApp con un toque. La promoción es la del día nuevo: si mueve una cita del jueves (10%) al lunes, la promo pasa a ser la paleta y el total vuelve a subir. El panel se lo muestra antes de guardar y lo mete en el mensaje de WhatsApp.
- **Cancelar**: libera el horario en el sitio y abre WhatsApp con el aviso para el cliente.
- **Atendida / No vino**: para llevar el control.
- **Tu negocio** (el engrane, arriba a la derecha): cambiar precios y duración de cada corte, los extras (degradado y barba), las promociones de cada día y el horario de apertura. Al guardar, el sitio lo toma en unos minutos.

Seguridad: después de 8 PIN equivocados el panel se bloquea 10 minutos.

## Si ya tenías el script instalado de antes
El código nuevo agrega la columna **Base** en la hoja Citas (el precio sin promoción, necesario para recalcularlo cuando una cita cambia de día) y las tres hojas de configuración.
1. Pega otra vez todo el `Code.gs`.
2. Ejecuta **configurar**. Rellena `Base` en las citas viejas con el precio que ya tenían y crea las hojas que falten.
3. **Implementar > Administrar implementaciones > lápiz > Versión: Nueva versión > Implementar.**

## Uso diario para Lando
- Para ver la agenda del día, filtra la columna **Fecha**.
- Si alguien cancela, cambia su **Estado** a `Cancelada` y ese horario se libera en el sitio.
- Los estados `Atendida` y `No vino` sirven para llevar control.

## Si cambias el código después
**Implementar > Administrar implementaciones > Editar (lápiz) > Versión: Nueva versión > Implementar.**
La URL se queda igual, no hay que tocar el sitio.

## Probar que funciona
Abre en el navegador: `TU_URL/exec?action=ocupados&fecha=2026-10-24&barbero=lando`
Debe responder algo como `{"ok":true,"ocupados":[]}`.

Y para la configuración: `TU_URL/exec?action=config`
Debe responder los precios, promos y horarios. Si cambias algo en el panel y aquí sigue lo viejo, espera 5 minutos: la respuesta se cachea ese rato para no abrir la hoja en cada visita al sitio.
