// Modelo simple del lago a escala. Solo por sí mismo, el agua se mueve un poco (llovizna,
// sedimento que se levanta) sin pasar los límites: así una simulación no manda alertas a
// Telegram sin que nadie lo pida. La tierra y la sal llegan cuando alguien las "echa"
// desde la web (POST /simular/tierra | sal | limpiar). La tierra se asienta sola; la sal
// se diluye muy despacio, como si el lago se renovara con agua limpia.
// La web usa una copia de esta misma lógica para su modo demostración (web/src/lib/maqueta.ts).

export function crearSimulador() {
  let turbidez = 6; // NTU, agua casi limpia
  let tds = 90; // ppm, agua de la llave en Bogotá

  // Igual que los sensores reales, no pasa de 1000 (NTU o ppm).
  const redondear = () => ({
    turbidez_ntu: Math.round(Math.min(turbidez, 1000) * 10) / 10,
    tds_ppm: Math.round(Math.min(tds, 1000)),
  });

  return {
    tierra() {
      // Una pizca: hacen falta unos 3 clics seguidos para pasar el límite de 50 NTU.
      turbidez = Math.min(1500, turbidez + 15 + Math.random() * 10);
    },
    sal() {
      // Un poco de sal: hacen falta unos 4 clics para pasar el límite de 500 ppm.
      tds = Math.min(1500, tds + 100 + Math.random() * 40);
    },
    limpiar() {
      turbidez = 6;
      tds = 90;
    },
    siguiente(automatico = true) {
      if (automatico && Math.random() < 0.06 && turbidez < 20) turbidez += 6 + Math.random() * 10;
      turbidez = Math.max(4, 4 + (turbidez - 4) * 0.98 + (Math.random() - 0.5)); // la tierra se asienta poco a poco
      tds = 90 + (tds - 90) * 0.993 + (Math.random() - 0.5) * 2;
      return redondear();
    },
  };
}
