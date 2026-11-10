// Copia de iot-server/simulacion.mjs para el modo demo de la web.
export type Lectura = {
  ts: string;
  origen: "maqueta" | "simulador" | "demo";
  turbidez_ntu?: number;
  tds_ppm?: number;
  temperatura_c?: number;
  basura_g?: number;
  objetos?: number;
};

export function crearSimulador() {
  let turbidez = 8;
  let tds = 180;
  let basura = 0;
  let objetos = 0;
  let t = 0;

  return {
    siguiente(forzarObjeto = false): Omit<Lectura, "ts" | "origen"> {
      t++;
      if (forzarObjeto || Math.random() < 0.22) {
        const peso = 5 + Math.random() * 40;
        objetos++;
        basura += peso;
        turbidez += 6 + Math.random() * 18;
        tds += 4 + Math.random() * 10;
      }
      turbidez = Math.max(5, turbidez * 0.97 + (Math.random() - 0.5));
      tds += (Math.random() - 0.45) * 0.8;
      return {
        turbidez_ntu: Math.round(turbidez * 10) / 10,
        tds_ppm: Math.round(tds),
        temperatura_c: Math.round((17 + Math.sin(t / 40) * 0.8 + (Math.random() - 0.5) * 0.2) * 10) / 10,
        basura_g: Math.round(basura),
        objetos,
      };
    },
  };
}
