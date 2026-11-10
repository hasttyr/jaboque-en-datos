// Conectores a los portales de datos abiertos.
// Sin imports a propósito: este archivo lo usa la app (Next.js) y también
// el script `scripts/descargar-datos.ts` que genera las copias de respaldo.

export const FUENTES = {
  rio: {
    nombre: "Data histórica de calidad de agua superficial y sedimentos (IDEAM)",
    portal: "datos.gov.co",
    url: "https://www.datos.gov.co/d/62gv-3857",
  },
  arrojo: {
    nombre: "Puntos críticos de arrojo clandestino de residuos",
    portal: "datosabiertos.bogota.gov.co",
    url: "https://datosabiertos.bogota.gov.co/dataset/puntos-criticos-arrojo-clandestino-residuos-bogota-d-c",
  },
  residuos: {
    nombre: "Residuos recogidos RBL (UAESP)",
    portal: "datosabiertos.bogota.gov.co",
    url: "https://datosabiertos.bogota.gov.co/dataset/datos-residuos-recogidos-rbl-uaesp",
  },
  jaboque: {
    nombre: "Cobertura vegetal en humedales",
    portal: "datosabiertos.bogota.gov.co",
    url: "https://datosabiertos.bogota.gov.co/dataset/cobertura-vegetal-en-humedales-bogota-d-c",
  },
} as const;

const SODA = "https://www.datos.gov.co/resource";
const CKAN = "https://datosabiertos.bogota.gov.co/api/3/action";

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} al consultar ${url}`);
  return res.json();
}

// Algunos textos del portal vienen con UTF-8 leído como Latin-1 ("PROYECCIÃN"). Los reparamos.
function reparar(t: string): string {
  if (!/[ÃÂ]/.test(t) || [...t].some((c) => c.charCodeAt(0) > 255)) return t;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from([...t].map((c) => c.charCodeAt(0))));
  } catch {
    return t;
  }
}

function numero(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(",", ".").replace(/[<>]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/* ---------- Río Bogotá (IDEAM, Socrata) ---------- */

export type Estacion = {
  id: string;
  nombre: string;
  municipio: string;
  oxigeno: number | null; // mg O2/L, promedio
  turbidez: number | null; // NTU
  conductividad: number | null; // µS/cm
  muestras: number;
  jaboque?: boolean;
};

// Orden aguas abajo, del nacimiento a la desembocadura en el Magdalena.
const ORDEN_RIO: [string, string][] = [
  ["PTE.CARRETERA-BOGOTA", "Villapinzón · puente carretera"],
  ["SANPEDRO", "Villapinzón · San Pedro"],
  ["TULIO BOTERO", "Tocancipá"],
  ["EL COMUN", "Chía · puente El Común"],
  ["HACIENDA DARIEN", "Chía · hacienda Darién"],
  ["LA VIRGEN", "Cota · puente La Virgen"],
  ["CORTIJO", "Bogotá · El Cortijo (junto a Jaboque)"],
  ["ALICACHIN", "Soacha · Alicachín"],
  ["MESITAS", "El Colegio"],
  ["PORTILLO", "Tocaima"],
  ["CAMPINA", "Girardot"],
];

const PROPIEDADES = {
  "OXIGENO DISUELTO (OD)": "oxigeno",
  TURBIDEZ: "turbidez",
  "CONDUCTIVIDAD ELECTRICA": "conductividad",
} as const;

export async function cargarRio(): Promise<Estacion[]> {
  const where = `corriente='BOGOTÁ' AND fecha >= '2015-01-01' AND propiedad_observada in(${Object.keys(
    PROPIEDADES,
  )
    .map((p) => `'${p}'`)
    .join(",")})`;
  const url = `${SODA}/62gv-3857.json?$select=nombre_del_punto_de_monitoreo,municipio,propiedad_observada,resultado&$where=${encodeURIComponent(
    where,
  )}&$limit=20000`;
  const filas = (await getJson(url)) as Record<string, string>[];

  const acc = new Map<string, { municipio: string; sum: Record<string, number[]> }>();
  for (const f of filas) {
    const v = numero(f.resultado);
    if (v == null) continue;
    const campo = PROPIEDADES[f.propiedad_observada as keyof typeof PROPIEDADES];
    const e = acc.get(f.nombre_del_punto_de_monitoreo) ?? { municipio: f.municipio, sum: {} };
    (e.sum[campo] ??= []).push(v);
    acc.set(f.nombre_del_punto_de_monitoreo, e);
  }

  const prom = (a?: number[]) =>
    a && a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null;

  const out: Estacion[] = [];
  for (const [clave, nombre] of ORDEN_RIO) {
    const entrada = [...acc.entries()].find(([k]) => k.toUpperCase().includes(clave));
    if (!entrada) continue;
    const [id, e] = entrada;
    out.push({
      id,
      nombre,
      municipio: e.municipio,
      oxigeno: prom(e.sum.oxigeno),
      turbidez: prom(e.sum.turbidez),
      conductividad: prom(e.sum.conductividad),
      muestras: Object.values(e.sum).reduce((s, a) => s + a.length, 0),
      jaboque: clave === "CORTIJO",
    });
  }
  if (out.length < 5) throw new Error("Respuesta incompleta del IDEAM");
  return out;
}

/* ---------- Arrojo clandestino (Bogotá, CKAN + GeoJSON) ---------- */

export const LOCALIDADES: Record<string, string> = {
  "1": "Usaquén", "2": "Chapinero", "3": "Santa Fe", "4": "San Cristóbal", "5": "Usme",
  "6": "Tunjuelito", "7": "Bosa", "8": "Kennedy", "9": "Fontibón", "10": "Engativá",
  "11": "Suba", "12": "Barrios Unidos", "13": "Teusaquillo", "14": "Los Mártires",
  "15": "Antonio Nariño", "16": "Puente Aranda", "17": "La Candelaria", "18": "Rafael Uribe Uribe",
  "19": "Ciudad Bolívar", "20": "Sumapaz",
};

export type PuntoArrojo = { lon: number; lat: number; localidad: string; direccion: string; frecuencia: string };

export async function cargarArrojo(): Promise<PuntoArrojo[]> {
  const meta = (await getJson(`${CKAN}/resource_show?id=4c119eb3-272c-489c-b066-c9d511d1333b`)) as {
    result: { url: string };
  };
  const geo = (await getJson(meta.result.url)) as {
    features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[];
  };
  const pts = geo.features
    .filter((f) => f.geometry?.coordinates)
    .map((f) => ({
      lon: Math.round(f.geometry.coordinates[0] * 1e5) / 1e5,
      lat: Math.round(f.geometry.coordinates[1] * 1e5) / 1e5,
      localidad: LOCALIDADES[String(parseInt(f.properties.Nombre_Localidad))] ?? "Sin dato",
      direccion: reparar(f.properties["Dirección"] ?? "").replace(/\s+/g, " ").trim(),
      frecuencia: reparar(f.properties.Frecuencia ?? ""),
    }));
  if (pts.length < 50) throw new Error("Respuesta incompleta de arrojo clandestino");
  return pts;
}

/* ---------- Residuos recogidos (UAESP, CKAN datastore) ---------- */

export type Residuos = {
  mes: string; // ISO yyyy-mm
  total: number; // t/mes en toda la ciudad
  porTipo: { tipo: string; toneladas: number }[];
};

const TIPOS: [RegExp, string][] = [
  [/Domiciliarios \(t/i, "Domiciliarios"],
  [/Grandes Generadores/i, "Grandes generadores"],
  [/Barrido/i, "Barrido de calles"],
  [/Domiciliarios especiales/i, "Especiales"],
  [/Corte Cesped/i, "Corte de césped"],
  [/Poda/i, "Poda de árboles"],
  [/Plazas Mercado/i, "Plazas de mercado"],
  [/Arrojo Clandestino/i, "Arrojo clandestino"],
];

export async function cargarResiduos(): Promise<Residuos> {
  const pkg = (await getJson(`${CKAN}/package_show?id=datos-residuos-recogidos-rbl-uaesp`)) as {
    result: { resources: { id: string; datastore_active: boolean; created: string }[] };
  };
  const activos = pkg.result.resources.filter((r) => r.datastore_active);
  // El recurso más reciente con datastore activo trae el último mes publicado.
  let mejor: { mes: string; filas: Record<string, string>[] } | null = null;
  for (const r of activos) {
    const ds = (await getJson(`${CKAN}/datastore_search?resource_id=${r.id}&limit=500`)) as {
      result: { records: Record<string, string>[] };
    };
    const filas = ds.result.records;
    const claveMes = Object.keys(filas[0] ?? {}).find((k) => /Ano\/Mes/i.test(k));
    if (!claveMes) continue;
    const meses = filas.map((f) => String(f[claveMes]).slice(0, 7)).sort();
    const ultimo = meses[meses.length - 1];
    if (!mejor || ultimo > mejor.mes) {
      mejor = { mes: ultimo, filas: filas.filter((f) => String(f[claveMes]).startsWith(ultimo)) };
    }
  }
  if (!mejor) throw new Error("No se encontraron datos de residuos");

  const porTipo = new Map<string, number>();
  let total = 0;
  for (const f of mejor.filas) {
    for (const [k, v] of Object.entries(f)) {
      const n = numero(v);
      if (n == null) continue;
      if (/^Total/i.test(k)) total += n;
      const tipo = TIPOS.find(([re]) => re.test(k))?.[1];
      if (tipo) porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + n);
    }
  }
  return {
    mes: mejor.mes,
    total: Math.round(total),
    porTipo: [...porTipo.entries()]
      .map(([tipo, t]) => ({ tipo, toneladas: Math.round(t) }))
      .filter((x) => x.toneladas > 0)
      .sort((a, b) => b.toneladas - a.toneladas),
  };
}
