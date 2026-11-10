"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { crearSimulador, type Lectura } from "@/lib/simulacion";
import { Interpolado } from "./movimiento";
import dynamic from "next/dynamic";
import { usePuede3D } from "./3d/soporte";
import type { EstadoLago } from "./3d/Lago3D";

const Lago3D = dynamic(() => import("./3d/Lago3D"), { ssr: false });

type Modo = "conectando" | "conectado" | "demo";

const SERVIDOR_POR_DEFECTO = "http://localhost:4000";
const MAX_PUNTOS = 60;

function leerServidor() {
  try {
    return localStorage.getItem("servidor-maqueta") || SERVIDOR_POR_DEFECTO;
  } catch {
    return SERVIDOR_POR_DEFECTO;
  }
}

function estadoAgua(ntu?: number) {
  if (ntu == null) return "Sin dato";
  if (ntu < 10) return "Agua clara";
  if (ntu < 50) return "Agua turbia";
  return "Agua muy turbia";
}

// Posiciones fijas (pseudoaleatorias) para la basura flotante del lago.
const POSICIONES = Array.from({ length: 48 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  const r = 0.15 + 0.8 * Math.sqrt(a - Math.floor(a));
  const t = (b - Math.floor(b)) * Math.PI * 2;
  return { x: 200 + Math.cos(t) * r * 160, y: 120 + Math.sin(t) * r * 72, giro: (i * 47) % 180, ancho: 6 + (i % 4) * 3 };
});

export default function MaquetaEnVivo() {
  const [modo, setModo] = useState<Modo>("conectando");
  const [servidor, setServidor] = useState(SERVIDOR_POR_DEFECTO);
  const [borrador, setBorrador] = useState(SERVIDOR_POR_DEFECTO);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const fuente = useRef<EventSource | null>(null);
  const sim = useRef(crearSimulador());
  const forzar = useRef(false);
  const puede3D = usePuede3D();
  const escena = useRef<HTMLElement>(null);
  const estadoLago = useRef<EstadoLago>({ turbidez: 8, tds: 180, basura: 0, objetos: 0, lecturas: 0, demo: false, activo: false });
  const alArrojar = useRef<((x: number, z: number) => void) | null>(null);

  const agregar = useCallback((nuevas: Lectura[]) => {
    setLecturas((prev) => [...prev, ...nuevas].slice(-MAX_PUNTOS));
  }, []);

  const conectar = useCallback(
    (url: string) => {
      fuente.current?.close();
      setModo("conectando");
      let abierta = false;
      let es: EventSource;
      try {
        es = new EventSource(`${url.replace(/\/$/, "")}/stream`);
      } catch {
        setModo("demo");
        return;
      }
      fuente.current = es;
      es.addEventListener("historial", (ev) => {
        abierta = true;
        setModo("conectado");
        setLecturas((JSON.parse((ev as MessageEvent).data) as Lectura[]).slice(-MAX_PUNTOS));
      });
      es.addEventListener("lectura", (ev) => agregar([JSON.parse((ev as MessageEvent).data)]));
      let plazo: ReturnType<typeof setTimeout> | undefined;
      const pasarADemo = () => {
        es.close();
        setModo("demo");
        setLecturas([]);
      };
      es.onopen = () => {
        clearTimeout(plazo);
        plazo = undefined;
      };
      es.onerror = () => {
        if (!abierta) return pasarADemo();
        // Se cayó después de conectar: EventSource reintenta solo; si en 6 s no vuelve, modo demo.
        setModo("conectando");
        plazo ??= setTimeout(() => {
          if (es.readyState !== EventSource.OPEN) pasarADemo();
        }, 6000);
      };
    },
    [agregar],
  );

  useEffect(() => {
    const url = leerServidor();
    setServidor(url);
    setBorrador(url);
    conectar(url);
    return () => fuente.current?.close();
  }, [conectar]);

  // Modo demo: genera lecturas en el navegador y reintenta la conexión cada 20 s.
  useEffect(() => {
    if (modo !== "demo") return;
    const tick = setInterval(() => {
      const l = sim.current.siguiente(forzar.current);
      forzar.current = false;
      agregar([{ ts: new Date().toISOString(), origen: "demo", ...l }]);
    }, 2000);
    const reintento = setInterval(() => conectar(servidor), 20000);
    return () => {
      clearInterval(tick);
      clearInterval(reintento);
    };
  }, [modo, servidor, agregar, conectar]);

  // En modo demostración, arrojar genera la lectura al instante (el objeto cae ya, no en el próximo ciclo).
  const arrojarAhora = useCallback(() => {
    if (modo !== "demo") return;
    const l = sim.current.siguiente(true);
    agregar([{ ts: new Date().toISOString(), origen: "demo", ...l }]);
  }, [modo, agregar]);

  useEffect(() => {
    const alTocar = () => arrojarAhora();
    window.addEventListener("lago:arrojar", alTocar);
    return () => window.removeEventListener("lago:arrojar", alTocar);
  }, [arrojarAhora]);

  // La escena 3D solo dibuja mientras la sección está en pantalla.
  useEffect(() => {
    const el = escena.current;
    if (!el) return;
    const io = new IntersectionObserver(([x]) => (estadoLago.current.activo = x.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [puede3D]);

  function guardarServidor(e: React.FormEvent) {
    e.preventDefault();
    const url = borrador.trim() || SERVIDOR_POR_DEFECTO;
    try {
      localStorage.setItem("servidor-maqueta", url);
    } catch {}
    setServidor(url);
    conectar(url);
  }

  const ultima = lecturas.at(-1);

  useEffect(() => {
    const e = estadoLago.current;
    if (ultima?.turbidez_ntu != null) e.turbidez = ultima.turbidez_ntu;
    if (ultima?.tds_ppm != null) e.tds = ultima.tds_ppm;
    if (ultima?.basura_g != null) e.basura = ultima.basura_g;
    if (ultima?.objetos != null) e.objetos = ultima.objetos;
    if (ultima) e.lecturas += 1;
    e.demo = modo === "demo";
  }, [ultima, modo]);
  const simulado = modo === "demo" || ultima?.origen === "simulador";
  const turbidez = ultima?.turbidez_ntu ?? 8;
  const mezcla = Math.min(100, Math.round((Math.log10(Math.max(1, turbidez)) / Math.log10(300)) * 100));
  const objetos = ultima?.objetos ?? 0;

  const serie = lecturas.map((l) => l.turbidez_ntu ?? 0);
  const maxSerie = Math.max(60, ...serie);
  const linea = serie
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (MAX_PUNTOS - 1)) * 400} ${100 - (v / maxSerie) * 92}`)
    .join("");

  return (
    <div className="maqueta">
      <div className="maqueta__barra">
        <p className={`estado estado--${modo}`} role="status">
          <span aria-hidden />
          {modo === "conectando" && `Buscando el servidor de la maqueta en ${servidor}…`}
          {modo === "conectado" && !simulado && "Maqueta conectada. Lecturas reales de los sensores."}
          {modo === "conectado" && simulado && "Servidor local conectado. Está enviando lecturas simuladas."}
          {modo === "demo" && "Modo demostración: no encontramos la maqueta, así que estas lecturas son simuladas."}
        </p>
        <form className="servidor" onSubmit={guardarServidor}>
          <label htmlFor="servidor">Servidor</label>
          <input
            id="servidor"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            spellCheck={false}
            inputMode="url"
          />
          <button type="submit">Conectar</button>
        </form>
      </div>

      <div className="maqueta__cuerpo">
        <figure className="lago" ref={escena}>
          {puede3D ? (
            <div className="lago__escena" data-demo={modo === "demo" ? "" : undefined}>
              <Lago3D estado={estadoLago} alArrojar={alArrojar} />
            </div>
          ) : (
          <svg viewBox="0 0 400 240" role="img" aria-label={`${estadoAgua(ultima?.turbidez_ntu)} con ${objetos} objetos flotando`}>
            <path
              className="lago__orilla"
              d="M40 118C34 70 98 38 170 42c40 2 58-14 104-8 66 8 100 44 92 86-7 38-52 70-118 76-34 3-52 16-96 10C86 200 46 166 40 118Z"
            />
            <path
              className="lago__agua"
              style={{ fill: `color-mix(in oklab, var(--espejo) ${100 - mezcla}%, var(--lodo))` }}
              d="M52 118C48 78 104 52 170 55c40 2 58-12 102-6 58 8 88 38 82 72-6 32-46 58-106 64-34 3-52 14-92 9C92 188 56 158 52 118Z"
            />
            {POSICIONES.slice(0, Math.min(objetos, POSICIONES.length)).map((p, i) => (
              <g key={i} transform={`translate(${p.x} ${p.y})`}>
                <circle className="lago__onda" r="14" />
                <g
                  className="lago__flota"
                  style={{ "--fase": `${(i % 7) * -0.6}s`, "--dur": `${3 + (i % 5) * 0.7}s` } as React.CSSProperties}
                >
                  <rect
                    className="lago__basura"
                    x={-p.ancho / 2}
                    y={-2}
                    width={p.ancho}
                    height={4}
                    rx={1.5}
                    transform={`rotate(${p.giro})`}
                  />
                </g>
              </g>
            ))}
          </svg>
          )}
          <figcaption>
            {estadoAgua(ultima?.turbidez_ntu)}
            {!puede3D && objetos > POSICIONES.length && `, ${objetos - POSICIONES.length} objetos más fuera de vista`}
            {puede3D && modo === "demo" && <span className="lago__pista">Toca el agua para arrojar un objeto</span>}
          </figcaption>
          {modo === "demo" && (
            <button type="button" className="boton-primario boton-arrojar" onClick={arrojarAhora}>
              Arrojar un objeto al lago
            </button>
          )}
        </figure>

        <dl className="lecturas">
          <div>
            <dt>Turbidez</dt>
            <dd>
              {ultima?.turbidez_ntu != null ? <Interpolado valor={ultima.turbidez_ntu} decimales={1} /> : "–"}
              <small>NTU</small>
            </dd>
          </div>
          <div>
            <dt>Sólidos disueltos</dt>
            <dd>
              {ultima?.tds_ppm != null ? <Interpolado valor={ultima.tds_ppm} decimales={0} /> : "–"}
              <small>ppm</small>
            </dd>
          </div>
          <div>
            <dt>Temperatura</dt>
            <dd>
              {ultima?.temperatura_c != null ? <Interpolado valor={ultima.temperatura_c} decimales={1} /> : "–"}
              <small>°C</small>
            </dd>
          </div>
          <div>
            <dt>Basura recogida</dt>
            <dd>
              {ultima?.basura_g != null ? <Interpolado valor={ultima.basura_g} decimales={0} /> : "–"}
              <small>g</small>
            </dd>
          </div>
          <div>
            <dt>Objetos arrojados</dt>
            <dd>{ultima?.objetos != null ? <Interpolado valor={ultima.objetos} duracion={400} /> : "–"}</dd>
          </div>
          <div className="lecturas__serie">
            <dt>Turbidez, últimos 2 minutos</dt>
            <dd>
              <svg viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden>
                <path d={linea} />
              </svg>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
