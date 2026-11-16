"use client";

import { useState } from "react";
import { useMaqueta } from "./ConexionMaqueta";
import { Interpolado } from "./movimiento";
import { UMBRALES, type Lectura } from "@/lib/maqueta";

const PUNTOS = 60; // 2 minutos, una lectura cada 2 s

function Serie({ lecturas, campo }: { lecturas: Lectura[]; campo: keyof typeof UMBRALES }) {
  const valores = lecturas.map((l) => l[campo] ?? 0);
  const tope = Math.max(UMBRALES[campo] * 1.6, ...valores);
  const y = (v: number) => 100 - (v / tope) * 96;
  const x = (i: number) => ((i + PUNTOS - valores.length) / (PUNTOS - 1)) * 400;
  const linea = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const area = valores.length ? `${linea}L${x(valores.length - 1)} 100L${x(0)} 100Z` : "";
  return (
    <svg className="serie" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden>
      <path className="serie__area" d={area} />
      <path className="serie__linea" d={linea} />
      <line className="serie__limite" x1="0" x2="400" y1={y(UMBRALES[campo])} y2={y(UMBRALES[campo])} />
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
  campo: keyof typeof UMBRALES;
  decimales: number;
  explicacion: string;
}) {
  const { lecturas, ultima } = useMaqueta();
  const v = ultima?.[campo];
  const pasa = v != null && v > UMBRALES[campo];
  return (
    <div className="medida" data-pasa={pasa ? "" : undefined}>
      <h3>{nombre}</h3>
      <p className="medida__valor">
        {v != null ? <Interpolado valor={v} decimales={decimales} /> : "–"}
        <small>{unidad}</small>
      </p>
      <Serie lecturas={lecturas} campo={campo} />
      <p className="medida__pie">
        {explicacion} Límite: {UMBRALES[campo]} {unidad}.
      </p>
    </div>
  );
}

export default function MaquetaEnVivo() {
  const m = useMaqueta();
  const [borrador, setBorrador] = useState<string | null>(null);
  const critico = m.alerta.critico;

  return (
    <div className="maqueta">
      <div className="maqueta__cabeza">
        <p className={`conexion conexion--${m.modo}`} role="status">
          <i aria-hidden />
          {m.modo === "conectando" && "Buscando la maqueta…"}
          {m.modo === "conectado" && !m.simulado && "Maqueta conectada: lecturas reales de los sensores"}
          {m.modo === "conectado" && m.simulado && "Servidor conectado con lecturas simuladas"}
          {m.modo === "demo" && "Modo demostración: la maqueta no está conectada"}
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
          </form>
        </details>
      </div>

      <div className="maqueta__estado" aria-live="polite">
        <h2>{critico ? "Nivel crítico" : m.ultima ? "Agua en buen estado" : "Esperando lecturas"}</h2>
        <p>
          {critico
            ? `La alerta ${m.simulado ? "simulada " : ""}ya salió hacia el grupo de Telegram. Se repite cada 10 minutos mientras el lago siga así.`
            : "Si la turbidez o los sólidos disueltos pasan su límite durante 6 segundos, llega una alerta a los celulares por Telegram."}
        </p>
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

      {m.modo === "demo" && (
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
