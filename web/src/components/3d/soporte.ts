"use client";

import { useEffect, useState } from "react";

// 3D solo si hay WebGL y la persona no pidió menos movimiento. Si no, la página usa la versión 2D.
export function usePuede3D() {
  const [puede, setPuede] = useState(false);
  useEffect(() => {
    const menos = window.matchMedia("(prefers-reduced-motion: reduce)");
    const evaluar = () => {
      if (menos.matches) return setPuede(false);
      try {
        const c = document.createElement("canvas");
        setPuede(!!(c.getContext("webgl2") || c.getContext("webgl")));
      } catch {
        setPuede(false);
      }
    };
    evaluar();
    menos.addEventListener("change", evaluar);
    return () => menos.removeEventListener("change", evaluar);
  }, []);
  return puede;
}
