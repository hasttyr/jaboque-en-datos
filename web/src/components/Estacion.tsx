"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import ConexionMaqueta, { useMaqueta } from "./ConexionMaqueta";
import { sucio } from "@/lib/maqueta";

export type Pantalla = {
  id: string;
  nombre: string;
  corto?: string; // en la barra del celular
  icono: React.ReactNode;
  contenido: React.ReactNode;
  soloEscritorio?: boolean; // en celular se llega desde otra pantalla
};

/* ---------- Ruta: la pantalla activa vive en el hash (#rio, #maqueta…) ---------- */

const oyentes = new Set<() => void>();
function suscribir(f: () => void) {
  oyentes.add(f);
  window.addEventListener("popstate", f);
  window.addEventListener("hashchange", f);
  return () => {
    oyentes.delete(f);
    window.removeEventListener("popstate", f);
    window.removeEventListener("hashchange", f);
  };
}
const leerHash = () => decodeURIComponent(window.location.hash.slice(1));

const Activa = createContext("");
export const usePantallaActiva = () => useContext(Activa);

export default function Estacion({ pantallas }: { pantallas: Pantalla[] }) {
  return (
    <ConexionMaqueta>
      <Pantallas pantallas={pantallas} />
    </ConexionMaqueta>
  );
}

function Pantallas({ pantallas }: { pantallas: Pantalla[] }) {
  const hash = useSyncExternalStore(suscribir, leerHash, () => "");
  const activa = pantallas.some((p) => p.id === hash) ? hash : pantallas[0].id;
  const indice = pantallas.findIndex((p) => p.id === activa);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const maqueta = useMaqueta();

  const ir = useCallback(
    (id: string, enfocar = true) => {
      if (id === activa) return;
      const destino = pantallas.findIndex((p) => p.id === id);
      const cambiar = () => {
        flushSync(() => {
          history.pushState(null, "", `#${id}`);
          oyentes.forEach((f) => f());
        });
        window.scrollTo(0, 0);
        if (enfocar) refs.current[id]?.focus({ preventScroll: true });
      };
      document.documentElement.dataset.direccion = destino > indice ? "adelante" : "atras";
      const menos = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !menos) document.startViewTransition(cambiar);
      else cambiar();
    },
    [activa, indice, pantallas],
  );

  // ← y → (o Re Pág / Av Pág) pasan de pantalla, salvo cuando se está escribiendo o moviendo un control.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], [role=slider]")) return;
      const paso = e.key === "ArrowRight" || e.key === "PageDown" ? 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 0;
      const destino = pantallas[indice + paso];
      if (!paso || !destino) return;
      e.preventDefault();
      ir(destino.id, false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [indice, pantallas, ir]);

  // Aviso de nivel crítico en cualquier pantalla que no sea la maqueta. Se cierra por episodio.
  const [cerrado, setCerrado] = useState(0);
  const { alerta, ultima, simulado } = maqueta;
  const avisar = alerta.critico && alerta.episodio !== cerrado && activa !== "maqueta";
  const estadoLago = alerta.critico ? "critico" : maqueta.modo === "demo" ? "demo" : "normal";

  const estilo = { "--sucio": sucio(ultima?.turbidez_ntu) } as React.CSSProperties;

  return (
    <Activa.Provider value={activa}>
      <div className="estacion" data-pantalla={activa} data-lago={estadoLago} style={estilo}>
        <header className="barra">
          <a href={`#${pantallas[0].id}`} className="marca" onClick={(e) => (e.preventDefault(), ir(pantallas[0].id))}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M3 15c3-2 6-2 9 0s6 2 9 0" />
              <path d="M3 19c3-2 6-2 9 0s6 2 9 0" />
              <path d="M7 12V4M12 11V2M17 12V6" />
            </svg>
            Jaboque en datos
          </a>
          <nav aria-label="Pantallas" className="pestanas">
            {pantallas.map((p) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                aria-current={p.id === activa ? "page" : undefined}
                data-solo-escritorio={p.soloEscritorio ? "" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  ir(p.id);
                }}
              >
                {p.icono}
                <span className="pestana__largo">{p.nombre}</span>
                <span className="pestana__corto" aria-hidden>
                  {p.corto ?? p.nombre}
                </span>
                {p.id === "maqueta" && <i className="pulso" aria-label={estadoLago === "critico" ? "nivel crítico" : undefined} />}
              </a>
            ))}
          </nav>
        </header>

        {pantallas.map((p) => (
          <section
            key={p.id}
            id={p.id}
            ref={(el) => void (refs.current[p.id] = el)}
            className={`pantalla pantalla--${p.id}`}
            hidden={p.id !== activa}
            tabIndex={-1}
            aria-label={p.nombre}
          >
            {p.contenido}
          </section>
        ))}

        <div className="paginador" aria-label="Cambiar de pantalla">
          <button type="button" onClick={() => ir(pantallas[indice - 1].id)} disabled={indice === 0} aria-label="Pantalla anterior">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span>
            {indice + 1} de {pantallas.length}
          </span>
          <button
            type="button"
            onClick={() => ir(pantallas[indice + 1].id)}
            disabled={indice === pantallas.length - 1}
            aria-label="Pantalla siguiente"
          >
            <svg viewBox="0 0 24 24" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {avisar && (
          <div className="aviso" role="alert">
            <p>
              <strong>El lago llegó a nivel crítico{simulado ? " (simulación)" : ""}.</strong> Turbidez{" "}
              {Math.round(ultima?.turbidez_ntu ?? 0)} NTU, sólidos disueltos {Math.round(ultima?.tds_ppm ?? 0)} ppm.
            </p>
            <button type="button" className="aviso__ir" onClick={() => ir("maqueta")}>
              Ver la maqueta
            </button>
            <button type="button" className="aviso__cerrar" onClick={() => setCerrado(alerta.episodio)} aria-label="Cerrar aviso">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}
      </div>
    </Activa.Provider>
  );
}
