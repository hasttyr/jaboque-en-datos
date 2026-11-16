import MapaJaboque from "@/components/MapaJaboque";
import PerfilRio from "@/components/PerfilRio";
import MaquetaEnVivo from "@/components/MaquetaEnVivo";
import Estacion from "@/components/Estacion";
import { MapaArrojo, RankingLocalidades, ResiduosMes } from "@/components/Arrojo";
import { Contador } from "@/components/movimiento";
import { datosArrojo, datosJaboque, datosResiduos, datosRio } from "@/lib/datos";
import { FUENTES } from "@/lib/fuentes";

const IMPACTOS = [
  {
    titulo: "Vecinos que vigilan su propio humedal",
    texto:
      "Con unos 110.000 pesos en piezas, un colegio o una junta de acción comunal puede medir el agua cada pocos segundos y recibir alertas en el celular, en lugar de esperar un informe anual.",
    quien: "Comunidades, colegios y juntas de acción comunal",
  },
  {
    titulo: "Alertas antes de que el daño sea irreversible",
    texto:
      "Un salto brusco en la turbidez o en los sólidos disueltos suele delatar un vertimiento. Saberlo en minutos permite avisar a la autoridad ambiental mientras todavía se puede encontrar el origen.",
    quien: "Autoridades ambientales y empresas de acueducto",
  },
  {
    titulo: "Recolección donde de verdad cae la basura",
    texto:
      "Cruzar los puntos críticos de arrojo con la calidad del agua medida cerca de ellos ayuda a decidir qué rutas reforzar y dónde poner contenedores.",
    quien: "Operadores de aseo y alcaldías locales",
  },
  {
    titulo: "Un modelo que se copia a otros humedales",
    texto:
      "El código y la guía de construcción son abiertos. La misma maqueta sirve para Juan Amarillo, Córdoba o La Conejera, o para un lago en cualquier ciudad que publique datos abiertos.",
    quien: "Universidades, semilleros de investigación y otras ciudades",
  },
  {
    titulo: "Educación ambiental que se ve",
    texto:
      "Ver cómo se enturbia el agua y llega la alerta al celular convence más que una cifra en un informe. La maqueta funciona igual en un aula, una feria de ciencia o un museo.",
    quien: "Docentes, museos y ferias de ciencia",
  },
];

const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(new Date(iso));
const mes = (yyyymm: string) =>
  new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${yyyymm}-15T00:00:00Z`),
  );

const Icono = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
);

export default async function Inicio() {
  const [rio, arrojo, residuos] = await Promise.all([datosRio(), datosArrojo(), datosResiduos()]);

  const nacimiento = rio.datos[0];
  const peor = rio.datos.reduce((a, b) => ((b.oxigeno ?? 99) < (a.oxigeno ?? 99) ? b : a));
  const clandestino = residuos.datos.porTipo.find((t) => t.tipo === "Arrojo clandestino")?.toneladas ?? 0;
  const pctClandestino = Math.round((clandestino / residuos.datos.total) * 100);
  const respaldo = [rio, arrojo, residuos].some((r) => !r.enVivo);

  return (
    <main>
      <Estacion
        pantallas={[
          {
            id: "jaboque",
            nombre: "Jaboque",
            icono: <Icono d="M3 15c3-2 6-2 9 0s6 2 9 0M3 19c3-2 6-2 9 0s6 2 9 0M7 12V4M12 11V2M17 12V6" />,
            contenido: <MapaJaboque datos={datosJaboque} />,
          },
          {
            id: "rio",
            nombre: "Río Bogotá",
            corto: "Río",
            icono: <Icono d="M4 3c6 4-4 8 2 12s-2 6 2 6M14 3c6 4-4 8 2 12s-2 6 2 6" />,
            contenido: (
              <div className="rio-pantalla">
                <div className="encabezado">
                  <h2>El agua de Jaboque termina en un río que ya no respira</h2>
                  <p>
                    Jaboque desagua en el río Bogotá. El IDEAM mide su oxígeno disuelto de punta a punta: nace en
                    Villapinzón con {nacimiento.oxigeno} mg/L y, después de atravesar la ciudad, llega a{" "}
                    {peor.oxigeno} mg/L en {peor.nombre.split(" · ")[0]}. Sin oxígeno no hay peces, ni insectos
                    acuáticos, ni aves que se alimenten de ellos.
                  </p>
                  <p className="nota">
                    Promedio de las mediciones del IDEAM desde 2015 (datos.gov.co), de nacimiento a desembocadura. El
                    color de cada punto es la turbidez: azul es agua clara, café es agua cargada de sedimentos.
                  </p>
                </div>
                <PerfilRio estaciones={rio.datos} />
              </div>
            ),
          },
          {
            id: "basura",
            nombre: "Basura",
            icono: <Icono d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
            contenido: (
              <div className="basura">
                <div className="basura__texto">
                  <h2>
                    <Contador valor={clandestino} className="cifra" />
                    <span>toneladas de basura tirada en la calle en un solo mes</span>
                  </h2>
                  <p>
                    En {mes(residuos.datos.mes)}, Bogotá recogió {fmt.format(residuos.datos.total)} toneladas de
                    residuos. El {pctClandestino} % vino de arrojo clandestino: escombros, colchones y bolsas dejados en
                    aceras, canales y orillas de los humedales. Lo que no se recoge, la lluvia lo arrastra al agua.
                  </p>
                  <ResiduosMes residuos={residuos.datos} />
                  <p className="nota">UAESP, datosabiertos.bogota.gov.co</p>
                </div>
                <MapaArrojo puntos={arrojo.datos} />
                <div className="basura__ranking">
                  <h3>Puntos críticos de arrojo por localidad</h3>
                  <RankingLocalidades puntos={arrojo.datos} />
                </div>
              </div>
            ),
          },
          {
            id: "maqueta",
            nombre: "Maqueta en vivo",
            corto: "Maqueta",
            icono: <Icono d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" />,
            contenido: <MaquetaEnVivo />,
          },
          {
            id: "impacto",
            nombre: "Impacto",
            icono: <Icono d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z" />,
            contenido: (
              <div className="impacto">
                <div className="encabezado">
                  <h2>Un humedal que se mide se puede defender</h2>
                  <p>
                    La maqueta es una prueba de concepto. Demuestra que vigilar un humedal ya no exige un laboratorio:
                    con datos abiertos y sensores de bajo costo, cualquier persona puede ver lo que le pasa al agua y
                    actuar a tiempo.
                  </p>
                </div>
                <ul className="impactos">
                  {IMPACTOS.map((i) => (
                    <li key={i.titulo}>
                      <h3>{i.titulo}</h3>
                      <p>{i.texto}</p>
                      <p className="impactos__quien">{i.quien}</p>
                    </li>
                  ))}
                  <li className="impactos__cierre">
                    <p>
                      Jaboque no se llenó de cemento ni de basura por accidente. Fueron decisiones de urbanización, de
                      recolección y de cada persona que tira algo en la orilla. Ver el daño mientras ocurre hace más
                      difícil ignorarlo.
                    </p>
                    <a href="#fuentes" className="solo-movil">
                      Ver las fuentes de los datos
                    </a>
                  </li>
                </ul>
              </div>
            ),
          },
          {
            id: "fuentes",
            nombre: "Fuentes",
            icono: <Icono d="M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h8" />,
            soloEscritorio: true,
            contenido: (
              <div className="fuentes">
                <h2>De dónde salen los datos</h2>
                <ul>
                  {Object.values(FUENTES).map((f) => (
                    <li key={f.url}>
                      <a href={f.url} target="_blank" rel="noreferrer">
                        {f.nombre}
                      </a>
                      <span>{f.portal}</span>
                    </li>
                  ))}
                </ul>
                <p className="nota">
                  Datos consultados el {fecha(rio.consultado)}.
                  {respaldo &&
                    " Algún portal no respondió en la última consulta, así que parte de los datos viene de la copia guardada más reciente."}{" "}
                  Las lecturas de la maqueta vienen de sus propios sensores. Proyecto final del curso Contexto: Ciencia,
                  Tecnología y Sociedad.
                </p>
              </div>
            ),
          },
        ]}
      />
    </main>
  );
}
