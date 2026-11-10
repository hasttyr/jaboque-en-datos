"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DatosJaboque } from "@/lib/datos";
import { SALIDA_EXPO, useEnVista, useMenosMovimiento } from "./movimiento";

export const COBERTURAS: { clave: string; nombre: string; color: string }[] = [
  { clave: "Espejo de Agua", nombre: "Espejo de agua", color: "var(--espejo)" },
  { clave: "Vegetación Acuática", nombre: "Vegetación acuática", color: "var(--acuatica)" },
  { clave: "Vegetación Herbácea", nombre: "Vegetación herbácea", color: "var(--herbacea)" },
  { clave: "Arbustales", nombre: "Arbustales", color: "var(--junco)" },
  { clave: "Pastos", nombre: "Pastos", color: "var(--pasto)" },
  { clave: "Areas Endurecidas", nombre: "Áreas endurecidas", color: "var(--concreto)" },
];

const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const PAUSA_INICIAL = 900; // ms mostrando 1952 antes de avanzar
const PAUSA_ENTRE = 2200; // ms entre un año y el siguiente

// Número que se desliza hacia su nuevo valor.
function useInterpolado(valor: number, duracion: number, menos: boolean) {
  const [mostrado, setMostrado] = useState(valor);
  const actual = useRef(valor);
  useEffect(() => {
    if (menos) {
      actual.current = valor;
      setMostrado(valor);
      return;
    }
    const inicio = actual.current;
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const p = SALIDA_EXPO(Math.min(1, (t - t0) / duracion));
      actual.current = inicio + (valor - inicio) * p;
      setMostrado(actual.current);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracion, menos]);
  return mostrado;
}

export default function MapaJaboque({ datos }: { datos: DatosJaboque }) {
  const periodos = datos.periodos;
  const ultimo = periodos[periodos.length - 1];
  const menos = useMenosMovimiento();

  const [periodo, setPeriodo] = useState(ultimo);
  const [anterior, setAnterior] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lienzo = useRef<HTMLDivElement>(null);
  const mapaVisible = useEnVista(lienzo, { umbral: 0.35 });

  const ha = (clave: string, p = periodo) => datos.capas[p].find((c) => c.cobertura === clave)?.ha ?? 0;
  const max = Math.max(...periodos.flatMap((p) => datos.capas[p].map((c) => c.ha)));
  const total = datos.capas[periodo].reduce((s, c) => s + c.ha, 0);
  const cifra = useInterpolado(ha("Areas Endurecidas"), 1100, menos);

  const irA = useCallback((p: string) => {
    setPeriodo((actual) => {
      if (actual !== p) setAnterior(actual);
      return p;
    });
  }, []);

  const detener = useCallback(() => {
    temporizadores.current.forEach(clearTimeout);
    temporizadores.current = [];
    setReproduciendo(false);
  }, []);

  const reproducir = useCallback(() => {
    detener();
    setAnterior(null);
    setPeriodo(periodos[0]);
    setReproduciendo(true);
    periodos.slice(1).forEach((p, i) => {
      temporizadores.current.push(setTimeout(() => irA(p), PAUSA_INICIAL + i * PAUSA_ENTRE));
    });
    temporizadores.current.push(
      setTimeout(() => setReproduciendo(false), PAUSA_INICIAL + (periodos.length - 1) * PAUSA_ENTRE),
    );
  }, [detener, irA, periodos]);

  useEffect(() => {
    setListo(true);
    const pendientes = temporizadores.current;
    return () => pendientes.forEach(clearTimeout);
  }, []);

  // Cuando el mapa aparece en pantalla: time-lapse de 1952 a 2014 (salvo con menos movimiento).
  useEffect(() => {
    if (!mapaVisible) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) reproducir();
  }, [mapaVisible, reproducir]);

  const indice = periodos.indexOf(periodo);

  return (
    <div className="jaboque" data-listo={listo ? "" : undefined}>
      <div className="jaboque__texto">
        <h1 id="titulo-portada" className="jaboque__titulo">
          <span className="jaboque__cifra" aria-hidden>
            {fmt.format(cifra)}
          </span>
          <span className="sr-only">{fmt.format(ha("Areas Endurecidas"))}</span>
          <span className="jaboque__unidad">
            hectáreas del Humedal Jaboque eran suelo endurecido en{" "}
            <span className="jaboque__anio" key={periodo}>
              {periodo}
            </span>
          </span>
        </h1>
        <p className="jaboque__intro">
          Jaboque, en Engativá, es el segundo humedal más grande de Bogotá. La cartografía de coberturas muestra cómo
          el cemento, los rellenos y las vías fueron ocupando lo que antes era agua, juncos y pastizal inundable.
        </p>

        <div className="controles-periodo">
          <div
            className="periodos"
            role="group"
            aria-label="Elegir año"
            style={{ "--n": periodos.length, "--i": indice } as React.CSSProperties}
          >
            <span className="periodos__indicador" aria-hidden />
            {periodos.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={p === periodo}
                onClick={() => {
                  detener();
                  irA(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <button type="button" className="repetir" onClick={reproducir} disabled={reproduciendo}>
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M4 10a6 6 0 1 0 2-4.5M4 3v3.5h3.5" />
            </svg>
            {reproduciendo ? "Reproduciendo" : "Ver la transformación"}
          </button>
        </div>

        <ul className="leyenda">
          {COBERTURAS.map((c) => (
            <li key={c.clave} className={c.clave === "Areas Endurecidas" ? "leyenda__fila--alerta" : undefined}>
              <span className="leyenda__nombre">
                <i style={{ background: c.color }} aria-hidden />
                {c.nombre}
              </span>
              <span className="leyenda__barra" aria-hidden>
                <span style={{ transform: `scaleX(${ha(c.clave) / max})`, background: c.color }} />
              </span>
              <span className="leyenda__valor">{fmt.format(ha(c.clave))} ha</span>
            </li>
          ))}
        </ul>
        <p className="nota">Área total cartografiada en {periodo}: {fmt.format(total)} ha.</p>
      </div>

      <figure className="jaboque__mapa">
        <div ref={lienzo} className="jaboque__lienzo" style={{ aspectRatio: `${datos.ancho} / ${datos.alto}` }}>
          {periodos.map((p) => (
            <svg
              key={p}
              viewBox={`0 0 ${datos.ancho} ${datos.alto}`}
              className="jaboque__capa"
              data-estado={p === periodo ? "activa" : p === anterior ? "debajo" : "oculta"}
              role={p === periodo ? "img" : undefined}
              aria-label={p === periodo ? `Mapa de coberturas del humedal Jaboque en ${p}` : undefined}
              aria-hidden={p === periodo ? undefined : true}
            >
              {COBERTURAS.map((c) => {
                const capa = datos.capas[p].find((x) => x.cobertura === c.clave);
                return capa ? (
                  <path
                    key={c.clave}
                    d={capa.d}
                    fill={c.color}
                    className={c.clave === "Areas Endurecidas" ? "cemento" : undefined}
                  />
                ) : null;
              })}
            </svg>
          ))}
        </div>
        <figcaption>
          Coberturas de {periodo} según la Secretaría Distrital de Ambiente. El norte está arriba; el extremo
          noroccidental del humedal llega al río Bogotá.
        </figcaption>
      </figure>
    </div>
  );
}
