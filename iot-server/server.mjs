// Servidor IoT local de la maqueta del Humedal Jaboque.
//
//   node server.mjs             → espera lecturas reales del ESP32
//   node server.mjs --simular   → además genera lecturas simuladas cada 2 s
//
// El ESP32 envía:   POST http://<ip-del-portátil>:4000/lecturas
//                   {"turbidez_ntu":12.4,"tds_ppm":340,"temperatura_c":18.2,"basura_g":85,"objetos":7}
// La web escucha:   GET  http://localhost:4000/stream   (Server-Sent Events)

import http from "node:http";
import os from "node:os";
import { appendFile } from "node:fs/promises";
import { crearSimulador } from "./simulacion.mjs";

const PUERTO = Number(process.env.PUERTO ?? 4000);
const ARCHIVO = new URL("./lecturas.jsonl", import.meta.url);
const HISTORIAL_MAX = 300;

const CAMPOS = {
  turbidez_ntu: [0, 3000],
  tds_ppm: [0, 5000],
  temperatura_c: [-5, 60],
  basura_g: [0, 50000],
  objetos: [0, 100000],
};

const historial = [];
const clientes = new Set();

function validar(cuerpo) {
  const errores = [];
  const lectura = { ts: new Date().toISOString(), origen: cuerpo.origen === "simulador" ? "simulador" : "maqueta" };
  for (const [campo, [min, max]] of Object.entries(CAMPOS)) {
    const v = Number(cuerpo[campo]);
    if (cuerpo[campo] === undefined) continue; // campo opcional: el sensor puede no estar conectado
    if (!Number.isFinite(v) || v < min || v > max) errores.push(`${campo} debe ser un número entre ${min} y ${max}`);
    else lectura[campo] = Math.round(v * 10) / 10;
  }
  if (Object.keys(lectura).length <= 2) errores.push(`envía al menos uno de: ${Object.keys(CAMPOS).join(", ")}`);
  return { lectura, errores };
}

function registrar(lectura) {
  historial.push(lectura);
  if (historial.length > HISTORIAL_MAX) historial.shift();
  const msg = `event: lectura\ndata: ${JSON.stringify(lectura)}\n\n`;
  for (const res of clientes) res.write(msg);
  appendFile(ARCHIVO, JSON.stringify(lectura) + "\n").catch(() => {});
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Permite que la web pública (https) consulte este servidor en la red local.
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
      const { lectura, errores } = validar(datos);
      if (errores.length) return json(res, 422, { ok: false, errores });
      registrar(lectura);
      console.log(`← ${lectura.origen}`, JSON.stringify(lectura));
      json(res, 201, { ok: true, lectura });
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
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
    });
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

  if (process.argv.includes("--simular")) {
    console.log("  · Modo simulación activo: una lectura cada 2 segundos\n");
    const sim = crearSimulador();
    setInterval(() => registrar({ ts: new Date().toISOString(), origen: "simulador", ...sim.siguiente() }), 2000);
  } else {
    console.log("  · Esperando lecturas del ESP32…\n");
  }
});
