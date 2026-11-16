# Jaboque en datos

**Web publicada:** https://jaboque-en-datos.vercel.app

Proyecto final del curso *Contexto: Ciencia, Tecnología y Sociedad*. Muestra la contaminación del Humedal Jaboque y del río Bogotá con datos abiertos, más una maqueta a escala con sensores en tiempo real que avisa por Telegram cuando el lago llega a un nivel crítico de contaminación.

| Carpeta | Qué es | Dónde corre |
|---|---|---|
| `web/` | La página (Next.js). Lee datos de datos.gov.co y datosabiertos.bogota.gov.co | Vercel (pública) |
| `iot-server/` | Recibe las lecturas del ESP32, las retransmite a la página y manda las alertas a Telegram | El portátil, en la red local |
| `maqueta/` | Guía de construcción, materiales, conexiones y firmware del ESP32 | Arduino IDE |

## Levantar todo con un comando

Desde la carpeta raíz del proyecto:

```bash
npm run demo    # servidor con lecturas simuladas + web (sin maqueta); las alertas se disparan con los botones
npm start       # servidor esperando al ESP32 + web (con la maqueta real)
```

Arranca el servidor de la maqueta (puerto 4000) y la web (http://localhost:3000), y abre el navegador en la pantalla "Maqueta en vivo". La primera vez instala las dependencias de la web. **Ctrl+C apaga todo.** Si uno de los dos se cae, el otro también se apaga, para que no quede nada a medias.

En modo demo, la pantalla "Maqueta en vivo" debe decir *Servidor conectado con lecturas simuladas*. Si apagas el servidor, la web pasa sola al modo demostración del navegador.

## Con la maqueta real

1. `npm start`. Anota la IP que aparece en la línea "ESP32 (misma WiFi)".
2. Pon esa IP en el firmware (`maqueta/firmware/maqueta_jaboque/maqueta_jaboque.ino`) y súbelo al ESP32.
3. Conecta el ESP32: empieza a enviar lecturas solo, y la web dice *Maqueta conectada*.

Para las alertas de Telegram, sigue los pasos de `maqueta/README.md` → *Configurar las alertas de Telegram*. El asistente también corre desde la raíz con `npm run telegram`.

Formato que envía el ESP32 a `POST /lecturas` (todos los campos son opcionales, pero debe venir al menos uno):

```json
{ "turbidez_ntu": 12.4, "tds_ppm": 340 }
```

## Publicar cambios

Cada push a `main` publica la web en Vercel automáticamente. Vercel construye desde la carpeta `web/`.

## Datos abiertos

La web consulta los portales al compilar y luego una vez al día. Si un portal no responde, usa las copias guardadas en `web/src/data/`. Para actualizar esas copias: `cd web && npm run datos`.

- IDEAM: calidad del agua del río Bogotá (datos.gov.co, API Socrata)
- UAESP: residuos recogidos por mes (datosabiertos.bogota.gov.co, API CKAN)
- Puntos críticos de arrojo clandestino (datosabiertos.bogota.gov.co, GeoJSON)
- Cobertura vegetal del Humedal Jaboque 1952, 1976 y 2014 (datosabiertos.bogota.gov.co, GeoJSON)
