// Modelo simple del lago a escala: cada cierto tiempo "alguien" arroja un objeto.
// Cada objeto suma peso, enturbia el agua y aumenta los sólidos disueltos;
// con el tiempo la turbidez baja (sedimentación) pero los sólidos disueltos no.
// La web usa una copia de esta misma lógica para su modo demo.

export function crearSimulador() {
  let turbidez = 8; // NTU, agua casi limpia
  let tds = 180; // ppm
  let basura = 0; // gramos en la canasta
  let objetos = 0;
  let t = 0;

  return {
    siguiente() {
      t++;
      if (Math.random() < 0.22) {
        const peso = 5 + Math.random() * 40; // tapas, empaques, botellas pequeñas
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
