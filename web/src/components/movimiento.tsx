"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const SALIDA_EXPO = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function suscribirMovimiento(f: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", f);
  return () => mq.removeEventListener("change", f);
}
const leerMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useMenosMovimiento() {
  return useSyncExternalStore(suscribirMovimiento, leerMovimiento, () => false);
}

// Anima el texto de un <span> de un número a otro sin re-renderizar React.
function animar(el: HTMLElement, desde: number, hasta: number, duracion: number, fmt: Intl.NumberFormat, alPaso: (v: number) => void) {
  const t0 = performance.now();
  let raf = 0;
  const paso = (t: number) => {
    const v = desde + (hasta - desde) * SALIDA_EXPO(Math.min(1, (t - t0) / duracion));
    el.textContent = fmt.format(v);
    alPaso(v);
    if (v !== hasta) raf = requestAnimationFrame(paso);
  };
  raf = requestAnimationFrame(paso);
  return () => cancelAnimationFrame(raf);
}

const formato = (decimales: number) =>
  new Intl.NumberFormat("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

// Cuenta desde 0 cada vez que su pantalla aparece.
export function Contador({ valor, duracion = 1600, className }: { valor: number; duracion?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const menos = useMenosMovimiento();
  useEffect(() => {
    const el = ref.current;
    if (!el || menos) return;
    let parar = () => {};
    const io = new IntersectionObserver(([e]) => {
      parar();
      if (e.isIntersecting) parar = animar(el, 0, valor, duracion, formato(0), () => {});
    });
    io.observe(el);
    return () => {
      parar();
      io.disconnect();
    };
  }, [valor, duracion, menos]);
  return (
    <span ref={ref} className={className}>
      {formato(0).format(valor)}
    </span>
  );
}

// Un número que se desliza hacia cada nueva lectura.
export function Interpolado({ valor, decimales = 0 }: { valor: number; decimales?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const actual = useRef(valor);
  const menos = useMenosMovimiento();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = formato(decimales);
    if (menos) {
      actual.current = valor;
      el.textContent = fmt.format(valor);
      return;
    }
    return animar(el, actual.current, valor, 700, fmt, (v) => (actual.current = v));
  }, [valor, decimales, menos]);
  return <span ref={ref}>{formato(decimales).format(valor)}</span>;
}
