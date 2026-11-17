# Maqueta del Humedal Jaboque

Un modelo a escala del humedal con dos sensores sumergidos que miden qué tan contaminada está el agua. La maqueta envía una lectura cada 2 segundos a la web y a una pantalla pequeña. Si el agua llega a un nivel crítico, el servidor manda una alerta a los celulares por Telegram.

## Cómo funciona

```
 [ LAGO: recipiente con agua ]          [ ESP32 ]  ── WiFi ──►  [ portátil: iot-server ] ──► web en vivo
   sonda de turbidez ───────── cable ──► GPIO 34        │                │
   sonda TDS ───────────────── cable ──► GPIO 35        │                └──► Telegram: 🚨 alerta al celular
                                         pantalla OLED ◄┘ (muestra lo mismo que la web)
```

1. Las dos sondas van sumergidas en el lago. El ESP32 queda afuera, en seco.
2. El ESP32 lee la **turbidez** (qué tan sucia se ve el agua) y los **sólidos disueltos** (TDS: sal, químicos, contaminación que no se ve).
3. El portátil recibe las lecturas, las muestra en la web y revisa los límites:
   - turbidez por encima de **50 NTU**, o
   - sólidos disueltos por encima de **500 ppm**, que es el límite de la EPA para agua de consumo.
4. Si un valor pasa su límite durante **3 lecturas seguidas** (unos segundos), llega al grupo de Telegram un mensaje como este:

   ```
   🚨 ALERTA · Humedal Jaboque
   Nivel crítico de contaminación
   ⚠️ Turbidez: 87 NTU (límite 50)
   Sólidos disueltos: 210 ppm (límite 500)
   16/11/26, 10:42 a. m.
   ```

   Si sigue crítico, llegan como máximo **2 recordatorios**, uno cada 10 minutos. Cuando el agua se recupera (todo por debajo del 80 % del límite), llega un "✅ volvió a la normalidad". La web y la pantalla marcan crítico exactamente al mismo tiempo que sale el mensaje.

Los sensores miden hasta **1000 NTU** y **1000 ppm**. Por encima, la web y Telegram muestran "más de 1000" y la pantalla ">1000".

### Guion para la presentación

Mientras el agua siga en nivel crítico **no sale una alerta nueva**: sale una por cada vez que el agua pasa de normal a crítico. Por eso:

1. **Tierra:** echa una pizca de tierra o café molido y revuelve suave. Llega la alerta 🚨.
2. **Cambia el agua** (vacía y llena con agua limpia). Llega el "✅ volvió a la normalidad".
3. **Sal:** echa la salmuera (ver abajo). Llega otra alerta 🚨.
4. **Al terminar:** cambia el agua o apaga el servidor (Ctrl+C), para que no lleguen recordatorios al grupo después de la clase.

## Materiales

Precios aproximados en Bogotá (tiendas de la calle 19 o en línea), noviembre de 2026.

| Cant. | Componente | Para qué | Precio aprox. (COP) |
|---|---|---|---|
| 1 | **ESP32 DevKit V1 de 30 pines** (15 por lado) con **ESP32-WROOM-32** (o 32D / 32E) | Lee los sensores, maneja la pantalla y envía por WiFi | 25.000 – 35.000 |
| 1 | Cable USB **de datos** (no solo de carga), del tipo que use la placa: micro-USB o USB-C | Corriente y subir el programa desde el portátil | 5.000 – 10.000 |
| 1 | Sensor de turbidez analógico (tipo DFRobot SEN0189), con su placa adaptadora | Qué tan sucia se ve el agua | 35.000 |
| 1 | Sensor TDS Gravity analógico (3,3–5 V), con su sonda y su placa | Sólidos disueltos | 35.000 |
| 1 | Pantalla OLED 0,96" **SSD1306 I2C** (128 × 64, **4 pines**) | Muestra las lecturas y el estado en la maqueta | 12.000 – 20.000 |
| 2 | Resistencias: una de **20 kΩ** y una de **10 kΩ** (sirven también dos de 10 kΩ; ver abajo) | Divisor de voltaje del sensor de turbidez | 500 |
| ~14 | Cables dupont **hembra-hembra** (6 para los sensores, 4 para la pantalla y unos 4 para los empalmes soldados) | Unir todo al ESP32 | 5.000 |
| 1 | Recipiente plástico transparente: unos 6 L (~30 × 20 × 12 cm) o un vaso de 500 ml (ver abajo) | El lago | 0 – 15.000 |
| | **Total** | | **≈ 130.000 – 155.000** |

Herramientas y consumibles que ya tienes: cautín, estaño, flux, termoencogible (o cinta aislante) y silicona o plastilina epóxica para fijar el sensor de turbidez.

**Al comprar la placa:** pide el **DevKit V1 con ESP32-WROOM-32**, de 30 pines, con el chip USB **CP2102** si lo hay (Windows lo reconoce sin instalar nada); con **CH340** también sirve, pero quizá haya que instalar su controlador. El de 38 pines (19 por lado) también sirve sin cambiar el firmware: solo cambia el orden de los pines. **No sirven sin cambios:** ESP32-CAM, ESP8266 / NodeMCU, ESP32-C3, S2 o S3, ni la **WROOM-32U** si no trae su antena externa.

**Al comprar la pantalla:** pide la versión **I2C de 4 pines** (GND, VCC, SCL, SDA), no la SPI de 7 pines. La LCD 1602 no sirve igual de bien: trabaja a 5 V y sus líneas de datos pueden dañar el ESP32 sin un convertidor de nivel.

La alimentación sale del USB del portátil. No hace falta protoboard: el divisor se suelda en el cable, y el 3V3 y el GND que comparten el sensor TDS y la pantalla se unen con una "Y" soldada (ver abajo).

## Conexiones

![Diagrama de conexiones: ESP32, sensor de turbidez con su divisor de voltaje, sensor TDS y pantalla OLED](diagrama-conexiones.svg)

El diagrama también está en [`diagrama-conexiones.svg`](diagrama-conexiones.svg): ábrelo en el navegador para verlo grande o imprimirlo.

| Componente | Pin del componente | Va a |
|---|---|---|
| Sensor de turbidez | Interruptor de la placa | En **"A"** (analógico). En "D" la lectura salta entre 0 y "más de 1000" |
| | VCC | **VIN** (5 V) del ESP32 |
| | GND | GND (el que está junto a VIN) |
| | Salida A (señal) | R1 de 20 kΩ → **GPIO 34**; de GPIO 34 sale R2 de 10 kΩ al cable GND del sensor |
| Sensor TDS | + | **3V3** |
| | − | GND (el que está junto a 3V3) |
| | A | **GPIO 35** |
| Pantalla OLED | GND | GND (el mismo del TDS, con una "Y" soldada) |
| | VCC | **3V3** (el mismo del TDS, con una "Y" soldada) |
| | SCL | **GPIO 22** |
| | SDA | **GPIO 21** |

**Por qué el divisor:** el sensor de turbidez entrega hasta 4,5 V y los pines del ESP32 aguantan máximo 3,3 V. R1 (20 kΩ) y R2 (10 kΩ) lo bajan a un tercio (4,5 V → 1,5 V), dentro de la zona en que el ESP32 mide con precisión. **No las inviertas:** con la de 10 kΩ hacia el sensor llegarían 3 V al pin y la lectura saldría mal.

Las resistencias se distinguen por sus franjas de colores (o con el multímetro en Ω):

| Resistencia | 4 franjas | 5 franjas |
|---|---|---|
| 20 kΩ (R1) | rojo, negro, naranja, dorado | rojo, negro, negro, rojo, marrón |
| 10 kΩ (R2) | marrón, negro, naranja, dorado | marrón, negro, negro, rojo, marrón |

Si en cambio usas dos de 10 kΩ, da lo mismo cuál va dónde, pero en el firmware cambia `DIVISOR_TURBIDEZ` a `2.0`.

**Divisor soldado, sin protoboard:**
- Suelda **R1 (20 kΩ)** en serie entre el cable que viene de la señal del sensor y el que va al GPIO 34.
- En la punta que va al GPIO 34, suelda un extremo de **R2 (10 kΩ)**. El otro extremo se suelda al **cable GND del sensor de turbidez** (el que va al GND junto a VIN).
- Cubre todo con termoencogible.

**Pines de la pantalla:** el orden GND, VCC, SCL, SDA cambia entre fabricantes. **Guíate por lo que está impreso en la pantalla**, no por el orden del diagrama: si VCC y GND quedan al revés, la pantalla se daña.

El ESP32 DevKit V1 de 30 pines tiene un GND a cada lado: el sensor de turbidez usa el que está junto a VIN y el TDS el que está junto a 3V3. Si tu placa es de 38 pines, el orden cambia: guíate por el nombre impreso en cada pin.

**Cuidado con el agua:** solo las puntas de las sondas van dentro del agua. La cabeza del sensor de turbidez no es sumergible: fíjala al borde del recipiente con silicona o plastilina epóxica para que solo la parte inferior (la ranura) quede bajo el agua, sin tocar el fondo. Separa las sondas al menos 3 o 4 cm. El ESP32, las placas de los sensores y la pantalla van fuera del recipiente.

### Con un vaso de 500 ml en vez de 6 L

Funciona, pero todo queda unas 12 veces más concentrado:
- **Sal:** no la eches directa (una cucharadita satura el sensor). Prepara **salmuera**: 1 cucharadita de sal en 100 ml de agua. **Una cucharadita de salmuera** en el vaso sube unos 500 ppm.
- **Tierra:** solo **una pizca** (como 1/4 de cucharadita). Una cucharada lo vuelve lodo y satura el sensor.
- La ranura del sensor de turbidez necesita unos 4 a 5 cm de agua.
- La luz del sensor rebota en las paredes cercanas: **calibra en el mismo vaso** que vas a usar.
- Pega el vaso a la base para que no se voltee cerca del ESP32.
- Ventaja: cambiar el agua toma segundos, así que el guion se repite fácil.

Las cantidades son estimaciones: pruébalas antes, mirando el valor en la web o en la pantalla.

## Programar el ESP32

1. Instala [Arduino IDE 2](https://www.arduino.cc/en/software).
2. En *Archivo → Preferencias → URLs adicionales de gestor de placas*, agrega
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
   Luego, en *Herramientas → Placa → Gestor de placas*, instala **esp32** de Espressif.
   En *Herramientas → Gestionar librerías*, instala **Adafruit SSD1306** (acepta instalar también **Adafruit GFX Library**). Hacen falta para compilar, aunque no conectes la pantalla.
3. En la carpeta `firmware/maqueta_jaboque/`, copia `secretos.ejemplo.h` como **`secretos.h`** y llénalo:
   - `WIFI_NOMBRE` y `WIFI_CLAVE`: la red WiFi a la que también está conectado el portátil.
   - `SERVIDOR`: la dirección que imprime `npm start` en la línea "ESP32 (misma WiFi)".

   `secretos.h` no se sube a GitHub (está en `.gitignore`), así tu clave del WiFi no queda publicada. Luego abre `maqueta_jaboque.ino`: el Arduino IDE muestra `secretos.h` en una pestaña.
4. Selecciona la placa **ESP32 Dev Module** y pulsa **Verificar** (✓): compila sin necesidad de tener el ESP32 conectado, así detectas cualquier problema antes.
5. Conecta el ESP32, elige el puerto COM y pulsa **Subir** (→). Si se queda en "Connecting…", mantén presionado el botón **BOOT** de la placa hasta que empiece a subir.
6. Abre el *Monitor serie* a 115200 baudios. Debes ver "Pantalla OLED encontrada" (o "Sin pantalla OLED"), "WiFi conectado" con la IP del ESP32 y, cada 2 segundos, una línea con las lecturas y el voltaje del sensor de turbidez.

**La pantalla muestra** la turbidez, los sólidos disueltos y una franja de estado: "Agua en buen estado", **"NIVEL CRITICO"** (invertida), "Sin WiFi" o "Sin servidor". Si no muestra nada, revisa SDA/SCL; si tu pantalla usa la dirección 0x3D, cámbiala en `DIRECCION_OLED`.

> El ESP32 solo se conecta a redes de **2,4 GHz**. Las redes de las universidades con usuario y contraseña (WPA2-Enterprise) no sirven. Usa la zona WiFi de un celular, y que **tenga datos**: el portátil necesita internet para mandar las alertas a Telegram. En iPhone, activa *Maximizar compatibilidad* en la zona WiFi para que sea de 2,4 GHz.

## Configurar las alertas de Telegram (10 minutos, una sola vez)

1. En Telegram, busca **@BotFather**, escribe `/newbot` y sigue los pasos. Al final te da un **token**, algo como `7412345678:AAH...`.
2. En `iot-server/`, copia `.env.ejemplo` como `.env` y pega el token en `TELEGRAM_TOKEN`.
3. Crea un **grupo** en Telegram con el bot y escribe cualquier mensaje en el grupo, por ejemplo "hola".
4. Corre `npm run telegram` desde la raíz del proyecto. Te muestra el número del grupo, que empieza con `-`. Pégalo en `TELEGRAM_CHAT_ID` dentro de `.env`.
5. Corre `npm run telegram` otra vez. Debe llegar un mensaje de prueba al grupo.

**Si el grupo cambia de número:** Telegram convierte a veces un grupo en "supergrupo" (por ejemplo, al nombrar administrador al bot) y le asigna un número nuevo que empieza con `-100`. El servidor lo detecta, envía igual al número nuevo y muestra en la consola la línea `TELEGRAM_CHAT_ID=…` que hay que poner en `.env`.

**Usa dos grupos:** uno **de pruebas** (solo el equipo) para ensayar, y el **de la presentación** (con la profesora) solo para ese día. Para cambiar de grupo, cambia `TELEGRAM_CHAT_ID` en `.env` y reinicia el servidor. Así los ensayos no le llenan el celular a la profesora.

En el mismo `.env` se cambian los límites (`UMBRAL_TURBIDEZ`, `UMBRAL_TDS`), cada cuánto se repite el aviso (`REPETIR_MIN`) y cuántos recordatorios como máximo (`MAX_RECORDATORIOS`). La web usa los mismos límites que el servidor. El archivo `.env` no se sube a GitHub porque el token es secreto.

Para probar sin la maqueta, corre `npm run demo` desde la raíz del proyecto. Solas, las lecturas simuladas se mueven un poco pero nunca pasan el límite, así que no le escriben al grupo sin que nadie lo pida. En la pantalla "Maqueta en vivo", pulsa **Echar tierra** unas 3 veces seguidas o **Echar sal** unas 4: cada clic sube un poco el valor y, cuando pasa el límite, a los pocos segundos llega la alerta marcada "(simulación)". Si el último clic lo deja justo en el límite, pulsa una vez más. **Cambiar el agua** limpia el lago y llega el "✅ volvió a la normalidad".

> La página pública (Vercel) corre una demostración solo en el navegador: muestra el nivel crítico pero **no** manda mensajes a Telegram. Las alertas siempre salen del servidor del portátil, con `npm run demo` o con la maqueta real.

## Calibración (10 minutos)

**Turbidez.** Sumerge el sensor en agua limpia de la llave, en el recipiente que vas a usar, y mira en el *Monitor serie* el voltaje del sensor (por ejemplo, `sensor de turbidez: 4.05 V`). La curva del fabricante espera **4,2 V** con agua limpia, así que pon en `AJUSTE_TURBIDEZ` la diferencia: `4.2 − el voltaje que marca` (con 4,05 V, pon `0.15`). Vuelve a subir el programa y debe marcar cerca de 0 NTU. El ajuste suele hacer falta porque el USB no da 5 V exactos sino 4,5 a 4,8 V. Este sensor sirve para mostrar cambios bruscos, no para medir como un laboratorio: vale la pena decirlo en la sustentación.

**TDS.** El agua de la llave de Bogotá debe dar entre 30 y 120 ppm. Si tienes un termómetro, pon la temperatura real del agua en `TEMPERATURA_AGUA` (por defecto 18 °C). Al disolver sal o salmuera, el valor tiene que subir de forma clara. Si pasa de 500 con muy poca sal o no llega nunca, ajusta `UMBRAL_TDS` en `.env`.

## Antes de la presentación

**El día anterior:**
- [ ] Conecta el portátil y el ESP32 a **la misma zona WiFi que vas a usar ese día**, corre `npm start` y pon la IP que aparece en `SERVIDOR` (en `secretos.h`). Sube el programa. La IP de la zona WiFi del celular casi nunca es la de la casa.
- [ ] Si Windows pregunta por el firewall al arrancar, **permite Node.js también en redes públicas**, o marca la zona WiFi como red *Privada*. Si no, el ESP32 no llega al portátil y la pantalla dice "Sin servidor".
- [ ] Cambia `TELEGRAM_CHAT_ID` al grupo de la presentación.

**El día de la presentación:**
- [ ] El portátil y el ESP32 están en la zona WiFi del celular, **con datos**.
- [ ] **Unos 10 minutos antes**, desde la raíz del proyecto: `npm start`. Revisa que diga "Alertas por Telegram activas". La primera carga de la web tarda unos 25 segundos; después es rápida.
- [ ] Presenta desde **http://localhost:3000** en el portátil (es lo que abre `npm start`), en Chrome. Desde la web publicada el navegador puede bloquear la conexión con el portátil.
- [ ] En "Maqueta en vivo" debe decir **"Maqueta conectada"** con el punto verde. Si dice "Servidor listo, esperando lecturas del ESP32", el ESP32 no está llegando: revisa la IP, el WiFi y el firewall. La pantalla de la maqueta dice cuál es el problema ("Sin WiFi" o "Sin servidor").
- [ ] Los celulares que van a recibir la alerta están en el grupo y tienen las notificaciones activas.
- [ ] Si algo falla, presenta con `npm run demo`: también manda alertas a Telegram, con los botones Echar tierra y Echar sal.
- [ ] Al terminar: cambia el agua o apaga con Ctrl+C.
