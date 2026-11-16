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

let abierto = false;
web.stdout.on("data", (d) => {
  if (!abierto && /Ready in/.test(d.toString())) {
    abierto = true;
    console.log(`\n  Web lista: ${URL_WEB}/#maqueta\n`);
    if (!process.argv.includes("--sin-navegador")) abrirNavegador(`${URL_WEB}/#maqueta`);
  }
});
