import MapaJaboque from "@/components/MapaJaboque";
import PerfilRio from "@/components/PerfilRio";
import MaquetaEnVivo from "@/components/MaquetaEnVivo";
import { MapaArrojo, RankingLocalidades, ResiduosMes } from "@/components/Arrojo";
import { datosArrojo, datosJaboque, datosResiduos, datosRio } from "@/lib/datos";
import { FUENTES } from "@/lib/fuentes";
import { Contador, Superficie } from "@/components/movimiento";
import CampoParticulas from "@/components/CampoParticulas";

const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(new Date(iso));
const mes = (yyyymm: string) =>
  new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${yyyymm}-15T00:00:00Z`),
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
      <CampoParticulas />
      <header className="cabecera">
        <a href="#" className="cabecera__marca">
          <svg viewBox="0 0 20 20" aria-hidden>
            <defs>
              <linearGradient id="marca" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8052ff" />
                <stop offset="1" stopColor="#15846e" />
              </linearGradient>
            </defs>
            <path d="M10 2 18 17H2Z" fill="url(#marca)" />
          </svg>
          Jaboque en datos
        </a>
        <nav aria-label="Secciones">
          <a href="#rio">Río Bogotá</a>
          <a href="#basura">Basura</a>
          <a href="#fuentes">Fuentes</a>
          <a href="#maqueta" className="boton-primario">Maqueta en vivo</a>
        </nav>
      </header>

      <section className="seccion seccion--portada" aria-labelledby="titulo-portada">
        <MapaJaboque datos={datosJaboque} />
      </section>

      <section id="rio" className="seccion" aria-labelledby="titulo-rio">
        <div className="seccion__encabezado">
          <h2 id="titulo-rio">El agua de Jaboque termina en un río que ya no respira</h2>
          <p>
            <span className="seccion__fuente">IDEAM, datos.gov.co</span>
            Jaboque desagua en el río Bogotá. El IDEAM mide el oxígeno disuelto a lo largo de su recorrido. Nace en
            Villapinzón con {nacimiento.oxigeno} mg/L y, después de atravesar la ciudad, llega a {peor.oxigeno} mg/L
            en {peor.nombre.split(" · ")[0]}. Sin oxígeno no hay peces, ni insectos acuáticos, ni aves que se
            alimenten de ellos.
          </p>
        </div>
        <PerfilRio estaciones={rio.datos} />
        <p className="nota">
          Promedio de las mediciones del IDEAM desde 2015, ordenadas de nacimiento a desembocadura. El color de cada
          punto representa la turbidez: azul es agua clara, café es agua cargada de sedimentos.
        </p>
      </section>

      <section id="basura" className="seccion" aria-labelledby="titulo-basura">
        <div className="seccion__encabezado">
          <h2 id="titulo-basura">
            <Contador valor={clandestino} duracion={2200} className="cifra-viva" /> toneladas de basura tirada en la calle en un solo mes
          </h2>
          <p>
            <span className="seccion__fuente">UAESP, datosabiertos.bogota.gov.co</span>
            En {mes(residuos.datos.mes)}, Bogotá recogió {fmt.format(residuos.datos.total)} toneladas de residuos. El{" "}
            {pctClandestino}% vino de arrojo clandestino: escombros, colchones y bolsas dejados en aceras, canales y
            orillas de los humedales. Lo que no se recoge, la lluvia lo arrastra al agua.
          </p>
        </div>
        <div className="basura">
          <MapaArrojo puntos={arrojo.datos} />
          <div className="basura__datos">
            <h3>Puntos críticos por localidad</h3>
            <RankingLocalidades puntos={arrojo.datos} />
            <h3>Residuos recogidos en {mes(residuos.datos.mes)}</h3>
            <ResiduosMes residuos={residuos.datos} />
          </div>
        </div>
      </section>

      <section id="maqueta" className="seccion seccion--maqueta" aria-labelledby="titulo-maqueta">
        <Superficie />
        <div className="seccion__encabezado">
          <h2 id="titulo-maqueta">Jaboque a escala</h2>
          <p>
            <span className="seccion__fuente">Sensores en tiempo real</span>
            Construimos un modelo del humedal con sensores que miden lo mismo que el IDEAM en el río: qué tan turbia
            está el agua, cuántos sólidos lleva disueltos y su temperatura. Una barrera flotante atrapa la basura
            que cae al lago y una balanza la pesa. Cada dos segundos la maqueta envía una lectura a esta página.
          </p>
        </div>
        <MaquetaEnVivo />
        <ol className="flujo" aria-label="Cómo viajan los datos">
          <li>
            <strong>Sensores</strong>Turbidez, sólidos disueltos, temperatura, peso y un contador de objetos.
          </li>
          <li>
            <strong>ESP32</strong>Lee los sensores y envía las lecturas por WiFi.
          </li>
          <li>
            <strong>Servidor local</strong>Un portátil recibe las lecturas y las retransmite al instante.
          </li>
          <li>
            <strong>Esta página</strong>Muestra el estado del lago mientras ocurre.
          </li>
        </ol>
      </section>

      <section className="seccion seccion--cts" aria-labelledby="titulo-cts">
        <h2 id="titulo-cts">Por qué un humedal es un problema de ciencia, tecnología y sociedad</h2>
        <div className="cts">
          <p>
            <strong>Ciencia.</strong> Los datos existen: el IDEAM, la Secretaría de Ambiente y la UAESP los publican
            gratis. Medir no basta; el reto es que alguien los lea y entienda qué está pasando con el agua.
          </p>
          <p>
            <strong>Tecnología.</strong> Un sensor de turbidez cuesta menos que un almuerzo semanal. Con piezas así,
            un colegio o una junta de acción comunal podría vigilar su propio humedal en vez de esperar un informe
            anual.
          </p>
          <p>
            <strong>Sociedad.</strong> Jaboque no se llenó de cemento ni de basura por accidente. Fueron decisiones
            de urbanización, de recolección y de cada persona que tira algo en la orilla. Ver el daño en tiempo real
            hace más difícil ignorarlo.
          </p>
        </div>
      </section>

      <footer id="fuentes" className="pie">
        <h2>Fuentes</h2>
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
          {respaldo && " Algún portal no respondió en la última consulta, así que parte de los datos viene de la copia guardada más reciente."}{" "}
          Proyecto final del curso Contexto: Ciencia, Tecnología y Sociedad.
        </p>
      </footer>
    </main>
  );
}
