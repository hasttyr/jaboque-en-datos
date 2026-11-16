"use client";

import { useSyncExternalStore } from "react";
import { useMenosMovimiento } from "../movimiento";

let webgl: boolean | null = null;
function hayWebGL() {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

// 3D solo si hay WebGL y la persona no pidió menos movimiento. Si no, se usa el mapa 2D.
export function usePuede3D() {
  const menos = useMenosMovimiento();
  const soporta = useSyncExternalStore(() => () => {}, hayWebGL, () => false);
  return soporta && !menos;
}
