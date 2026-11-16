import { fileURLToPath } from "node:url";

// Lee iot-server/.env si existe (Node 20.12 o superior).
export function cargarEnv() {
  try {
    process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
  } catch {}
}
