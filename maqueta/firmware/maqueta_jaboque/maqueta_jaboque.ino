/*
  Maqueta del Humedal Jaboque: lee la turbidez y los sólidos disueltos (TDS)
  y envía una lectura cada 2 s al servidor local (iot-server/server.mjs).
  El servidor decide si el lago está en nivel crítico y manda la alerta por Telegram.
  Si hay una pantalla OLED conectada, muestra las mismas lecturas y el mismo estado que la web.

  Placa: ESP32 DevKit V1 (en Arduino IDE: "ESP32 Dev Module")
  Librerías (Gestor de librerías del Arduino IDE). Hacen falta para compilar
  aunque no conectes la pantalla:
    - Adafruit SSD1306
    - Adafruit GFX Library

  Antes de subir: copia secretos.ejemplo.h como secretos.h y pon tu WiFi y la IP del portátil.
  La IP del servidor aparece en la consola cuando corres `npm start`.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------- Configuración ----------
// WIFI_NOMBRE, WIFI_CLAVE y SERVIDOR están en secretos.h (no se sube a GitHub).
// Si no existe, copia secretos.ejemplo.h como secretos.h y llena tus datos.
#include "secretos.h"
const unsigned long INTERVALO_MS = 2000;

// ---------- Pines ----------
// Solo pines ADC1 (32–39) para lecturas analógicas: ADC2 no funciona con WiFi activo.
const int PIN_TURBIDEZ = 34;  // salida del sensor de turbidez (por divisor de voltaje)
const int PIN_TDS      = 35;  // salida del sensor TDS
const int PIN_SDA      = 21;  // pantalla OLED (I2C)
const int PIN_SCL      = 22;
const int PIN_LED      = 2;   // LED integrado: parpadea en cada envío

// ---------- Calibración (ver maqueta/README.md) ----------
const float DIVISOR_TURBIDEZ = 1.5;   // divisor 10k/20k: V_sensor = V_pin * 1.5
const float AJUSTE_TURBIDEZ  = 0.0;   // voltios a sumar para que el agua limpia lea ~0 NTU
const float TEMPERATURA_AGUA = 18.0;  // °C; el agua de la llave en Bogotá está entre 15 y 20

// Tope de lo que los sensores miden de verdad (según el fabricante). Por encima, el agua
// tapa toda la luz (turbidez) o la placa llega a su voltaje máximo (TDS): se envía el tope
// y la web, la pantalla y Telegram lo muestran como "más de 1000".
const float LIMITE_TURBIDEZ = 1000.0;  // NTU
const float LIMITE_TDS      = 1000.0;  // ppm

// ---------- Pantalla OLED 0,96" SSD1306 (opcional) ----------
const uint8_t DIRECCION_OLED = 0x3C;  // casi todas usan 0x3C; algunas, 0x3D
Adafruit_SSD1306 pantalla(128, 64, &Wire, -1);
bool hayPantalla = false;

// Último estado conocido, para la pantalla.
enum Conexion { SIN_WIFI, SIN_SERVIDOR, CONECTADO };
Conexion conexion = SIN_WIFI;
bool critico = false;

const int MUESTRAS = 30;  // cada lectura promedia 30 medidas para reducir el ruido

float voltajePromedio(int pin) {
  long suma = 0;
  for (int i = 0; i < MUESTRAS; i++) {
    suma += analogReadMilliVolts(pin);
    delay(2);
  }
  return (suma / (float)MUESTRAS) / 1000.0;
}

float leerTurbidez() {
  float v = voltajePromedio(PIN_TURBIDEZ) * DIVISOR_TURBIDEZ + AJUSTE_TURBIDEZ;
  // Curva del fabricante (válida aprox. entre 2.5 V y 4.2 V).
  if (v >= 4.2) return 0;
  if (v < 2.5) return LIMITE_TURBIDEZ;
  float ntu = -1120.4 * v * v + 5742.3 * v - 4352.9;
  return constrain(ntu, 0.0f, LIMITE_TURBIDEZ);
}

float leerTDS() {
  float v = voltajePromedio(PIN_TDS);
  float compensado = v / (1.0 + 0.02 * (TEMPERATURA_AGUA - 25.0));
  float tds = (133.42 * pow(compensado, 3) - 255.86 * compensado * compensado + 857.39 * compensado) * 0.5;
  return constrain(tds, 0.0f, LIMITE_TDS);
}

// La pantalla no muestra tildes con la fuente básica, por eso los textos van sin ellas.
void mostrar(float turbidez, float tds) {
  if (!hayPantalla) return;
  pantalla.clearDisplay();
  pantalla.setTextColor(SSD1306_WHITE);

  pantalla.setTextSize(1);
  pantalla.setCursor(0, 0);
  pantalla.print("Humedal Jaboque");
  pantalla.setCursor(104, 0);
  pantalla.print(conexion == CONECTADO ? "OK" : "--");

  // Lecturas: el número grande, la unidad pequeña.
  pantalla.setCursor(0, 16);
  pantalla.print("Turb.");
  pantalla.setTextSize(2);
  pantalla.setCursor(36, 12);
  if (turbidez >= LIMITE_TURBIDEZ) pantalla.print(">1000");
  else pantalla.print(turbidez, turbidez < 100 ? 1 : 0);  // "87.4", pero "250" sin decimales para que quepa
  pantalla.setTextSize(1);
  pantalla.print(" NTU");

  pantalla.setCursor(0, 34);
  pantalla.print("TDS");
  pantalla.setTextSize(2);
  pantalla.setCursor(36, 30);
  if (tds >= LIMITE_TDS) pantalla.print(">1000");
  else pantalla.print(tds, 0);
  pantalla.setTextSize(1);
  pantalla.print(" ppm");

  // Franja de estado: invertida cuando el lago está en nivel crítico.
  const char* estado =
      conexion == SIN_WIFI     ? "Sin WiFi" :
      conexion == SIN_SERVIDOR ? "Sin servidor" :
      critico                  ? "NIVEL CRITICO" :
                                 "Agua en buen estado";
  bool invertir = conexion == CONECTADO && critico;
  if (invertir) pantalla.fillRect(0, 50, 128, 14, SSD1306_WHITE);
  pantalla.setTextColor(invertir ? SSD1306_BLACK : SSD1306_WHITE);
  int ancho = strlen(estado) * 6;
  pantalla.setCursor((128 - ancho) / 2, 53);
  pantalla.print(estado);

  pantalla.display();
}

void conectarWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Conectando a %s", WIFI_NOMBRE);
  WiFi.begin(WIFI_NOMBRE, WIFI_CLAVE);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" conectado: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" sin conexión, reintento luego");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  analogSetAttenuation(ADC_11db);  // rango 0–3.3 V

  // La pantalla es opcional: si no responde en el bus I2C, el resto funciona igual.
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.beginTransmission(DIRECCION_OLED);
  hayPantalla = Wire.endTransmission() == 0 && pantalla.begin(SSD1306_SWITCHCAPVCC, DIRECCION_OLED, true, false);  // false: usa el bus I2C ya iniciado en D21/D22
  Serial.println(hayPantalla ? "Pantalla OLED encontrada" : "Sin pantalla OLED (opcional)");
  if (hayPantalla) {
    pantalla.clearDisplay();
    pantalla.setTextColor(SSD1306_WHITE);
    pantalla.setTextSize(1);
    pantalla.setCursor(0, 24);
    pantalla.print("Conectando al WiFi...");
    pantalla.display();
  }

  conectarWiFi();
}

void loop() {
  static unsigned long ultimoEnvio = 0;
  if (millis() - ultimoEnvio < INTERVALO_MS) return;
  ultimoEnvio = millis();

  float turbidez = leerTurbidez();
  float tds = leerTDS();
  String json = "{\"turbidez_ntu\":" + String(turbidez, 1) + ",\"tds_ppm\":" + String(tds, 0) + "}";
  Serial.println(json);

  conectarWiFi();
  if (WiFi.status() != WL_CONNECTED) {
    conexion = SIN_WIFI;
    mostrar(turbidez, tds);
    return;
  }

  HTTPClient http;
  http.setTimeout(1500);  // si el portátil no responde, no bloquear la maqueta
  http.begin(SERVIDOR);
  http.addHeader("Content-Type", "application/json");
  int codigo = http.POST(json);
  if (codigo == 201) {
    conexion = CONECTADO;
    // El servidor responde si el lago está en nivel crítico: la misma regla de la web y de Telegram.
    critico = http.getString().indexOf("\"critico\":true") >= 0;
  } else {
    conexion = SIN_SERVIDOR;
    Serial.printf("El servidor respondió %d: %s\n", codigo, http.getString().c_str());
  }
  http.end();
  mostrar(turbidez, tds);

  digitalWrite(PIN_LED, HIGH);
  delay(40);
  digitalWrite(PIN_LED, LOW);
}
