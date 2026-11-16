// Modelo simple del lago a escala. De vez en cuando "alguien" echa tierra (sube la turbidez)
// o sal (sube los sólidos disueltos). La tierra se asienta sola; la sal se diluye muy despacio,
// como si el lago se renovara con agua limpia.
// La web usa una copia de esta misma lógica para su modo demostración (web/src/lib/maqueta.ts).

export function crearSimulador() {
  let turbidez = 6; // NTU, agua casi limpia
  let tds = 90; // ppm, agua de la llave en Bogotá

  const redondear = () => ({ turbidez_ntu: Math.round(turbidez * 10) / 10, tds_ppm: Math.round(tds) });

  return {
    tierra() {
      turbidez += 45 + Math.random() * 40;
    },
    sal() {
      tds += 160 + Math.random() * 80;
    },
    siguiente() {
      if (Math.random() < 0.05) this.tierra();
      if (Math.random() < 0.015) this.sal();
      turbidez = Math.max(4, 4 + (turbidez - 4) * 0.97 + (Math.random() - 0.5));
      tds = 90 + (tds - 90) * 0.993 + (Math.random() - 0.5) * 2;
      return redondear();
    },
  };
}
