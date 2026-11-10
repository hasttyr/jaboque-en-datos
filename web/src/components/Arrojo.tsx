import type { PuntoArrojo, Residuos } from "@/lib/fuentes";
import { Revelar } from "./movimiento";

const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const JABOQUE = { lon: -74.1356, lat: 4.7132 };

// Triángulo con un giro estable por punto, centrado en (cx, cy).
const triangulo = (cx: number, cy: number, r: number, i: number) => {
  const g = (Math.sin(i * 12.9898) * 43758.5453) % (Math.PI * 2);
  const v = [0, 1, 2].map((k) => {
    const a = g + (k * 2 * Math.PI) / 3;
    return `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  });
  return `M${v[0]}L${v[1]}L${v[2]}Z`;
};

// Retraso de caída de cada punto: de norte a sur, con algo de azar estable (ms).
const retraso = (i: number, lat: number) => {
  const r = Math.sin(i * 91.7) * 1000;
  return Math.round((4.85 - lat) * 2600 + (r - Math.floor(r)) * 260);
};

export function MapaArrojo({ puntos }: { puntos: PuntoArrojo[] }) {
  // Solo la zona urbana: Sumapaz y puntos sueltos muy al sur deforman el mapa.
  const urbanos = puntos.filter((p) => p.lat > 4.45 && p.lat < 4.85 && p.lon > -74.25 && p.lon < -73.98);
  const minX = Math.min(...urbanos.map((p) => p.lon));
  const maxX = Math.max(...urbanos.map((p) => p.lon));
  const minY = Math.min(...urbanos.map((p) => p.lat));
  const maxY = Math.max(...urbanos.map((p) => p.lat));
  const k = Math.cos((4.65 * Math.PI) / 180);
  const W = 600;
  const s = W / ((maxX - minX) * k);
  const H = Math.round((maxY - minY) * s);
  const x = (lon: number) => 20 + (lon - minX) * k * s;
  const y = (lat: number) => 20 + (maxY - lat) * s;

  const engativa = urbanos.filter((p) => p.localidad === "Engativá").length;

  return (
    <Revelar as="figure" className="arrojo__mapa" umbral={0.3}>
      <svg viewBox={`0 0 ${W + 40} ${H + 40}`} role="img" aria-label={`Mapa de ${urbanos.length} puntos críticos de arrojo clandestino en Bogotá`}>
        {urbanos.map((p, i) => (
          <path
            key={i}
            d={triangulo(x(p.lon), y(p.lat), p.localidad === "Engativá" ? 7 : 5, i)}
            className={p.localidad === "Engativá" ? "punto punto--engativa" : "punto"}
            style={{ "--d": retraso(i, p.lat) } as React.CSSProperties}
          >
            <title>{`${p.direccion} (${p.localidad}), recolección ${p.frecuencia.toLowerCase()}`}</title>
          </path>
        ))}
        <g transform={`translate(${x(JABOQUE.lon)} ${y(JABOQUE.lat)})`} className="marca-jaboque">
          <circle r="16" />
          <text x="22" y="5">Jaboque</text>
        </g>
      </svg>
      <figcaption>
        Cada punto es un lugar donde se tira basura de forma recurrente. En ámbar, los {engativa} de Engativá, la
        localidad de Jaboque. Pasa el cursor sobre un punto para ver la dirección.
      </figcaption>
    </Revelar>
  );
}

export function RankingLocalidades({ puntos }: { puntos: PuntoArrojo[] }) {
  const conteo = new Map<string, number>();
  puntos.forEach((p) => conteo.set(p.localidad, (conteo.get(p.localidad) ?? 0) + 1));
  const filas = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = filas[0][1];
  return (
    <Revelar as="ol" className="ranking">
      {filas.map(([loc, n], i) => (
        <li
          key={loc}
          className={loc === "Engativá" ? "ranking__fila--alerta" : undefined}
          style={{ "--i": i } as React.CSSProperties}
        >
          <span>{loc}</span>
          <span className="ranking__barra" aria-hidden>
            <span style={{ "--escala": n / max } as React.CSSProperties} />
          </span>
          <span className="ranking__valor">{n}</span>
        </li>
      ))}
    </Revelar>
  );
}

export function ResiduosMes({ residuos }: { residuos: Residuos }) {
  const max = residuos.porTipo[0]?.toneladas ?? 1;
  return (
    <Revelar as="ul" className="residuos">
      {residuos.porTipo.map((r, i) => (
        <li
          key={r.tipo}
          className={r.tipo === "Arrojo clandestino" ? "residuos__fila--alerta" : undefined}
          style={{ "--i": i } as React.CSSProperties}
        >
          <span>{r.tipo}</span>
          <span className="residuos__barra" aria-hidden>
            <span style={{ "--escala": Math.max(0.006, r.toneladas / max) } as React.CSSProperties} />
          </span>
          <span className="residuos__valor">{fmt.format(r.toneladas)} t</span>
        </li>
      ))}
    </Revelar>
  );
}
