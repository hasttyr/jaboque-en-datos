"use client";

import { useState } from "react";
import { useMaqueta } from "./ConexionMaqueta";
import { Interpolado } from "./movimiento";
import { saturado, LIMITE_SENSOR, type Lectura, type Umbrales } from "@/lib/maqueta";

const PUNTOS = 60; // 2 minutos, una lectura cada 2 s
type Campo = keyof Umbrales;

function Serie({ lecturas, campo, limite }: { lecturas: Lectura[]; campo: Campo; limite: number }) {
  const valores = lecturas.map((l) => l[campo] ?? 0);
  const tope = Math.max(limite * 1.6, ...valores);
  const y = (v: number) => 100 - (v / tope) * 96;
  const x = (i: number) => ((i + PUNTOS - valores.length) / (PUNTOS - 1)) * 400;
  const linea = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const area = valores.length ? `${linea}L${x(valores.length - 1)} 100L${x(0)} 100Z` : "";
  return (
    <svg className="serie" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden>
      <path className="serie__area" d={area} />
      <path className="serie__linea" d={linea} />
      <line className="serie__limite" x1="0" x2="400" y1={y(limite)} y2={y(limite)} />
    </svg>
  );
}

function Medida({
  nombre,
  unidad,
  campo,
  decimales,
  explicacion,
}: {
  nombre: string;
  unidad: string;
  campo: Campo;
  decimales: number;
  explicacion: string;
}) {
  const { lecturas, ultima, umbrales } = useMaqueta();
  const v = ultima?.[campo];
  const limite = umbrales[campo];
  const pasa = v != null && v > limite;
  return (
    <div className="medida" data-pasa={pasa ? "" : undefined}>
      <h3>{nombre}</h3>
      <p className="medida__valor">
        {v == null ? (
          "–"
        ) : saturado(v) ? (
          // El sensor llegó a su tope: el valor real puede ser mayor.
          <>
            <span className="medida__mas">más de</span>
            {LIMITE_SENSOR}
          </>
        ) : (
          <Interpolado valor={v} decimales={decimales} />
        )}
        <small>{unidad}</small>
      </p>
      <Serie lecturas={lecturas} campo={campo} limite={limite} />
      <p className="medida__pie">
        {explicacion} Límite: {limite} {unidad}.
      </p>
    </div>
  );
}

// Qué decir sobre Telegram, sin prometer un mensaje que no salió.
function mensajeEstado(m: ReturnType<typeof useMaqueta>) {
  const critico = m.alerta.critico;
  const regla = "Si la turbidez o los sólidos disueltos pasan su límite durante 3 lecturas seguidas (unos segundos)";
  if (m.modo === "demo")
    return critico
      ? "Con la maqueta conectada, aquí saldría la alerta a Telegram. Esta demostración corre solo en el navegador y no envía mensajes."
      : `Echa tierra o sal para ver qué pasa. ${regla}, la maqueta conectada manda una alerta por Telegram.`;
  if (!m.telegram)
    return critico
      ? "El servidor no tiene Telegram configurado, así que esta alerta no salió. Configúralo con npm run telegram."
      : `${regla}, la maqueta entra en nivel crítico.`;
  if (critico && m.envioTelegram === false)
    return "No se pudo enviar la alerta a Telegram. Revisa que el portátil tenga internet (la zona WiFi del celular debe tener datos).";
  return critico
    ? `La alerta${m.simulado ? ", marcada como simulación," : ""} salió hacia el grupo de Telegram. Si sigue así, llegan un par de recordatorios.`
    : `${regla}, llega una alerta a los celulares por Telegram.`;
}

function textoConexion(m: ReturnType<typeof useMaqueta>) {
  if (m.modo === "conectando") return "Buscando el servidor de la maqueta…";
  if (m.modo === "demo") return "Modo demostración: la maqueta no está conectada";
  if (m.simulado) return "Servidor conectado con lecturas simuladas";
  if (m.esperandoMaqueta) return "Servidor listo, esperando lecturas del ESP32";
  return "Maqueta conectada: lecturas reales de los sensores";
}

export default function MaquetaEnVivo() {
  const m = useMaqueta();
  const [borrador, setBorrador] = useState<string | null>(null);
  const critico = m.alerta.critico;
  const claseConexion = m.modo === "conectado" && m.esperandoMaqueta ? "conectando" : m.modo;

  return (
    <div className="maqueta">
      <div className="maqueta__cabeza">
        <p className={`conexion conexion--${claseConexion}`} role="status">
          <i aria-hidden />
          {textoConexion(m)}
        </p>
        <details className="servidor">
          <summary>Cambiar servidor</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              m.cambiarServidor(borrador ?? m.servidor);
              setBorrador(null);
            }}
          >
            <label htmlFor="servidor">Dirección del servidor de la maqueta</label>
            <div>
              <input
                id="servidor"
                value={borrador ?? m.servidor}
                onChange={(e) => setBorrador(e.target.value)}
                spellCheck={false}
                inputMode="url"
              />
              <button type="submit">Conectar</button>
            </div>
            <p className="servidor__nota">
              Desde la web publicada, el navegador solo deja conectarse a http://localhost:4000. Para usar otra
              dirección, abre la web desde el portátil en http://localhost:3000.
            </p>
          </form>
        </details>
      </div>

      <div className="maqueta__estado" aria-live="polite">
        <h2>{critico ? "Nivel crítico" : m.ultima ? "Agua en buen estado" : "Esperando lecturas"}</h2>
        <p>{mensajeEstado(m)}</p>
      </div>

      <div className="maqueta__medidas">
        <Medida
          nombre="Turbidez"
          unidad="NTU"
          campo="turbidez_ntu"
          decimales={1}
          explicacion="Qué tan sucia se ve el agua: tierra, sedimentos y lodo."
        />
        <Medida
          nombre="Sólidos disueltos"
          unidad="ppm"
          campo="tds_ppm"
          decimales={0}
          explicacion="Lo que no se ve: sales, jabones y químicos disueltos."
        />
      </div>

      {m.demo && (
        <div className="maqueta__acciones" role="group" aria-label="Probar la maqueta simulada">
          <button type="button" onClick={m.demo.tierra}>
            Echar tierra
          </button>
          <button type="button" onClick={m.demo.sal}>
            Echar sal
          </button>
          <button type="button" className="secundario" onClick={m.demo.limpiar}>
            Cambiar el agua
          </button>
        </div>
      )}

      <ol className="recorrido-datos" aria-label="Cómo viajan los datos">
        <li>Dos sondas en el agua miden turbidez y sólidos disueltos.</li>
        <li>Un ESP32 las lee y envía una lectura por WiFi cada 2 segundos.</li>
        <li>Un portátil recibe las lecturas y decide si hay alerta.</li>
        <li>Esta página las muestra y Telegram avisa a los celulares.</li>
      </ol>
    </div>
  );
}
