"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DatosJaboque } from "@/lib/datos";
import type { EstadoTiempo } from "./3d/Jaboque3D";
import { usePuede3D } from "./3d/soporte";

const Jaboque3D = dynamic(() => import("./3d/Jaboque3D"), { ssr: false });

export const COBERTURAS: { clave: string; nombre: string; color: string }[] = [
  { clave: "Espejo de Agua", nombre: "Espejo de agua", color: "var(--espejo)" },
  { clave: "Vegetación Acuática", nombre: "Vegetación acuática", color: "var(--acuatica)" },
  { clave: "Vegetación Herbácea", nombre: "Vegetación herbácea", color: "var(--herbacea)" },
  { clave: "Arbustales", nombre: "Arbustales", color: "var(--junco)" },
  { clave: "Pastos", nombre: "Pastos", color: "var(--pasto)" },
  { clave: "Areas Endurecidas", nombre: "Áreas endurecidas", color: "var(--concreto)" },
];

const CEMENTO = "Areas Endurecidas";
const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

// El recorrido del scroll se reparte así: una pausa en cada año y dos transiciones.
// [0, 0.08] 1952 · [0.08, 0.46] → 1976 · [0.46, 0.54] 1976 · [0.54, 0.92] → 2014 · [0.92, 1] 2014
const TRAMOS = [
  { desde: 0.08, hasta: 0.46 },
  { desde: 0.54, hasta: 0.92 },
];
// Dónde cae cada año en la línea de tiempo (progreso de scroll).
const MARCAS = [0.04, 0.5, 0.96];

const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function estadoEn(p: number) {
  if (p < TRAMOS[0].desde) return { tramo: 0, t: 0 };
  if (p <= TRAMOS[0].hasta) return { tramo: 0, t: (p - TRAMOS[0].desde) / (TRAMOS[0].hasta - TRAMOS[0].desde) };
  if (p < TRAMOS[1].desde) return { tramo: 1, t: 0 };
  if (p <= TRAMOS[1].hasta) return { tramo: 1, t: (p - TRAMOS[1].desde) / (TRAMOS[1].hasta - TRAMOS[1].desde) };
  return { tramo: 1, t: 1 };
}

// Capas del mapa: no dependen del progreso, así que no se vuelven a dibujar en cada cuadro.
const Capas = memo(function Capas({ datos }: { datos: DatosJaboque }) {
  const { ancho: W, alto: H } = datos;
  return (
    <>
      {datos.periodos.map((p, i) => {
        const capas = datos.capas[p];
        const silueta = capas.map((c) => c.d).join("");
        return (
          <svg key={p} viewBox={`0 0 ${W} ${H}`} className="jaboque__capa" data-indice={i} aria-hidden>
            <defs>
              <clipPath id={`silueta-${p}`}>
                <path d={silueta} />
              </clipPath>
            </defs>
            {COBERTURAS.map((c) => {
              const capa = capas.find((x) => x.cobertura === c.clave);
              return capa ? (
                <path key={c.clave} d={capa.d} fill={c.color} className={c.clave === CEMENTO ? "cemento" : undefined} />
              ) : null;
            })}
            {/* Frente de luz: el borde de la ciudad avanzando, visible solo sobre el humedal. */}
            <g clipPath={`url(#silueta-${p})`} className="frente">
              <circle cx={W * 0.92} cy={H * 0.98} className="frente__halo" />
              <circle cx={W * 0.92} cy={H * 0.98} className="frente__linea" />
            </g>
          </svg>
        );
      })}
    </>
  );
});

export default function MapaJaboque({ datos }: { datos: DatosJaboque }) {
  const periodos = datos.periodos;
  const anios = periodos.map(Number);
  const recorrido = useRef<HTMLDivElement>(null);
  // Sin JavaScript (y en el servidor) se muestra el estado final: 2014.
  const [p, setP] = useState(1);
  const [listo, setListo] = useState(false);
  const puede3D = usePuede3D();
  const [listo3D, setListo3D] = useState(false);
  const estado3D = useRef<EstadoTiempo>({ tramo: 1, avance: 1, progreso: 1, brillo: 0, activo: true });
  const alListo3D = useCallback(() => setListo3D(true), []);

  useEffect(() => {
    let raf = 0;
    const medir = () => {
      raf = 0;
      const el = recorrido.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setP(total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1);
    };
    const pedir = () => {
      if (!raf) raf = requestAnimationFrame(medir);
    };
    medir();
    setListo(true);
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, []);

  const irA = useCallback((progreso: number) => {
    const el = recorrido.current;
    if (!el) return;
    const total = el.offsetHeight - window.innerHeight;
    const inicio = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: inicio + total * progreso, behavior: "smooth" });
  }, []);

  const { tramo, t } = estadoEn(p);
  const e = suave(t);
  const e2 = e;
  const desde = periodos[tramo];
  const hacia = periodos[tramo + 1];
  const ha = (clave: string, per: string) => datos.capas[per].find((c) => c.cobertura === clave)?.ha ?? 0;
  const haEn = (clave: string) => ha(clave, desde) + (ha(clave, hacia) - ha(clave, desde)) * e;
  const max = Math.max(...periodos.flatMap((per) => datos.capas[per].map((c) => c.ha)));
  const anio = Math.round(anios[tramo] + (anios[tramo + 1] - anios[tramo]) * e);
  const cemento = haEn(CEMENTO);

  // Radio del frente, en % para clip-path y en unidades del viewBox para el círculo de luz.
  const radio = e * 150;
  const radioVB = (radio / 100) * Math.hypot(datos.ancho, datos.alto) / Math.SQRT2;
  const enTransicion = t > 0 && t < 1;

  // La escena 3D lee esto en cada cuadro, sin pasar por React.
  useEffect(() => {
    const e = estado3D.current;
    e.tramo = tramo;
    e.avance = e2;
    e.progreso = p;
    e.brillo = t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
  });

  useEffect(() => {
    const el = recorrido.current;
    if (!el) return;
    const io = new IntersectionObserver(([x]) => (estado3D.current.activo = x.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const estilo = {
    "--radio": radio,
    "--radio-vb": radioVB,
    "--calor": enTransicion ? 1 - e * 0.85 : 0,
    "--brillo": enTransicion ? Math.sin(Math.PI * t) : 0,
    "--progreso": p,
  } as React.CSSProperties;

  return (
    <div ref={recorrido} className="recorrido" data-listo={listo ? "" : undefined}>
      <div className="jaboque" style={estilo} data-tramo={tramo} data-3d={listo3D ? "" : undefined}>
        {puede3D && <Jaboque3D datos={datos} estado={estado3D} alListo={alListo3D} />}
        <div className="jaboque__texto">
          <h1 id="titulo-portada" className="jaboque__titulo">
            <span className="jaboque__cifra" aria-hidden>
              {fmt.format(cemento)}
            </span>
            <span className="sr-only">
              {fmt.format(ha(CEMENTO, periodos[periodos.length - 1]))} hectáreas del Humedal Jaboque eran suelo
              endurecido en {periodos[periodos.length - 1]}
            </span>
            <span className="jaboque__unidad" aria-hidden>
              hectáreas del Humedal Jaboque eran suelo endurecido en <span className="jaboque__anio">{anio}</span>
            </span>
          </h1>
          <p className="jaboque__intro">
            Jaboque, en Engativá, es el segundo humedal más grande de Bogotá. La cartografía de coberturas muestra
            cómo el cemento, los rellenos y las vías fueron ocupando lo que antes era agua, juncos y pastizal
            inundable.
          </p>

          <div className="linea-tiempo" role="group" aria-label="Ir a un año">
            <div className="linea-tiempo__pista" aria-hidden>
              <span className="linea-tiempo__avance" />
            </div>
            {periodos.map((per, i) => (
              <button
                key={per}
                type="button"
                style={{ left: `${MARCAS[i] * 100}%` }}
                aria-pressed={Math.abs(p - MARCAS[i]) < 0.05}
                data-pasado={p >= MARCAS[i] - 0.01 ? "" : undefined}
                onClick={() => irA(MARCAS[i])}
              >
                {per}
              </button>
            ))}
          </div>

          <ul className="leyenda">
            {COBERTURAS.map((c) => {
              const v = haEn(c.clave);
              return (
                <li key={c.clave} className={c.clave === CEMENTO ? "leyenda__fila--alerta" : undefined}>
                  <span className="leyenda__nombre">
                    <i style={{ background: c.color }} aria-hidden />
                    {c.nombre}
                  </span>
                  <span className="leyenda__barra" aria-hidden>
                    <span style={{ transform: `scaleX(${v / max})`, background: c.color }} />
                  </span>
                  <span className="leyenda__valor">{fmt.format(v)} ha</span>
                </li>
              );
            })}
          </ul>
        </div>

        <figure className="jaboque__mapa">
          <div
            className="jaboque__lienzo"
            style={{ aspectRatio: `${datos.ancho} / ${datos.alto}` }}
            role="img"
            aria-label={`Mapa de coberturas del humedal Jaboque en ${anio}`}
          >
            <Capas datos={datos} />
          </div>
          <figcaption>
            Coberturas de 1952, 1976 y 2014 según la Secretaría Distrital de Ambiente. El norte está arriba; el
            extremo noroccidental del humedal llega al río Bogotá.
          </figcaption>
        </figure>

        <p className="desliza" aria-hidden data-oculto={p > 0.03 ? "" : undefined}>
          <svg viewBox="0 0 16 24">
            <rect x="1" y="1" width="14" height="22" rx="7" />
            <line x1="8" y1="6" x2="8" y2="10" />
          </svg>
          Desliza para avanzar en el tiempo
        </p>
      </div>
    </div>
  );
}
