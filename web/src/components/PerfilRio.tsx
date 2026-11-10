import type { Estacion } from "@/lib/fuentes";
import { Revelar } from "./movimiento";

const OD_MINIMO = 4; // mg/L: por debajo, la mayoría de peces no sobrevive
const OD_MAX = 8;
const dec = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

// Interpola del color del agua limpia al lodo según la turbidez.
function colorAgua(turbidez: number | null) {
  const t = Math.min(1, Math.log10(Math.max(1, turbidez ?? 1)) / Math.log10(600));
  return `color-mix(in oklab, var(--espejo) ${Math.round((1 - t) * 100)}%, var(--lodo))`;
}

export default function PerfilRio({ estaciones }: { estaciones: Estacion[] }) {
  return (
    <Revelar className="rio" umbral={0.2}>
      <div className="rio__escala" aria-hidden>
        <span>Oxígeno disuelto (mg/L)</span>
        <span className="rio__regla">
          <span className="rio__marca" style={{ left: `${(OD_MINIMO / OD_MAX) * 100}%` }}>
            {OD_MINIMO} mg/L, mínimo para peces
          </span>
        </span>
      </div>
      <ol className="rio__lista">
        {estaciones.map((e, i) => {
          const od = e.oxigeno ?? 0;
          return (
            <li
              key={e.id}
              className={e.jaboque ? "rio__fila rio__fila--jaboque" : "rio__fila"}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="rio__punto" style={{ background: colorAgua(e.turbidez) }} aria-hidden />
              <span className="rio__nombre">
                {e.nombre}
                {e.turbidez != null && <small>Turbidez {dec.format(e.turbidez)} NTU</small>}
              </span>
              <span className="rio__pista">
                <span
                  className={od < OD_MINIMO ? "rio__barra rio__barra--baja" : "rio__barra"}
                  style={{ "--escala": Math.min(1, od / OD_MAX) } as React.CSSProperties}
                />
                <span className="rio__umbral" style={{ left: `${(OD_MINIMO / OD_MAX) * 100}%` }} aria-hidden />
              </span>
              <span className="rio__valor">{e.oxigeno == null ? "s.d." : dec.format(od)}</span>
            </li>
          );
        })}
      </ol>
    </Revelar>
  );
}
