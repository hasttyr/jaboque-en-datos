// Levanta todo el proyecto en este portátil con un solo comando:
//   npm start      → servidor de la maqueta (espera al ESP32) + web
//   npm run demo   → igual, pero el servidor genera lecturas simuladas
//   --sin-navegador → no abre el navegador al final
//
// Instala las dependencias de la web si faltan, muestra la salida de ambos
// con un prefijo, abre el navegador cuando la web está lista y, con Ctrl+C,
// apaga todo.

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";

const simular = process.argv.includes("--simular");
const raiz = new URL(".", import.meta.url);
const ruta = (p) => new URL(p, raiz).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const URL_WEB = "http://localhost:3000";

const colores = { servidor: "\x1b[36m", web: "\x1b[35m" };
const procesos = [];

function correr(nombre, carpeta, comando) {
  const hijo = spawn(comando, { cwd: ruta(carpeta), shell: true, env: { ...process.env, FORCE_COLOR: "1" } });
  procesos.push(hijo);
  const prefijo = `${colores[nombre]}[${nombre}]\x1b[0m `;
  const escribir = (datos) => {
    for (const linea of datos.toString().split(/\r?\n/)) if (linea.trim()) console.log(prefijo + linea);
  };
  hijo.stdout.on("data", escribir);
  hijo.stderr.on("data", escribir);
  hijo.on("exit", (codigo) => {
    console.log(`${prefijo}terminó (código ${codigo ?? "?"})`);
    apagar();
  });
  return hijo;
}

let apagando = false;
function apagar() {
  if (apagando) return;
  apagando = true;
  for (const p of procesos) {
    if (p.exitCode !== null) continue;
    try {
      // En Windows hay que matar el árbol completo (npm → node → next).
      if (process.platform === "win32") execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: "ignore" });
      else p.kill("SIGINT");
    } catch {}
  }
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", apagar);
process.on("SIGTERM", apagar);

function abrirNavegador(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {}
}

if (!existsSync(ruta("web/node_modules"))) {
  console.log("Instalando las dependencias de la web (solo la primera vez)…");
  execSync("npm install", { cwd: ruta("web"), stdio: "inherit" });
}

console.log(`\nJaboque en datos: ${simular ? "modo demostración (lecturas simuladas)" : "esperando lecturas del ESP32"}. Ctrl+C para apagar todo.\n`);

correr("servidor", "iot-server/", simular ? "npm run demo" : "npm start");
const web = correr("web", "web/", "npm run dev");

// Next dice "Ready" antes de revisar si ya hay otro servidor de la web corriendo,
// así que se espera un momento antes de anunciarla y abrir el navegador.
let listo;
let conflicto = false;
function vigilarWeb(d) {
  const texto = d.toString().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""); // sin códigos de color
  if (!listo && !conflicto && /Ready in/.test(texto)) {
    listo = setTimeout(() => {
      console.log(`\n  Web lista: ${URL_WEB}/#maqueta\n`);
      if (!process.argv.includes("--sin-navegador")) abrirNavegador(`${URL_WEB}/#maqueta`);
    }, 2500);
  }
  if (/Another next dev server is already running/.test(texto)) {
    conflicto = true;
    clearTimeout(listo);
  }
  const pid = conflicto && texto.match(/PID:\s+(\d+)/)?.[1];
  if (pid) {
    const cerrar = process.platform === "win32" ? `taskkill /PID ${pid} /T /F` : `kill ${pid}`;
    console.log(`
  ✗ Ya hay otra copia de la web corriendo (proceso ${pid}), quizá de una terminal que quedó abierta.
    Ciérrala con:  ${cerrar}
    y vuelve a correr este comando.
`);
  }
}
// Next escribe unos avisos por la salida normal y otros por la de errores.
web.stdout.on("data", vigilarWeb);
web.stderr.on("data", vigilarWeb);
