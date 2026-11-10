# Maqueta del Humedal Jaboque

Un modelo a escala del humedal con sensores que miden la calidad del agua y la basura que cae en él. Envía una lectura cada 2 segundos a la web.

## Cómo funciona

El agua circula en un circuito cerrado, igual que un humedal real que recibe agua de un canal y la entrega al río:

```
   ┌──────────── manguera ─────────────┐
   │                                   ▼
[tanque de      [canal de entrada]→[ LAGO (sensores sumergidos) ]→[vertedero]→[canasta de malla]
 reserva] ◄── el agua escurre ──────────────────────────────────────────────┘   sobre la balanza
   ▲ bomba sumergible                                         sensor IR cuenta cada objeto
```

1. Una bomba pequeña lleva agua del tanque de reserva al **canal de entrada** (el "río" que alimenta el humedal).
2. En el **lago** van sumergidos los sensores de turbidez, sólidos disueltos (TDS) y temperatura.
3. Una **barrera flotante en V** (un tubo de espuma o una pajilla gruesa) empuja la basura que flota hacia el **vertedero de salida**.
4. La basura cae a una **canasta de malla** apoyada sobre una **celda de carga**, que la pesa. El agua atraviesa la malla y vuelve al tanque.
5. Un **sensor infrarrojo** en el vertedero cuenta cada objeto que pasa.

Durante la presentación: se echa tierra o café molido para enturbiar el agua, sal para subir los sólidos disueltos, y tapas o trocitos de espuma de poliestireno y plástico como "basura". La web lo muestra en vivo.

## Materiales

Precios aproximados en Bogotá (tiendas de electrónica de la calle 19 o tiendas en línea), noviembre de 2026.

| Componente | Para qué | Precio aprox. (COP) |
|---|---|---|
| ESP32 DevKit V1 + cable USB | Lee los sensores y envía por WiFi | 30.000 |
| Sensor de turbidez analógico (tipo DFRobot SEN0189) | Qué tan sucia se ve el agua | 35.000 |
| Sensor TDS Gravity (analógico, 3,3–5 V) | Sólidos disueltos, contaminación química | 35.000 |
| Sonda DS18B20 sumergible + resistencia de 4,7 kΩ | Temperatura del agua | 10.000 |
| Celda de carga de 1 kg + módulo HX711 | Peso de la basura recogida | 18.000 |
| Sensor infrarrojo de obstáculos FC-51 | Cuenta los objetos que caen | 5.000 |
| Mini bomba sumergible 5 V + 1 m de manguera de 8 mm | Hace circular el agua | 15.000 |
| Resistencias de 10 kΩ y 20 kΩ | Divisor de voltaje para el sensor de turbidez | 1.000 |
| Protoboard, cables dupont macho-hembra | Conexiones | 15.000 |
| Fuente USB de 5 V / 2 A (puede ser un cargador de celular) | Alimentación | 0–15.000 |
| Recipiente plástico transparente (~40 × 30 × 15 cm) y un frasco grande para el tanque | Lago y reserva | 20.000 |
| Malla plástica, espuma o pajillas, plastilina epóxica, silicona | Barrera, canasta y sellado | 15.000 |
| **Total** | | **≈ 215.000 – 230.000** |

## Conexiones

Todos los sensores comparten la tierra (GND) del ESP32.

| Componente | Pin del componente | Va a |
|---|---|---|
| Sensor de turbidez | VCC | 5 V (pin VIN del ESP32) |
| | GND | GND |
| | Salida A (señal) | Resistencia de 10 kΩ → **GPIO 34**; de GPIO 34 sale una resistencia de 20 kΩ a GND |
| Sensor TDS | + | 3,3 V |
| | − | GND |
| | A | **GPIO 35** |
| DS18B20 | Rojo | 3,3 V |
| | Negro | GND |
| | Amarillo (datos) | **GPIO 4**, con la resistencia de 4,7 kΩ entre este cable y 3,3 V |
| HX711 | VCC | 3,3 V |
| | GND | GND |
| | DT | **GPIO 16** |
| | SCK | **GPIO 17** |
| Celda de carga → HX711 | Rojo / negro / blanco / verde | E+ / E− / A− / A+ |
| Sensor IR FC-51 | VCC | 3,3 V |
| | GND | GND |
| | OUT | **GPIO 27** |
| Mini bomba | + / − | 5 V de la fuente / GND (no la alimentes desde un pin del ESP32) |

**Por qué el divisor de voltaje:** el sensor de turbidez entrega hasta 4,5 V y los pines del ESP32 aguantan máximo 3,3 V. Las dos resistencias reducen el voltaje a dos tercios.

**Cuidado con el agua:** solo las puntas de las sondas van dentro del agua. La cabeza del sensor de turbidez no es sumergible, así que fíjala con plastilina epóxica para que solo la parte inferior toque el agua. El ESP32, la protoboard y el HX711 van fuera del recipiente.

## Programar el ESP32

1. Instala [Arduino IDE 2](https://www.arduino.cc/en/software).
2. En *Archivo → Preferencias → URLs adicionales de gestor de placas*, agrega
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
   Luego, en *Herramientas → Placa → Gestor de placas*, instala **esp32** de Espressif.
3. En *Herramientas → Gestionar librerías*, instala **OneWire**, **DallasTemperature** y **HX711** (de bogde).
4. Abre `firmware/maqueta_jaboque/maqueta_jaboque.ino` y cambia:
   - `WIFI_NOMBRE` y `WIFI_CLAVE`: la red WiFi a la que también está conectado el portátil.
   - `SERVIDOR`: la dirección que imprime `npm start` en la línea "ESP32 (misma WiFi)".
5. Selecciona la placa **ESP32 Dev Module** y el puerto COM, y sube el programa.
6. Abre el *Monitor serie* a 115200 baudios. Debes ver una línea JSON cada 2 segundos.

> El ESP32 solo se conecta a redes de **2,4 GHz**. Las redes de las universidades con usuario y contraseña (WPA2-Enterprise) no sirven. Usa la zona WiFi de un celular, que es lo más confiable para la presentación.

## Calibración (15 minutos)

**Balanza.** Con la canasta vacía, enciende el ESP32 (la tara se hace sola al arrancar). Pon un objeto de peso conocido, por ejemplo un celular que hayas pesado en una balanza de cocina, y mira cuántos gramos marca en el monitor serie. Ajusta `FACTOR_BALANZA` así:
`nuevo factor = factor actual × (gramos que marca ÷ gramos reales)`.

**Turbidez.** Sumerge el sensor en agua limpia de la llave. Si marca más de 5 NTU, sube `AJUSTE_TURBIDEZ` de 0,05 en 0,05 hasta que marque cerca de 0. Este sensor es para mostrar cambios relativos, no para medir como un laboratorio, y eso vale la pena decirlo en la sustentación.

**TDS.** El agua de la llave de Bogotá debe dar entre 30 y 120 ppm. Al disolver una cucharadita de sal en el lago, el valor tiene que subir de forma clara.

**Contador.** Gira el potenciómetro del FC-51 hasta que su LED se encienda solo cuando un objeto pasa frente a él, a unos 2 o 3 cm.

## Antes de la presentación

- [ ] El portátil y el ESP32 están en la misma red (la zona WiFi del celular).
- [ ] En el portátil: `cd iot-server` y `npm start`. Anota la IP que aparece.
- [ ] La IP del firmware coincide. Si cambió, actualízala y vuelve a subir el programa.
- [ ] Abre la web **en el mismo portátil** y busca "Maqueta conectada" en verde.
      Chrome puede pedir permiso para "acceder a dispositivos de la red local": acéptalo.
- [ ] Si algo falla, la web pasa sola al modo demostración y sigue funcionando.
      También puedes correr `npm run demo` para mostrar el servidor con lecturas simuladas.
