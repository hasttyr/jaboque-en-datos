// Servidor IoT local de la maqueta del Humedal Jaboque.
//
//   node server.mjs             → espera lecturas reales del ESP32
//   node server.mjs --simular   → además genera lecturas simuladas cada 2 s.
//                                 La web puede echar tierra o sal: POST /simular/tierra | sal | limpiar
//
// El ESP32 envía:   POST http://<ip-del-portátil>:4000/lecturas
//                   {"turbidez_ntu":12.4,"tds_ppm":90}
// Si el lago llega a nivel crítico, avisa por Telegram (ver alertas.mjs y .env.ejemplo).
// La web escucha:   GET  http://localhost:4000/stream   (Server-Sent Events)

import http from "node:http";
import os from "node:os";
import { appendFile } from "node:fs/promises";
import { crearSimulador } from "./simulacion.mjs";
import { cargarEnv } from "./env.mjs";
import { crearAlertas, enviarTelegram, leerConfig } from "./alertas.mjs";

cargarEnv();
const configAlertas = leerConfig();
// Cada mensaje a Telegram le avisa a la web si salió o no (por ejemplo, si el portátil no tiene internet).
const alertas = crearAlertas(configAlertas, async (texto) => {
  if (!alertas.activa) return; // sin Telegram configurado, la alerta solo queda en la consola
  const ok = await enviarTelegram(configAlertas, texto);
  difundir("telegram", { ok, ts: new Date().toISOString() });
});

const PUERTO = Number(process.env.PUERTO ?? 4000);
const ARCHIVO = new URL("./lecturas.jsonl", import.meta.url);
const HISTORIAL_MAX = 300;

const CAMPOS = {
  turbidez_ntu: [0, 3000],
  tds_ppm: [0, 5000],
};

const sim = process.argv.includes("--simular") ? crearSimulador() : null;
const historial = [];
const clientes = new Set();

function validar(cuerpo) {
  const errores = [];
  const lectura = { ts: new Date().toISOString(), origen: cuerpo.origen === "simulador" ? "simulador" : "maqueta" };
  for (const [campo, [min, max]] of Object.entries(CAMPOS)) {
    const v = Number(cuerpo[campo]);
    if (cuerpo[campo] === undefined) continue; // un sensor puede estar desconectado
    if (!Number.isFinite(v) || v < min || v > max) errores.push(`${campo} debe ser un número entre ${min} y ${max}`);
    else lectura[campo] = Math.round(v * 10) / 10;
  }
  if (Object.keys(lectura).length <= 2) errores.push(`envía al menos uno de: ${Object.keys(CAMPOS).join(", ")}`);
  return { lectura, errores };
}

function difundir(evento, datos) {
  const msg = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`;
  for (const res of clientes) res.write(msg);
}

function registrar(lectura) {
  historial.push(lectura);
  if (historial.length > HISTORIAL_MAX) historial.shift();
  appendFile(ARCHIVO, JSON.stringify(lectura) + "\n").catch(() => {});
  alertas.evaluar(lectura);
  // La web muestra el estado crítico que decide el servidor: así coincide con Telegram y la pantalla.
  difundir("lectura", { ...lectura, critico: alertas.estado().critico });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Para que Chrome deje que una página de internet consulte este servidor local. Aun así, el
  // navegador puede pedir permiso de "red local": por eso conviene presentar desde http://localhost:3000.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function json(res, codigo, datos) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(datos));
}

const servidor = http.createServer((req, res) => {
  cors(res);
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") return res.writeHead(204).end();

  if (req.method === "POST" && url.pathname === "/lecturas") {
    let cuerpo = "";
    req.on("data", (c) => {
      cuerpo += c;
      if (cuerpo.length > 10_000) req.destroy();
    });
    req.on("end", () => {
      let datos;
      try {
        datos = JSON.parse(cuerpo);
      } catch {
        return json(res, 400, { ok: false, error: "El cuerpo no es JSON válido" });
      }
      if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        return json(res, 400, { ok: false, error: "El cuerpo debe ser un objeto JSON" });
      }
      const { lectura, errores } = validar(datos);
      if (errores.length) return json(res, 422, { ok: false, errores });
      registrar(lectura);
      console.log(`← ${lectura.origen}`, JSON.stringify(lectura));
      // critico: lo usa la pantalla de la maqueta para mostrar el mismo estado que la web.
      json(res, 201, { ok: true, lectura, critico: alertas.estado().critico });
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // Lo que la web necesita saber de este servidor: si simula (para mostrar los botones), si manda
    // a Telegram, sus límites (pueden cambiar en .env) y si el lago ya está en nivel crítico.
    const { critico, umbrales, repetirMin, maxRecordatorios } = alertas.estado();
    const config = { simulando: Boolean(sim), telegram: alertas.activa, umbrales, critico, repetirMin, maxRecordatorios };
    res.write(`event: config\ndata: ${JSON.stringify(config)}\n\n`);
    res.write(`event: historial\ndata: ${JSON.stringify(historial.slice(-60))}\n\n`);
    clientes.add(res);
    const latido = setInterval(() => res.write(": latido\n\n"), 15000);
    req.on("close", () => {
      clearInterval(latido);
      clientes.delete(res);
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/lecturas") {
    return json(res, 200, { ok: true, lecturas: historial.slice(-Number(url.searchParams.get("n") ?? 60)) });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      ok: true,
      servicio: "Maqueta Humedal Jaboque",
      lecturas_recibidas: historial.length,
      ultima: historial.at(-1) ?? null,
      clientes_conectados: clientes.size,
      alerta: alertas.estado(),
    });
  }

  // Solo en modo simulación: los botones de la web echan tierra o sal al lago simulado.
  const accion = url.pathname.match(/^\/simular\/(tierra|sal|limpiar)$/)?.[1];
  if (req.method === "POST" && accion) {
    if (!sim) return json(res, 409, { ok: false, error: "El servidor no está simulando. Usa npm run demo" });
    sim[accion]();
    registrar({ ts: new Date().toISOString(), origen: "simulador", ...sim.siguiente(false) });
    return json(res, 201, { ok: true });
  }

  json(res, 404, { ok: false, error: "Ruta no encontrada. Usa POST /lecturas o GET /stream" });
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log(`\n  Servidor de la maqueta listo en el puerto ${PUERTO}`);
  console.log(`  · Web (este portátil):  http://localhost:${PUERTO}/stream`);
  for (const ip of ips) console.log(`  · ESP32 (misma WiFi):   http://${ip}:${PUERTO}/lecturas`);
  const { turbidez_ntu, tds_ppm } = alertas.estado().umbrales;
  console.log(
    alertas.activa
      ? `  · Alertas por Telegram activas (turbidez > ${turbidez_ntu} NTU o sólidos disueltos > ${tds_ppm} ppm)`
      : "  · Alertas por Telegram apagadas: configura iot-server/.env (npm run telegram)",
  );

  if (sim) {
    console.log("  · Modo simulación activo: una lectura cada 2 segundos\n");
    setInterval(() => registrar({ ts: new Date().toISOString(), origen: "simulador", ...sim.siguiente() }), 2000);
  } else {
    console.log("  · Esperando lecturas del ESP32…\n");
  }
});
