"use client";

import { useEffect, useRef } from "react";

// Partículas triangulares que flotan en el vacío, con algo de profundidad al hacer scroll.
// Colores: violeta, ámbar, agua, juncos, magenta y azul.
const COLORES = ["#8052ff", "#ffb829", "#3fb6e8", "#17b890", "#d94fd6", "#4f6bff", "#9bd36a"];

type Particula = {
  x: number;
  y: number;
  z: number; // 0.2 (lejos) – 1 (cerca): tamaño, velocidad y paralaje
  lado: number;
  giro: number;
  vGiro: number;
  vx: number;
  vy: number;
  color: string;
  alfa: number;
};

export default function CampoParticulas() {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = lienzo.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const menos = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ancho = 0;
    let alto = 0;
    let particulas: Particula[] = [];
    let raf = 0;
    let ultimo = performance.now();

    const crear = (): Particula => {
      const z = 0.2 + Math.random() ** 2 * 0.8;
      return {
        x: Math.random() * ancho,
        y: Math.random() * alto,
        z,
        lado: 3 + z * 7,
        giro: Math.random() * Math.PI * 2,
        vGiro: (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 6 * z,
        vy: (-2 - Math.random() * 6) * z,
        color: COLORES[Math.floor(Math.random() * COLORES.length)],
        alfa: 0.18 + z * 0.42,
      };
    };

    const medir = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = window.innerWidth;
      alto = window.innerHeight;
      canvas.width = ancho * dpr;
      canvas.height = alto * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cantidad = Math.min(110, Math.round((ancho * alto) / 16000));
      while (particulas.length < cantidad) particulas.push(crear());
      particulas = particulas.slice(0, cantidad);
    };

    const dibujar = () => {
      ctx.clearRect(0, 0, ancho, alto);
      const scroll = window.scrollY;
      ctx.lineWidth = 1.1;
      ctx.lineJoin = "round";
      for (const p of particulas) {
        // Paralaje: lo cercano se desplaza más con el scroll.
        const y = (((p.y - scroll * p.z * 0.35) % alto) + alto) % alto;
        const r = p.lado;
        ctx.save();
        ctx.translate(p.x, y);
        ctx.rotate(p.giro);
        ctx.globalAlpha = p.alfa;
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.866, r * 0.5);
        ctx.lineTo(-r * 0.866, r * 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    };

    const paso = (t: number) => {
      const dt = Math.min(0.05, (t - ultimo) / 1000);
      ultimo = t;
      for (const p of particulas) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.giro += p.vGiro * dt;
        if (p.x < -12) p.x = ancho + 12;
        if (p.x > ancho + 12) p.x = -12;
        if (p.y < -12) p.y += alto + 24;
      }
      dibujar();
      raf = requestAnimationFrame(paso);
    };

    const iniciar = () => {
      cancelAnimationFrame(raf);
      ultimo = performance.now();
      if (menos) dibujar();
      else raf = requestAnimationFrame(paso);
    };

    const alCambiarVisibilidad = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else iniciar();
    };

    medir();
    iniciar();
    const alRedimensionar = () => {
      medir();
      if (menos) dibujar();
    };
    const alScroll = () => {
      if (menos) dibujar();
    };
    window.addEventListener("resize", alRedimensionar);
    window.addEventListener("scroll", alScroll, { passive: true });
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", alRedimensionar);
      window.removeEventListener("scroll", alScroll);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, []);

  return <canvas ref={lienzo} className="campo-particulas" aria-hidden />;
}
