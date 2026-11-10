// Descarga los datos abiertos y guarda copias de respaldo en src/data/.
// Uso: npm run datos   (requiere Node 22.6+ por el soporte nativo de TypeScript)
import { writeFileSync, mkdirSync } from "node:fs";
import { cargarRio, cargarArrojo, cargarResiduos } from "../src/lib/fuentes.ts";

const DIR = new URL("../src/data/", import.meta.url);
mkdirSync(DIR, { recursive: true });
const guardar = (nombre: string, datos: unknown) => {
  writeFileSync(new URL(nombre, DIR), JSON.stringify(datos));
  console.log("✓", nombre);
};

guardar("rio.json", await cargarRio());
guardar("arrojo.json", await cargarArrojo());
guardar("residuos.json", await cargarResiduos());

// --- Humedal Jaboque: cobertura vegetal 1952 / 1976 / 2014 ---
// El GeoJSON completo pesa ~50 MB, así que solo extraemos Jaboque y lo
// convertimos a trazos SVG listos para dibujar.
const URL_HUMEDALES =
  "https://datosabiertos.bogota.gov.co/dataset/48cfbc10-a003-4402-a13c-463a6dcbeaac/resource/31b941a6-aec5-4e7b-845c-35223dbe23b2/download/cober_vege_humedales.geojson";

type Geo = { type: string; coordinates: number[][][] | number[][][][] };
const humedales = (await (await fetch(URL_HUMEDALES)).json()) as {
  features: { geometry: Geo; properties: Record<string, string> }[];
};
const jab = humedales.features.filter((f) => /jaboque/i.test(f.properties.nombre));

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const recorrer = (a: unknown, fn: (p: number[]) => void): void =>
  typeof (a as number[])[0] === "number" ? fn(a as number[]) : (a as unknown[]).forEach((b) => recorrer(b, fn));
jab.forEach((f) =>
  recorrer(f.geometry.coordinates, ([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }),
);
const k = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
const ANCHO = 1000;
const escala = ANCHO / ((maxX - minX) * k);
const ALTO = Math.round((maxY - minY) * escala);



// Simplificación: descarta vértices a menos de ~1.5 px del anterior.
const anillo = (r: number[][]) => {
  const pts: [number, number][] = r.map(([x, y]) => [(x - minX) * k * escala, (maxY - y) * escala]);
  const out: [number, number][] = [pts[0]];
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 1.5) out.push(p);
  }
  if (out.length < 3) return "";
  return "M" + out.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join("L") + "Z";
};
const M2_POR_GRADO2 = 111320 * 111320 * k;

const capas: Record<string, Record<string, { d: string[]; ha: number }>> = {};
for (const f of jab) {
  const { periodo, cobertura } = f.properties;
  const polis = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
  const c = ((capas[periodo] ??= {})[cobertura] ??= { d: [], ha: 0 });
  polis.forEach((p) => p.forEach((r) => c.d.push(anillo(r))));
  c.ha += (parseFloat(f.properties.Shape_Area) * M2_POR_GRADO2) / 1e4;
}

guardar("jaboque.json", {
  ancho: ANCHO,
  alto: ALTO,
  periodos: Object.keys(capas).sort(),
  capas: Object.fromEntries(
    Object.entries(capas).map(([p, cs]) => [
      p,
      Object.entries(cs).map(([cobertura, v]) => ({
        cobertura,
        ha: Math.round(v.ha * 10) / 10,
        d: v.d.join(""),
      })),
    ]),
  ),
});
