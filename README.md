# Jaboque en datos

**Web publicada:** https://jaboque-en-datos.vercel.app

Proyecto final del curso *Contexto: Ciencia, Tecnología y Sociedad*. Muestra la contaminación del Humedal Jaboque y del río Bogotá con datos abiertos, más una maqueta a escala con sensores en tiempo real.

| Carpeta | Qué es | Dónde corre |
|---|---|---|
| `web/` | La página (Next.js). Lee datos de datos.gov.co y datosabiertos.bogota.gov.co | Vercel (pública) |
| `iot-server/` | Recibe las lecturas del ESP32 y las retransmite a la página | El portátil, en la red local |
| `maqueta/` | Guía de construcción, materiales, conexiones y firmware del ESP32 | Arduino IDE |

## Probar todo en el portátil

```bash
# 1. Servidor de la maqueta con lecturas simuladas (no necesita instalar nada)
cd iot-server
npm run demo

# 2. En otra terminal, la web
cd web
npm install
npm run dev        # abre http://localhost:3000
```

La sección "Jaboque a escala" debe decir *Servidor local conectado*. Si apagas el servidor, la web pasa sola al modo demostración.

## Con la maqueta real

1. `cd iot-server && npm start`. Anota la IP que aparece en la línea "ESP32 (misma WiFi)".
2. Pon esa IP en el firmware (`maqueta/firmware/maqueta_jaboque/maqueta_jaboque.ino`) y súbelo al ESP32.
3. Abre la web pública (o la local) en ese mismo portátil.

Formato que envía el ESP32 a `POST /lecturas` (todos los campos son opcionales, pero debe venir al menos uno):

```json
{ "turbidez_ntu": 12.4, "tds_ppm": 340, "temperatura_c": 18.2, "basura_g": 85, "objetos": 7 }
```

## Publicar cambios

Cada push a `main` publica la web en Vercel automáticamente. Vercel construye desde la carpeta `web/`.

## Datos abiertos

La web consulta los portales al compilar y luego una vez al día. Si un portal no responde, usa las copias guardadas en `web/src/data/`. Para actualizar esas copias: `cd web && npm run datos`.

- IDEAM: calidad del agua del río Bogotá (datos.gov.co, API Socrata)
- UAESP: residuos recogidos por mes (datosabiertos.bogota.gov.co, API CKAN)
- Puntos críticos de arrojo clandestino (datosabiertos.bogota.gov.co, GeoJSON)
- Cobertura vegetal del Humedal Jaboque 1952, 1976 y 2014 (datosabiertos.bogota.gov.co, GeoJSON)
