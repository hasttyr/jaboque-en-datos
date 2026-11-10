"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode, type RefObject } from "react";

export const SALIDA_EXPO = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function useMenosMovimiento() {
  const [menos, setMenos] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMenos(mq.matches);
    const cambio = () => setMenos(mq.matches);
    mq.addEventListener("change", cambio);
    return () => mq.removeEventListener("change", cambio);
  }, []);
  return menos;
}

// true cuando el elemento entra en pantalla (una sola vez, o mientras esté visible si `continuo`).
export function useEnVista(ref: RefObject<Element | null>, { umbral = 0.25, continuo = false } = {}) {
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisto(true);
          if (!continuo) io.disconnect();
        } else if (continuo) setVisto(false);
      },
      { threshold: umbral },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, umbral, continuo]);
  return visto;
}

// Marca su contenido con data-visto cuando entra en pantalla; el CSS decide la coreografía.
export function Revelar({
  as: Etiqueta = "div",
  className,
  umbral,
  children,
}: {
  as?: ElementType;
  className?: string;
  umbral?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const visto = useEnVista(ref, { umbral });
  return (
    <Etiqueta ref={ref} className={className} data-revelar="" data-visto={visto ? "" : undefined}>
      {children}
    </Etiqueta>
  );
}

// Interpola un número hacia `valor`. Empieza en `desde` la primera vez que se ve.
export function Contador({
  valor,
  desde = 0,
  duracion = 1400,
  decimales = 0,
  className,
}: {
  valor: number;
  desde?: number;
  duracion?: number;
  decimales?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const visto = useEnVista(ref, { umbral: 0.4 });
  const menos = useMenosMovimiento();
  const actual = useRef(desde);
  const [mostrado, setMostrado] = useState(valor);
  const fmt = new Intl.NumberFormat("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

  useEffect(() => {
    if (!visto) return;
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
  }, [visto, valor, duracion, menos]);

  return (
    <span ref={ref} className={className}>
      {fmt.format(mostrado)}
    </span>
  );
}

// Muestra un número que se desliza hacia cada nuevo valor (para lecturas en vivo).
export function Interpolado({ valor, decimales = 0, duracion = 700 }: { valor: number; decimales?: number; duracion?: number }) {
  const menos = useMenosMovimiento();
  const actual = useRef(valor);
  const [mostrado, setMostrado] = useState(valor);
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
  return <>{new Intl.NumberFormat("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(mostrado)}</>;
}

// Línea de agua entre la página y la sección "bajo el agua". Las olas solo se mueven en pantalla.
export function Superficie() {
  const ref = useRef<SVGSVGElement>(null);
  const visible = useEnVista(ref, { umbral: 0, continuo: true });
  const ola = (fase: number, amp: number, y: number) => {
    let d = `M0 ${y}`;
    for (let x = 0; x <= 4320; x += 12) d += ` L${x} ${(y + Math.sin((x / 360) * Math.PI * 2 + fase) * amp).toFixed(1)}`;
    return d;
  };
  return (
    <svg ref={ref} className="superficie" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden data-activa={visible ? "" : undefined}>
      <path className="superficie__ola superficie__ola--atras" d={ola(0, 10, 52)} />
      <path className="superficie__ola superficie__ola--media" d={ola(1.7, 13, 66)} />
      <path className="superficie__ola superficie__ola--frente" d={ola(3.1, 8, 82)} />
    </svg>
  );
}
