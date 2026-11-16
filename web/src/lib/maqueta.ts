// Lecturas de la maqueta, la regla de alerta y el simulador del modo demostración.
// La regla y el simulador son copia de iot-server/alertas.mjs y iot-server/simulacion.mjs:
// así la web dice "crítico" exactamente cuando el servidor manda la alerta a Telegram.

export type Lectura = {
  ts: string;
  origen: "maqueta" | "simulador" | "demo";
  turbidez_ntu?: number;
  tds_ppm?: number;
};

export const UMBRALES = { turbidez_ntu: 50, tds_ppm: 500 } as const;

// Lo máximo que miden los sensores de la maqueta (NTU y ppm). En el tope, el valor real puede ser mayor.
export const LIMITE_SENSOR = 1000;
export const saturado = (v?: number) => v != null && v >= LIMITE_SENSOR;
export const textoValor = (v = 0) => (saturado(v) ? `más de ${LIMITE_SENSOR}` : String(Math.round(v)));
const CAMPOS = ["turbidez_ntu", "tds_ppm"] as const;
const LECTURAS_SEGUIDAS = 3;
const HISTERESIS = 0.8;

export type EstadoAlerta = { seguidas: number; critico: boolean; episodio: number };
export const SIN_ALERTA: EstadoAlerta = { seguidas: 0, critico: false, episodio: 0 };

// Crítico tras 3 lecturas seguidas sobre algún límite; vuelve a normal cuando todo baja del 80 %.
export function evaluarAlerta(e: EstadoAlerta, l: Lectura): EstadoAlerta {
  const campos = CAMPOS.filter((c) => l[c] != null);
  if (campos.length === 0) return e;
  const pasa = campos.some((c) => l[c]! > UMBRALES[c]);
  const normal = campos.every((c) => l[c]! < UMBRALES[c] * HISTERESIS);
  const seguidas = pasa ? e.seguidas + 1 : 0;
  if (!e.critico && seguidas >= LECTURAS_SEGUIDAS) return { seguidas, critico: true, episodio: e.episodio + 1 };
  if (e.critico && normal) return { seguidas, critico: false, episodio: e.episodio };
  return { ...e, seguidas };
}

export function crearSimulador() {
  let turbidez = 6;
  let tds = 90;

  // Igual que los sensores reales, no pasa de 1000 (NTU o ppm).
  const redondear = () => ({
    turbidez_ntu: Math.round(Math.min(turbidez, LIMITE_SENSOR) * 10) / 10,
    tds_ppm: Math.round(Math.min(tds, LIMITE_SENSOR)),
  });

  return {
    tierra() {
      turbidez = Math.min(1500, turbidez + 70 + Math.random() * 40);
    },
    sal() {
      tds = Math.min(1500, tds + 480 + Math.random() * 120);
    },
    limpiar() {
      turbidez = 6;
      tds = 90;
    },
    siguiente(automatico = true) {
      // Solo, el agua se mueve un poco sin pasar el límite; la tierra y la sal las echa alguien.
      if (automatico && Math.random() < 0.06 && turbidez < 20) turbidez += 6 + Math.random() * 10;
      turbidez = Math.max(4, 4 + (turbidez - 4) * 0.97 + (Math.random() - 0.5));
      tds = 90 + (tds - 90) * 0.993 + (Math.random() - 0.5) * 2;
      return redondear();
    },
    actual: redondear,
  };
}

// Del agua clara al lodo, en una escala logarítmica de turbidez (0–1).
export const sucio = (ntu = 0) => Math.min(1, Math.log10(Math.max(1, ntu)) / Math.log10(300));
