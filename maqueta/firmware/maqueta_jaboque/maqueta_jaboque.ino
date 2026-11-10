/*
  Maqueta del Humedal Jaboque: lee los sensores y envía una lectura cada 2 s
  al servidor local (iot-server/server.mjs).

  Placa: ESP32 DevKit V1 (en Arduino IDE: "ESP32 Dev Module")
  Librerías (Gestor de librerías del Arduino IDE):
    - OneWire                (Paul Stoffregen)
    - DallasTemperature      (Miles Burton)
    - HX711                  (Bogdan Necula / bogde)

  Antes de subir: cambia WIFI_NOMBRE, WIFI_CLAVE y SERVIDOR.
  La IP del servidor aparece en la consola cuando corres `npm start` en iot-server.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>

// ---------- Configuración ----------
const char* WIFI_NOMBRE = "NOMBRE_DE_TU_WIFI";
const char* WIFI_CLAVE  = "CLAVE_DE_TU_WIFI";
const char* SERVIDOR    = "http://192.168.1.4:4000/lecturas";  // IP del portátil
const unsigned long INTERVALO_MS = 2000;

// ---------- Pines ----------
// Solo pines ADC1 (32–39) para lecturas analógicas: ADC2 no funciona con WiFi activo.
const int PIN_TURBIDEZ   = 34;  // salida analógica del sensor de turbidez (por divisor de voltaje)
const int PIN_TDS        = 35;  // salida analógica del sensor TDS
const int PIN_TEMP       = 4;   // DS18B20 (con resistencia de 4.7 kΩ a 3.3 V)
const int PIN_HX711_DT   = 16;
const int PIN_HX711_SCK  = 17;
const int PIN_CONTADOR   = 27;  // sensor infrarrojo de obstáculos en la entrada de la trampa
const int PIN_LED        = 2;   // LED integrado: parpadea en cada envío

// ---------- Calibración (ver maqueta/README.md) ----------
const float DIVISOR_TURBIDEZ = 1.5;   // divisor 10k/20k: V_sensor = V_pin * 1.5
const float AJUSTE_TURBIDEZ  = 0.0;   // voltios a sumar para que el agua limpia lea ~0 NTU
float FACTOR_BALANZA = 420.0;         // se obtiene con un peso conocido
const unsigned long ANTIRREBOTE_MS = 400;

OneWire oneWire(PIN_TEMP);
DallasTemperature sensorTemp(&oneWire);
HX711 balanza;

volatile unsigned long objetos = 0;
volatile unsigned long ultimoObjeto = 0;

void IRAM_ATTR objetoDetectado() {
  unsigned long ahora = millis();
  if (ahora - ultimoObjeto > ANTIRREBOTE_MS) {
    objetos++;
    ultimoObjeto = ahora;
  }
}

float voltajePromedio(int pin, int muestras = 30) {
  long suma = 0;
  for (int i = 0; i < muestras; i++) {
    suma += analogReadMilliVolts(pin);
    delay(2);
  }
  return (suma / (float)muestras) / 1000.0;
}

float leerTurbidez() {
  float v = voltajePromedio(PIN_TURBIDEZ) * DIVISOR_TURBIDEZ + AJUSTE_TURBIDEZ;
  // Curva del fabricante (válida aprox. entre 2.5 V y 4.2 V).
  if (v >= 4.2) return 0;
  if (v < 2.5) return 3000;
  float ntu = -1120.4 * v * v + 5742.3 * v - 4352.9;
  return max(0.0f, ntu);
}

float leerTDS(float temperatura) {
  float v = voltajePromedio(PIN_TDS);
  float compensado = v / (1.0 + 0.02 * (temperatura - 25.0));
  float tds = (133.42 * pow(compensado, 3) - 255.86 * compensado * compensado + 857.39 * compensado) * 0.5;
  return max(0.0f, tds);
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
  pinMode(PIN_CONTADOR, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_CONTADOR), objetoDetectado, FALLING);
  analogSetAttenuation(ADC_11db);  // rango 0–3.3 V

  sensorTemp.begin();
  balanza.begin(PIN_HX711_DT, PIN_HX711_SCK);
  balanza.set_scale(FACTOR_BALANZA);
  balanza.tare();  // la canasta debe estar vacía al encender

  conectarWiFi();
}

void loop() {
  static unsigned long ultimoEnvio = 0;
  if (millis() - ultimoEnvio < INTERVALO_MS) return;
  ultimoEnvio = millis();

  sensorTemp.requestTemperatures();
  float temperatura = sensorTemp.getTempCByIndex(0);
  bool tempOk = temperatura > -50;  // -127 significa sensor desconectado
  if (!tempOk) temperatura = 25;

  float turbidez = leerTurbidez();
  float tds = leerTDS(temperatura);
  float basura = balanza.is_ready() ? max(0.0f, balanza.get_units(5)) : -1;

  String json = "{";
  json += "\"turbidez_ntu\":" + String(turbidez, 1);
  json += ",\"tds_ppm\":" + String(tds, 0);
  if (tempOk) json += ",\"temperatura_c\":" + String(temperatura, 1);
  if (basura >= 0) json += ",\"basura_g\":" + String(basura, 0);
  json += ",\"objetos\":" + String(objetos);
  json += "}";
  Serial.println(json);

  conectarWiFi();
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVIDOR);
  http.addHeader("Content-Type", "application/json");
  int codigo = http.POST(json);
  if (codigo != 201) Serial.printf("El servidor respondió %d: %s\n", codigo, http.getString().c_str());
  http.end();

  digitalWrite(PIN_LED, HIGH);
  delay(40);
  digitalWrite(PIN_LED, LOW);
}
