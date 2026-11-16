# Maqueta del Humedal Jaboque

Un modelo a escala del humedal con dos sensores sumergidos que miden qué tan contaminada está el agua. La maqueta envía una lectura cada 2 segundos a la web. Si el lago llega a un nivel crítico, el servidor manda una alerta a los celulares por Telegram.

## Cómo funciona

```
 [ LAGO: recipiente con agua ]          [ ESP32 ]  ── WiFi ──►  [ portátil: iot-server ] ──► web en vivo
   sonda de turbidez ───────── cable ──► GPIO 34                        │
   sonda TDS ───────────────── cable ──► GPIO 35                        └──► Telegram: 🚨 alerta al celular
```

1. Las dos sondas van sumergidas en el lago. El ESP32 queda afuera, en seco.
2. El ESP32 lee la **turbidez** (qué tan sucia se ve el agua) y los **sólidos disueltos** (TDS: sal, químicos, contaminación que no se ve).
3. El portátil recibe las lecturas, las muestra en la web y revisa los límites:
   - turbidez por encima de **50 NTU**, o
   - sólidos disueltos por encima de **500 ppm**, que es el límite de la EPA para agua de consumo.
4. Si un valor pasa su límite durante 6 segundos seguidos, llega al grupo de Telegram un mensaje como este:

   ```
   🚨 ALERTA · Humedal Jaboque
   Nivel crítico de contaminación
   ⚠️ Turbidez: 87 NTU (límite 50)
   Sólidos disueltos: 210 ppm (límite 500)
   16/11/26, 10:42 a. m.
   ```

   Si sigue crítico, llega un recordatorio cada 10 minutos. Cuando el agua se recupera, llega un "✅ volvió a la normalidad".

**Durante la presentación:** se echa una cucharada de tierra o café molido y se revuelve, y la turbidez se dispara. Luego se disuelve una cucharadita de sal, y el TDS sube por encima de 500 en unos 6 L de agua. En los dos casos, a los pocos segundos les llega la alerta a los celulares.

## Materiales

Precios aproximados en Bogotá (tiendas de la calle 19 o en línea), noviembre de 2026. No incluye herramientas: cautín, estaño, termoencogible y silicona.

| Componente | Para qué | Precio aprox. (COP) |
|---|---|---|
| ESP32 DevKit V1 + cable USB **de datos** (no solo de carga) | Lee los sensores y envía por WiFi | 30.000 |
| Sensor de turbidez analógico (tipo DFRobot SEN0189) | Qué tan sucia se ve el agua | 35.000 |
| Sensor TDS Gravity analógico (3,3–5 V), con su sonda | Sólidos disueltos | 35.000 |
| 1 resistencia de 10 kΩ y 1 de 20 kΩ (o dos de 10 kΩ en serie) | Divisor de voltaje del sensor de turbidez | 500 |
| 6 cables dupont hembra-hembra | Unir los sensores al ESP32 | 3.000 |
| Recipiente plástico transparente (unos 6 L, ~30 × 20 × 12 cm) | El lago | 15.000 |
| **Total** | | **≈ 120.000** |

La alimentación sale del USB del portátil. No hace falta protoboard: el divisor se suelda en el cable (ver abajo).

## Conexiones

| Componente | Pin del componente | Va a |
|---|---|---|
| Sensor de turbidez | VCC | **VIN** (5 V) del ESP32 |
| | GND | GND |
| | Salida A (señal) | Resistencia de 10 kΩ → **GPIO 34**; de GPIO 34 sale la de 20 kΩ a GND |
| Sensor TDS | + | **3V3** |
| | − | GND (el otro pin GND del ESP32) |
| | A | **GPIO 35** |

**Por qué el divisor:** el sensor de turbidez entrega hasta 4,5 V y los pines del ESP32 aguantan máximo 3,3 V. Las dos resistencias bajan el voltaje a dos tercios.

**Divisor soldado, sin protoboard:** corta un cable dupont hembra-hembra por la mitad.
- Suelda la resistencia de 10 kΩ en serie entre el cable que viene de la señal del sensor y el que va al GPIO 34.
- En la punta que va al GPIO 34, suelda un extremo de la de 20 kΩ. El otro extremo va a un cable que llega a GND.
- Cubre todo con termoencogible. Queda un arnés en "Y" de tres puntas: señal del sensor, GPIO 34 y GND.

El ESP32 tiene dos pines GND en un lado y uno en el otro, así que cada sensor usa el suyo.

**Cuidado con el agua:** solo las puntas de las sondas van dentro del agua. La cabeza del sensor de turbidez no es sumergible: fíjala al borde del recipiente con silicona o plastilina epóxica para que solo la parte inferior toque el agua. Separa las dos sondas unos 10 cm. El ESP32 y las placas de los sensores van fuera del recipiente.

## Programar el ESP32

1. Instala [Arduino IDE 2](https://www.arduino.cc/en/software).
2. En *Archivo → Preferencias → URLs adicionales de gestor de placas*, agrega
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
   Luego, en *Herramientas → Placa → Gestor de placas*, instala **esp32** de Espressif. No hace falta ninguna otra librería.
3. Abre `firmware/maqueta_jaboque/maqueta_jaboque.ino` y cambia:
   - `WIFI_NOMBRE` y `WIFI_CLAVE`: la red WiFi a la que también está conectado el portátil.
   - `SERVIDOR`: la dirección que imprime `npm start` en la línea "ESP32 (misma WiFi)".
4. Selecciona la placa **ESP32 Dev Module** y el puerto COM, y sube el programa.
5. Abre el *Monitor serie* a 115200 baudios. Debes ver una línea JSON cada 2 segundos.

> El ESP32 solo se conecta a redes de **2,4 GHz**. Las redes de las universidades con usuario y contraseña (WPA2-Enterprise) no sirven. Usa la zona WiFi de un celular, y que **tenga datos**: el portátil necesita internet para mandar las alertas a Telegram.

## Configurar las alertas de Telegram (10 minutos, una sola vez)

1. En Telegram, busca **@BotFather**, escribe `/newbot` y sigue los pasos. Al final te da un **token**, algo como `7412345678:AAH...`.
2. En `iot-server/`, copia `.env.ejemplo` como `.env` y pega el token en `TELEGRAM_TOKEN`.
3. Crea un **grupo** en Telegram con la profesora, el equipo y el bot. Escribe cualquier mensaje en el grupo, por ejemplo "hola".
4. Corre `npm run telegram` en `iot-server/`. Te muestra el número del grupo, que empieza con `-`. Pégalo en `TELEGRAM_CHAT_ID` dentro de `.env`.
5. Corre `npm run telegram` otra vez. Debe llegar un mensaje de prueba al grupo.

Los límites y cada cuánto se repite el aviso se cambian en el mismo `.env`. El archivo `.env` no se sube a GitHub porque el token es secreto.

Para probar sin la maqueta, corre `npm run demo`: las lecturas simuladas se enturbian solas y en uno o dos minutos llega una alerta marcada "(simulación)".

## Calibración (10 minutos)

**Turbidez.** Sumerge el sensor en agua limpia de la llave. Si marca más de 5 NTU, sube `AJUSTE_TURBIDEZ` de 0,05 en 0,05 hasta que marque cerca de 0. Este sensor sirve para mostrar cambios relativos, no para medir como un laboratorio. Vale la pena decirlo en la sustentación.

**TDS.** El agua de la llave de Bogotá debe dar entre 30 y 120 ppm. Al disolver una cucharadita de sal, el valor tiene que subir de forma clara. Si pasa de 500 con muy poca sal o no llega nunca, ajusta `UMBRAL_TDS` en `.env`.

## Antes de la presentación

- [ ] El portátil y el ESP32 están en la misma red: la zona WiFi del celular, con datos.
- [ ] En el portátil: `cd iot-server` y `npm start`. Anota la IP y revisa que diga "Alertas por Telegram activas".
- [ ] La IP del firmware coincide. Si cambió, actualízala y vuelve a subir el programa.
- [ ] Abre la web **en el mismo portátil, en Chrome**, y, en la pantalla "Maqueta en vivo", busca "Maqueta conectada" con el punto verde.
      Chrome puede pedir permiso para "acceder a dispositivos de la red local": acéptalo.
- [ ] Los celulares que van a recibir la alerta están en el grupo y tienen las notificaciones activas.
- [ ] Si algo falla, la web pasa sola al modo demostración y sigue funcionando.
      `npm run demo` también manda alertas de Telegram con lecturas simuladas.
