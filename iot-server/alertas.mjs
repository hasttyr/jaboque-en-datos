// Alertas por Telegram cuando el lago llega a un nivel crítico de contaminación.
//
// Reglas, para que no llegue spam:
//  · Se dispara cuando un valor pasa su límite durante 3 lecturas seguidas (6 s).
//    Así una burbuja o un movimiento brusco del sensor no manda una alerta falsa.
//  · Mientras siga crítico, manda un recordatorio cada REPETIR_MIN minutos, como máximo
//    MAX_RECORDATORIOS veces (para no escribirle al grupo toda la tarde si el agua queda sucia).
//  · Cuando baja del 80 % del límite, avisa que volvió a la normalidad.
//
// Configuración en iot-server/.env (ver .env.ejemplo).

const MINUTO = 60_000;

export function leerConfig(env = process.env) {
  return {
    token: env.TELEGRAM_TOKEN?.trim() || "",
    chats: (env.TELEGRAM_CHAT_ID ?? "").split(",").map((c) => c.trim()).filter(Boolean),
    umbrales: {
      turbidez_ntu: Number(env.UMBRAL_TURBIDEZ ?? 50),
      tds_ppm: Number(env.UMBRAL_TDS ?? 500),
    },
    repetirMin: Number(env.REPETIR_MIN ?? 10),
    maxRecordatorios: Number(env.MAX_RECORDATORIOS ?? 2),
  };
}

const NOMBRES = {
  turbidez_ntu: ["Turbidez", "NTU"],
  tds_ppm: ["Sólidos disueltos", "ppm"],
};

// Lo máximo que miden los sensores de la maqueta. En el tope, el valor real puede ser mayor.
const LIMITE_SENSOR = 1000;
const valor = (v) => (v >= LIMITE_SENSOR ? `más de ${LIMITE_SENSOR}` : String(Math.round(v)));

const LECTURAS_SEGUIDAS = 3;
const HISTERESIS = 0.8;

export async function enviarTelegram(config, texto) {
  const { token, chats } = config;
  if (!token || chats.length === 0) return false;
  const enviar = (chat_id) =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text: texto }),
      signal: AbortSignal.timeout(8000),
    });
  const resultados = await Promise.all(
    chats.map(async (chat_id, i) => {
      try {
        let res = await enviar(chat_id);
        let datos = res.ok ? null : await res.json().catch(() => ({}));
        // Telegram convierte un grupo en "supergrupo" (por ejemplo, al nombrar administrador al bot)
        // y le cambia el número. Se usa el nuevo de inmediato y se avisa para actualizar el .env.
        const nuevo = datos?.parameters?.migrate_to_chat_id;
        if (nuevo) {
          console.log(`  ⚠ El grupo ${chat_id} ahora es un supergrupo con el número ${nuevo}.`);
          console.log(`    Pon TELEGRAM_CHAT_ID=${nuevo} en iot-server/.env para la próxima vez.`);
          config.chats[i] = String(nuevo);
          res = await enviar(nuevo);
          datos = res.ok ? null : await res.json().catch(() => ({}));
        }
        if (!res.ok) console.log(`  ✗ Telegram (${config.chats[i]}) respondió ${res.status}: ${JSON.stringify(datos)}`);
        return res.ok;
      } catch (e) {
        console.log(`  ✗ No se pudo enviar a Telegram (${chat_id}): ${e.message}`);
        return false;
      }
    }),
  );
  return resultados.some(Boolean);
}

function hora(fecha = new Date()) {
  return fecha.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
}

function lineas(lectura, umbrales, marcar) {
  return Object.entries(NOMBRES)
    .filter(([campo]) => lectura[campo] != null)
    .map(([campo, [nombre, unidad]]) => {
      const pasa = lectura[campo] > umbrales[campo];
      return `${marcar && pasa ? "⚠️ " : ""}${nombre}: ${valor(lectura[campo])} ${unidad} (límite ${umbrales[campo]})`;
    });
}

export function crearAlertas(config = leerConfig(), enviar = (t) => enviarTelegram(config, t)) {
  const { umbrales, repetirMin, maxRecordatorios } = config;
  let seguidas = 0;
  let critico = false;
  let desde = 0;
  let ultimoAviso = 0;
  let recordatorios = 0;

  return {
    activa: Boolean(config.token && config.chats.length),
    estado: () => ({ critico, desde: critico ? new Date(desde).toISOString() : null, umbrales, repetirMin, maxRecordatorios }),

    evaluar(lectura, ahora = Date.now()) {
      const campos = Object.keys(NOMBRES).filter((c) => lectura[c] != null);
      if (campos.length === 0) return null;
      const pasa = campos.some((c) => lectura[c] > umbrales[c]);
      const normal = campos.every((c) => lectura[c] < umbrales[c] * HISTERESIS);
      const origen = lectura.origen === "simulador" ? " (simulación)" : "";

      seguidas = pasa ? seguidas + 1 : 0;

      let texto = null;
      if (!critico && seguidas >= LECTURAS_SEGUIDAS) {
        critico = true;
        desde = ahora;
        ultimoAviso = ahora;
        recordatorios = 0;
        texto = [`🚨 ALERTA · Humedal Jaboque${origen}`, "Nivel crítico de contaminación", ...lineas(lectura, umbrales, true), hora()].join("\n");
      } else if (critico && normal) {
        critico = false;
        const min = Math.max(1, Math.round((ahora - desde) / MINUTO));
        texto = [`✅ Humedal Jaboque volvió a la normalidad${origen}`, ...lineas(lectura, umbrales, false), `Estuvo en nivel crítico ${min} min`, hora()].join("\n");
      } else if (critico && pasa && recordatorios < maxRecordatorios && ahora - ultimoAviso >= repetirMin * MINUTO) {
        ultimoAviso = ahora;
        recordatorios++;
        const min = Math.round((ahora - desde) / MINUTO);
        texto = [`⏰ Sigue en nivel crítico hace ${min} min${origen}`, ...lineas(lectura, umbrales, true), hora()].join("\n");
      }

      if (texto) {
        console.log(`\n${texto}\n`);
        enviar(texto);
      }
      return texto;
    },
  };
}
