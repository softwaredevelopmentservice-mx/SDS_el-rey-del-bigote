# Pruebas

Corren con Node, sin instalar nada:

```
node pruebas/tienda-backend.test.js   # Code.gs con hojas, Drive y caché simulados
node pruebas/tienda-paridad.test.js   # el sitio y Code.gs cobran igual (5000 pedidos al azar)
```

`simulador-gas.js` imita lo mínimo de Apps Script (SpreadsheetApp, CacheService, PropertiesService,
LockService, ContentService, Utilities y DriveApp) para cargar `apps-script/Code.gs` en Node.
Si Code.gs empieza a usar otro servicio de Google, hay que agregarlo ahí.
