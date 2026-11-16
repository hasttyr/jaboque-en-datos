// Ayuda a configurar el bot de Telegram y manda un mensaje de prueba.
// Uso: npm run telegram
import { cargarEnv } from "./env.mjs";
import { leerConfig, enviarTelegram } from "./alertas.mjs";

cargarEnv();
const config = leerConfig();

if (!config.token) {
  console.log(`
  Falta TELEGRAM_TOKEN en iot-server/.env

  1. En Telegram, abre @BotFather y escribe /newbot. Ponle un nombre y te dará un token.
  2. Copia .env.ejemplo como .env y pega el token en TELEGRAM_TOKEN.
  3. Vuelve a correr: npm run telegram
`);
  process.exit(1);
}

if (config.chats.length === 0) {
  const res = await fetch(`https://api.telegram.org/bot${config.token}/getUpdates`);
  const datos = await res.json();
  if (!datos.ok) {
    console.log(`  ✗ Telegram rechazó el token: ${datos.description}`);
    process.exit(1);
  }
  const chats = new Map();
  for (const u of datos.result) {
    const chat = (u.message ?? u.my_chat_member ?? u.channel_post)?.chat;
    if (chat) chats.set(chat.id, chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" "));
  }
  if (chats.size === 0) {
    console.log(`
  El bot todavía no ha recibido mensajes.

  · Crea un grupo en Telegram, agrega al bot y a quienes deben recibir las alertas,
    y escribe cualquier cosa en el grupo (por ejemplo: hola).
  · Vuelve a correr: npm run telegram
`);
    process.exit(1);
  }
  console.log("\n  Chats que le han escrito al bot:\n");
  for (const [id, nombre] of chats) console.log(`    ${id}   ${nombre}`);
  console.log("\n  Copia el número del grupo en TELEGRAM_CHAT_ID dentro de .env y vuelve a correr: npm run telegram\n");
  process.exit(0);
}

const ok = await enviarTelegram(
  config,
  `🧪 Prueba · Humedal Jaboque\nLas alertas de la maqueta llegarán a este chat.\nLímites: turbidez ${config.umbrales.turbidez_ntu} NTU · sólidos disueltos ${config.umbrales.tds_ppm} ppm`,
);
console.log(ok ? "  ✓ Mensaje de prueba enviado. Revisa Telegram." : "  ✗ No se pudo enviar el mensaje de prueba.");
process.exit(ok ? 0 : 1);
