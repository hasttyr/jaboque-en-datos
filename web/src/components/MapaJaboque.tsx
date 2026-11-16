"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DatosJaboque } from "@/lib/datos";
import type { EstadoTiempo } from "./3d/Jaboque3D";
import { usePuede3D } from "./3d/soporte";
import { usePantallaActiva } from "./Estacion";
import { useMenosMovimiento } from "./movimiento";

const Jaboque3D = dynamic(() => import("./3d/Jaboque3D"), { ssr: false });

const COBERTURAS: { clave: string; nombre: string; color: string }[] = [
  { clave: "Espejo de Agua", nombre: "Espejo de agua", color: "#3fb6e8" },
  { clave: "Vegetación Acuática", nombre: "Vegetación acuática", color: "#17b890" },
  { clave: "Vegetación Herbácea", nombre: "Vegetación herbácea", color: "#9bd36a" },
  { clave: "Arbustales", nombre: "Arbustales", color: "#2e8f5e" },
  { clave: "Pastos", nombre: "Pastos", color: "#6b7a4a" },
  { clave: "Areas Endurecidas", nombre: "Suelo endurecido", color: "#f2f2ee" },
];

const CEMENTO = "Areas Endurecidas";
const DURACION = 9000; // ms para recorrer 1952 → 2014
const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

// La línea de tiempo se reparte así: una pausa en cada año y dos transiciones.
const TRAMOS = [
  { desde: 0.08, hasta: 0.46 },
  { desde: 0.54, hasta: 0.92 },
];
const MARCAS = [0.04, 0.5, 0.96]; // dónde cae cada año

const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function estadoEn(p: number) {
  if (p < TRAMOS[0].desde) return { tramo: 0, t: 0 };
  if (p <= TRAMOS[0].hasta) return { tramo: 0, t: (p - TRAMOS[0].desde) / (TRAMOS[0].hasta - TRAMOS[0].desde) };
  if (p < TRAMOS[1].desde) return { tramo: 1, t: 0 };
  if (p <= TRAMOS[1].hasta) return { tramo: 1, t: (p - TRAMOS[1].desde) / (TRAMOS[1].hasta - TRAMOS[1].desde) };
  return { tramo: 1, t: 1 };
}

// Mapa 2D (sin WebGL): un año se funde en el siguiente.
const Capas = memo(function Capas({ datos }: { datos: DatosJaboque }) {
  const { ancho: W, alto: H } = datos;
  return (
    <>
      {datos.periodos.map((p, i) => (
        <svg key={p} viewBox={`0 0 ${W} ${H}`} className="jaboque__capa" style={{ opacity: `var(--o${i})` }} aria-hidden>
          {COBERTURAS.map((c) => {
            const capa = datos.capas[p].find((x) => x.cobertura === c.clave);
            return capa ? <path key={c.clave} d={capa.d} fill={c.color} /> : null;
          })}
        </svg>
      ))}
    </>
  );
});

type Reproduccion = "auto" | "play" | "pausa";

export default function MapaJaboque({ datos }: { datos: DatosJaboque }) {
  const periodos = datos.periodos;
  const anios = periodos.map(Number);
  const activa = usePantallaActiva() === "jaboque";
  const menos = useMenosMovimiento();
  const puede3D = usePuede3D();
  const [listo3D, setListo3D] = useState(false);
  const alListo3D = useCallback(() => setListo3D(true), []);

  // Sin JavaScript (y en el servidor) se muestra 2014. La primera visita reproduce la historia completa.
  const [p, setP] = useState(1);
  const [reproduccion, setReproduccion] = useState<Reproduccion>("auto");
  const sonando = reproduccion === "play" || (reproduccion === "auto" && activa && !menos);
  const pActual = useRef(p);
  useEffect(() => {
    pActual.current = p;
  });

  useEffect(() => {
    if (!sonando) return;
    const p0 = reproduccion === "auto" || pActual.current >= 1 ? 0 : pActual.current;
    let raf = 0;
    let t0 = 0;
    const paso = (t: number) => {
      t0 ||= t;
      const siguiente = Math.min(1, p0 + (t - t0) / DURACION);
      setP(siguiente);
      if (siguiente < 1) raf = requestAnimationFrame(paso);
      else setReproduccion("pausa");
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [sonando, reproduccion]);

  const { tramo, t } = estadoEn(p);
  const e = suave(t);
  const desde = periodos[tramo];
  const hacia = periodos[tramo + 1];
  const ha = (clave: string, per: string) => datos.capas[per].find((c) => c.cobertura === clave)?.ha ?? 0;
  const haEn = (clave: string) => ha(clave, desde) + (ha(clave, hacia) - ha(clave, desde)) * e;
  const max = Math.max(...periodos.flatMap((per) => datos.capas[per].map((c) => c.ha)));
  const anio = Math.round(anios[tramo] + (anios[tramo + 1] - anios[tramo]) * e);
  const final = periodos[periodos.length - 1];

  // La escena 3D lee este objeto en cada cuadro, sin pasar por React.
  const estado3D = useRef<EstadoTiempo>({ tramo: 1, avance: 1, progreso: 1, brillo: 0, activo: false });
  useEffect(() => {
    Object.assign(estado3D.current, { tramo, avance: e, progreso: p, brillo: t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0, activo: activa });
  });

  const opacidades = Object.fromEntries(
    periodos.map((_, i) => [`--o${i}`, i === tramo ? 1 : i === tramo + 1 ? e : 0]),
  ) as React.CSSProperties;

  return (
    <div className="jaboque" data-3d={puede3D && listo3D ? "" : undefined}>
      {puede3D && <Jaboque3D datos={datos} estado={estado3D} alListo={alListo3D} />}

      <figure className="jaboque__mapa" aria-label={`Mapa de coberturas del Humedal Jaboque en ${anio}`} role="img">
        <div className="jaboque__lienzo" style={{ aspectRatio: `${datos.ancho} / ${datos.alto}`, ...opacidades }}>
          <Capas datos={datos} />
        </div>
      </figure>

      <div className="jaboque__texto">
        <h1 className="jaboque__titulo">
          <span className="cifra" aria-hidden>
            {fmt.format(haEn(CEMENTO))}
            <small>ha</small>
          </span>
          <span className="jaboque__frase" aria-hidden>
            del humedal eran suelo endurecido en <span className="jaboque__anio">{anio}</span>
          </span>
          <span className="sr-only">
            {fmt.format(ha(CEMENTO, final))} hectáreas del Humedal Jaboque eran suelo endurecido en {final}
          </span>
        </h1>
        <p className="jaboque__intro">
          Jaboque, en Engativá, es el segundo humedal más grande de Bogotá. La cartografía de coberturas muestra cómo
          el cemento, los rellenos y las vías fueron ocupando lo que antes era agua, juncos y pastizal inundable.
        </p>

        <div className="tiempo">
          <button
            type="button"
            className="tiempo__boton"
            onClick={() => setReproduccion(sonando ? "pausa" : "play")}
            aria-label={sonando ? "Pausar" : "Reproducir de 1952 a 2014"}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              {sonando ? <path d="M8 5v14M16 5v14" /> : <path d="M7 4.5v15l12-7.5z" />}
            </svg>
          </button>
          <div className="tiempo__pista">
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(p * 1000)}
              onChange={(ev) => {
                setReproduccion("pausa");
                setP(Number(ev.target.value) / 1000);
              }}
              aria-label="Año"
              aria-valuetext={String(anio)}
              style={{ "--p": p } as React.CSSProperties}
            />
            {periodos.map((per, i) => (
              <button
                key={per}
                type="button"
                style={{ left: `${MARCAS[i] * 100}%` }}
                aria-pressed={Math.abs(p - MARCAS[i]) < 0.05}
                onClick={() => {
                  setReproduccion("pausa");
                  setP(MARCAS[i]);
                }}
              >
                {per}
              </button>
            ))}
          </div>
        </div>

        <ul className="leyenda">
          {COBERTURAS.map((c) => {
            const v = haEn(c.clave);
            return (
              <li key={c.clave} data-cemento={c.clave === CEMENTO ? "" : undefined}>
                <i style={{ background: c.color }} aria-hidden />
                <span>{c.nombre}</span>
                <span className="leyenda__barra" aria-hidden>
                  <span style={{ transform: `scaleX(${v / max})`, background: c.color }} />
                </span>
                <span className="leyenda__valor">{fmt.format(v)} ha</span>
              </li>
            );
          })}
        </ul>
        <p className="nota">Coberturas de 1952, 1976 y 2014 según la Secretaría Distrital de Ambiente. El norte está arriba.</p>
      </div>
    </div>
  );
}
