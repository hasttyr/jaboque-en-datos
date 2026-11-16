"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { crearSimulador, evaluarAlerta, SIN_ALERTA, type EstadoAlerta, type Lectura } from "@/lib/maqueta";

export type Modo = "conectando" | "conectado" | "demo";

const SERVIDOR_POR_DEFECTO = "http://localhost:4000";
const CLAVE = "servidor-maqueta";
const MAX_LECTURAS = 60;

/* ---------- Dirección del servidor, guardada en este navegador ---------- */

const oyentes = new Set<() => void>();
function suscribirServidor(f: () => void) {
  oyentes.add(f);
  window.addEventListener("storage", f);
  return () => {
    oyentes.delete(f);
    window.removeEventListener("storage", f);
  };
}
function leerServidor() {
  try {
    return localStorage.getItem(CLAVE) || SERVIDOR_POR_DEFECTO;
  } catch {
    return SERVIDOR_POR_DEFECTO;
  }
}
function guardarServidor(url: string) {
  try {
    localStorage.setItem(CLAVE, url);
  } catch {}
  oyentes.forEach((f) => f());
}

/* ---------- Lecturas y estado de alerta ---------- */

type Estado = { lecturas: Lectura[]; alerta: EstadoAlerta };
type Accion = { tipo: "historial"; lecturas: Lectura[] } | { tipo: "lectura"; lectura: Lectura } | { tipo: "vaciar" };

function reducir(s: Estado, a: Accion): Estado {
  if (a.tipo === "vaciar") return { lecturas: [], alerta: { ...SIN_ALERTA, episodio: s.alerta.episodio } };
  if (a.tipo === "historial") {
    const lecturas = a.lecturas.slice(-MAX_LECTURAS);
    return { lecturas, alerta: lecturas.reduce(evaluarAlerta, { ...SIN_ALERTA, episodio: s.alerta.episodio }) };
  }
  return { lecturas: [...s.lecturas, a.lectura].slice(-MAX_LECTURAS), alerta: evaluarAlerta(s.alerta, a.lectura) };
}

type Maqueta = {
  modo: Modo;
  servidor: string;
  cambiarServidor: (url: string) => void;
  lecturas: Lectura[];
  ultima?: Lectura;
  alerta: EstadoAlerta;
  simulado: boolean;
  telegram: boolean; // el servidor del portátil manda las alertas a Telegram
  // Echar tierra o sal: al servidor si está simulando, al simulador del navegador en modo demostración.
  // null cuando hay una maqueta real conectada.
  demo: { tierra: () => void; sal: () => void; limpiar: () => void } | null;
};

type AccionDemo = "tierra" | "sal" | "limpiar";

const Contexto = createContext<Maqueta | null>(null);

export function useMaqueta() {
  const m = useContext(Contexto);
  if (!m) throw new Error("useMaqueta va dentro de <ConexionMaqueta>");
  return m;
}

export default function ConexionMaqueta({ children }: { children: React.ReactNode }) {
  const servidor = useSyncExternalStore(suscribirServidor, leerServidor, () => SERVIDOR_POR_DEFECTO);
  const [modo, setModo] = useState<Modo>("conectando");
  const [intento, setIntento] = useState(0);
  const [config, setConfig] = useState({ simulando: false, telegram: false });
  const [estado, despachar] = useReducer(reducir, { lecturas: [], alerta: SIN_ALERTA });
  const sim = useRef<ReturnType<typeof crearSimulador>>(null);
  sim.current ??= crearSimulador();

  // Escucha el servidor local. Si no responde, pasa a modo demostración.
  useEffect(() => {
    let abierta = false;
    let plazo: ReturnType<typeof setTimeout> | undefined;
    let es: EventSource;
    try {
      es = new EventSource(`${servidor.replace(/\/$/, "")}/stream`);
    } catch {
      const t = setTimeout(() => setModo("demo"));
      return () => clearTimeout(t);
    }
    const pasarADemo = () => {
      es.close();
      setModo((m) => {
        if (m !== "demo") despachar({ tipo: "vaciar" });
        return "demo";
      });
    };
    es.addEventListener("config", (ev) => setConfig(JSON.parse((ev as MessageEvent).data)));
    es.addEventListener("historial", (ev) => {
      abierta = true;
      setModo("conectado");
      despachar({ tipo: "historial", lecturas: JSON.parse((ev as MessageEvent).data) });
    });
    es.addEventListener("lectura", (ev) => despachar({ tipo: "lectura", lectura: JSON.parse((ev as MessageEvent).data) }));
    es.onopen = () => {
      clearTimeout(plazo);
      plazo = undefined;
    };
    es.onerror = () => {
      if (!abierta) return pasarADemo();
      // Se cayó después de conectar: EventSource reintenta solo; si en 6 s no vuelve, modo demostración.
      setModo("conectando");
      plazo ??= setTimeout(() => {
        if (es.readyState !== EventSource.OPEN) pasarADemo();
      }, 6000);
    };
    return () => {
      clearTimeout(plazo);
      es.close();
    };
  }, [servidor, intento]);

  // Modo demostración: el navegador genera las lecturas y cada 20 s vuelve a buscar el servidor.
  useEffect(() => {
    if (modo !== "demo") return;
    const lectura = () => despachar({ tipo: "lectura", lectura: { ts: new Date().toISOString(), origen: "demo", ...sim.current!.siguiente() } });
    const tick = setInterval(lectura, 2000);
    const reintento = setInterval(() => setIntento((i) => i + 1), 20000);
    return () => {
      clearInterval(tick);
      clearInterval(reintento);
    };
  }, [modo]);

  const enNavegador = useCallback((a: AccionDemo) => {
    const s = sim.current!;
    s[a]();
    despachar({ tipo: "lectura", lectura: { ts: new Date().toISOString(), origen: "demo", ...s.siguiente(false) } });
  }, []);

  // La lectura nueva llega por el stream, como cualquier otra.
  const enServidor = useCallback(
    (a: AccionDemo) => void fetch(`${servidor.replace(/\/$/, "")}/simular/${a}`, { method: "POST" }).catch(() => {}),
    [servidor],
  );

  const cambiarServidor = useCallback((url: string) => {
    setModo("conectando");
    guardarServidor(url.trim() || SERVIDOR_POR_DEFECTO);
    setIntento((i) => i + 1);
  }, []);

  const ultima = estado.lecturas.at(-1);

  const destino = modo === "demo" ? "navegador" : modo === "conectado" && config.simulando ? "servidor" : null;
  const valor = useMemo<Maqueta>(
    () => ({
      modo,
      servidor,
      cambiarServidor,
      lecturas: estado.lecturas,
      ultima,
      alerta: estado.alerta,
      simulado: modo === "demo" || (modo === "conectado" && config.simulando) || ultima?.origen === "simulador",
      telegram: modo === "conectado" && config.telegram,
      demo: destino && {
        tierra: () => (destino === "navegador" ? enNavegador : enServidor)("tierra"),
        sal: () => (destino === "navegador" ? enNavegador : enServidor)("sal"),
        limpiar: () => (destino === "navegador" ? enNavegador : enServidor)("limpiar"),
      },
    }),
    [modo, servidor, cambiarServidor, estado, ultima, config, destino, enNavegador, enServidor],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
