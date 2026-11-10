import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DatosJaboque } from "@/lib/datos";

// Altura de cada cobertura, en las mismas unidades del mapa (1000 = ancho del humedal).
// El cemento es la única que se eleva de verdad: es lo que la historia necesita que se vea.
export const ALTURAS: Record<string, number> = {
  "Espejo de Agua": 3,
  "Vegetación Acuática": 9,
  "Vegetación Herbácea": 15,
  Arbustales: 30,
  Pastos: 5,
  "Areas Endurecidas": 110,
};

export const COLORES: Record<string, string> = {
  "Espejo de Agua": "#3fb6e8",
  "Vegetación Acuática": "#17b890",
  "Vegetación Herbácea": "#9bd36a",
  Arbustales: "#2e8f5e",
  Pastos: "#3a3f2f",
  "Areas Endurecidas": "#f2f2ee",
};

// Origen del avance de la ciudad (sureste del humedal), en unidades del mapa.
export const ORIGEN_CIUDAD = { x: 0.92, y: 0.98 };

// "M x yL x yL…Z…" → anillos de puntos.
function anillos(d: string): [number, number][][] {
  return d
    .split("M")
    .filter(Boolean)
    .map((tramo) =>
      tramo
        .replace(/Z/g, "")
        .split("L")
        .map((par) => {
          const [x, y] = par.trim().split(/\s+/).map(Number);
          return [x, y] as [number, number];
        })
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    )
    .filter((r) => r.length >= 3);
}

export type CapaGeometria = { cobertura: string; geometria: THREE.BufferGeometry };

// Devuelve, por periodo, una geometría extruida por cobertura, centrada en el origen,
// con el norte hacia -z y la altura hacia +y.
export function construirGeometrias(datos: DatosJaboque): Record<string, CapaGeometria[]> {
  const cx = datos.ancho / 2;
  const cz = datos.alto / 2;
  const salida: Record<string, CapaGeometria[]> = {};

  for (const periodo of datos.periodos) {
    salida[periodo] = datos.capas[periodo].map((capa) => {
      const ruta = new THREE.ShapePath();
      for (const anillo of anillos(capa.d)) {
        ruta.moveTo(anillo[0][0], anillo[0][1]);
        for (let i = 1; i < anillo.length; i++) ruta.lineTo(anillo[i][0], anillo[i][1]);
      }
      const formas = ruta.toShapes();
      const alto = ALTURAS[capa.cobertura] ?? 6;
      const esCemento = capa.cobertura === "Areas Endurecidas";
      // Cada forma por separado: el cemento sube según su grosor (área / perímetro),
      // así una vía delgada queda baja y una manzana ancha se vuelve un bloque alto.
      const partes = formas.map((forma) => {
        let h = alto;
        if (esCemento) {
          const pts = forma.getPoints();
          const area = Math.abs(THREE.ShapeUtils.area(pts));
          let perimetro = 0;
          for (let i = 0; i < pts.length; i++) perimetro += pts[i].distanceTo(pts[(i + 1) % pts.length]);
          const grosor = perimetro > 0 ? area / perimetro : 0;
          h = Math.min(alto, Math.max(4, grosor * 4.5));
        }
        const g = new THREE.ExtrudeGeometry(forma, { depth: h, bevelEnabled: false, curveSegments: 1 });
        // La extrusión va en +z; la giramos para que suba en +y.
        g.rotateX(Math.PI / 2);
        g.translate(0, h, 0);
        return g;
      });
      const geometria = partes.length ? mergeGeometries(partes, false) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
      partes.forEach((g) => g.dispose());
      geometria.translate(-cx, 0, -cz);
      geometria.computeVertexNormals();
      return { cobertura: capa.cobertura, geometria };
    });
  }
  return salida;
}
