// Finge ser el ESP32: envía lecturas por HTTP al servidor, igual que lo hará la maqueta.
// Uso: node simulador.mjs [http://localhost:4000]
import { crearSimulador } from "./simulacion.mjs";

const destino = (process.argv[2] ?? "http://localhost:4000") + "/lecturas";
const sim = crearSimulador();
console.log(`Enviando lecturas simuladas a ${destino} cada 2 s (Ctrl+C para parar)`);

setInterval(async () => {
  const lectura = { ...sim.siguiente(), origen: "simulador" };
  try {
    const res = await fetch(destino, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lectura),
    });
    console.log(res.status, JSON.stringify(lectura));
  } catch {
    console.log("✗ No hay servidor en", destino, "— ¿corriste `npm start`?");
  }
}, 2000);
