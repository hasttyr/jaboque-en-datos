"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type ChromaticAberrationEffect } from "postprocessing";
import type { DatosJaboque } from "@/lib/datos";
import { ALTURAS, COLORES, ORIGEN_CIUDAD, construirGeometrias } from "./geometriaJaboque";

// Lo que la página le cuenta a la escena en cada cuadro, sin re-renderizar React.
export type EstadoTiempo = {
  tramo: number; // 0: 1952→1976, 1: 1976→2014
  avance: number; // 0..1 suavizado dentro del tramo
  progreso: number; // 0..1 de todo el recorrido
  brillo: number; // 0..1, máximo a mitad de la transición
  activo: boolean; // la portada está en pantalla
};

const ESCALA = 0.01; // 1000 unidades del mapa → 10 unidades del mundo
const RADIO_MAX = 1550;

/* ------------------------------------------------------------------ */
/* Material de capa: aparece o desaparece según el frente de la ciudad */
/* ------------------------------------------------------------------ */

const vertice = /* glsl */ `
  uniform float uFrente;
  uniform vec2 uOrigen;
  uniform float uModo;     // 0 = año que se va (fuera del frente), 1 = año que llega (dentro), 2 = fijo
  uniform float uCemento;
  uniform float uAltura;
  varying float vDist;
  varying float vAlt;
  varying vec3 vNormal;
  varying vec3 vPos;

  void main() {
    vec3 p = position;
    float d = distance(p.xz, uOrigen);
    vDist = d;
    vAlt = p.y / max(uAltura, 1.0);
    // El cemento nuevo crece detrás del frente: plano justo en el borde, alto 260 unidades atrás.
    if (uCemento > 0.5 && uModo > 0.5 && uModo < 1.5) {
      float crece = 1.0 - smoothstep(uFrente - 260.0, uFrente, d);
      p.y *= max(crece, 0.015);
    }
    vec4 mundo = modelMatrix * vec4(p, 1.0);
    vPos = mundo.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * mundo;
  }
`;

const fragmento = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFrente;
  uniform float uModo;
  uniform float uCemento;
  uniform float uAgua;
  uniform float uIris;
  uniform float uBrillo;
  uniform float uTiempo;
  varying float vDist;
  varying float vAlt;
  varying vec3 vNormal;
  varying vec3 vPos;

  void main() {
    bool dentro = vDist < uFrente;
    if (uModo < 0.5 && dentro) discard;
    if (uModo > 0.5 && uModo < 1.5 && !dentro) discard;

    vec3 col = uColor;

    // Iridiscencia: el humedal vivo cambia de tono con el tiempo y el lugar.
    if (uIris > 0.0) {
      vec3 iris = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vPos.x * 0.12 + vPos.z * 0.09 + uTiempo * 0.06));
      col = mix(col, col * (0.6 + iris * 0.9), uIris);
    }

    // Agua: reflejos que se mueven y brillan por encima de 1 para que el bloom los tome.
    if (uAgua > 0.5) {
      float ola = sin(vPos.x * 9.0 + uTiempo * 1.7) * sin(vPos.z * 7.0 - uTiempo * 1.3);
      col = col * (1.15 + 0.35 * ola) + vec3(0.25, 0.55, 0.8) * smoothstep(0.7, 1.0, ola) * 0.9;
    }

    // Cemento recién llegado: caliente cerca del frente, se enfría hacia blanco.
    float distFrente = uFrente - vDist;
    if (uCemento > 0.5 && uModo > 0.5 && uModo < 1.5) {
      float calor = (1.0 - smoothstep(0.0, 420.0, distFrente)) * uBrillo;
      col = mix(col, vec3(1.0, 0.55, 0.08) * 2.6, calor);
    }

    // Luz simple: una principal cenital y un relleno violeta desde atrás.
    vec3 n = normalize(vNormal);
    float principal = max(dot(n, normalize(vec3(0.35, 1.0, 0.45))), 0.0);
    float relleno = max(dot(n, normalize(vec3(-0.6, 0.2, -0.8))), 0.0);
    col = col * (0.28 + 0.78 * principal) + vec3(0.5, 0.32, 1.0) * relleno * 0.22;

    // Aristas superiores del cemento: líneas de luz que dibujan los edificios.
    if (uCemento > 0.5) col += vec3(0.9) * smoothstep(0.96, 1.0, vAlt) * 0.25;

    // El borde del frente brilla como una onda de choque.
    if (uModo > 0.5 && uModo < 1.5) {
      float borde = 1.0 - smoothstep(0.0, 26.0, abs(distFrente));
      col += vec3(1.0, 0.7, 0.18) * borde * uBrillo * 3.0;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

function crearMaterial(cobertura: string, origen: THREE.Vector2) {
  return new THREE.ShaderMaterial({
    vertexShader: vertice,
    fragmentShader: fragmento,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(COLORES[cobertura] ?? "#888") },
      uFrente: { value: 0 },
      uOrigen: { value: origen },
      uModo: { value: 2 },
      uCemento: { value: cobertura === "Areas Endurecidas" ? 1 : 0 },
      uAgua: { value: cobertura === "Espejo de Agua" ? 1 : 0 },
      uIris: { value: ["Vegetación Acuática", "Vegetación Herbácea", "Arbustales"].includes(cobertura) ? 0.55 : 0 },
      uAltura: { value: ALTURAS[cobertura] ?? 6 },
      uBrillo: { value: 0 },
      uTiempo: { value: 0 },
    },
  });
}

/* ---------------------------- */
/* Onda de choque sobre el piso */
/* ---------------------------- */

const ondaVertice = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const ondaFragmento = /* glsl */ `
  uniform float uRadio;
  uniform float uBrillo;
  uniform float uTiempo;
  uniform vec2 uCentro;
  varying vec2 vUv;
  void main() {
    // vUv centrado en el origen de la ciudad; distancia en unidades del mapa.
    vec2 q = (vUv - 0.5) * 4000.0;
    float d = length(q);
    // Solo cerca del humedal: lejos del mapa la onda se desvanece.
    float cerca = 1.0 - smoothstep(560.0, 900.0, distance(q, uCentro));
    float anillo = exp(-pow((d - uRadio) / 14.0, 2.0)) * 1.6;
    float estela = exp(-pow((d - uRadio) / 120.0, 2.0)) * 0.25 * step(d, uRadio);
    float eco = exp(-pow((d - uRadio * 0.82) / 8.0, 2.0)) * 0.45;
    float pulso = 0.85 + 0.15 * sin(uTiempo * 9.0);
    vec3 col = vec3(1.0, 0.62, 0.15) * (anillo * pulso + estela) + vec3(0.6, 0.35, 1.0) * eco;
    float alfa = (anillo + estela + eco) * uBrillo * cerca;
    if (alfa < 0.003) discard;
    gl_FragColor = vec4(col * 1.5 * cerca, alfa);
  }
`;

/* ------------- */
/* Escena entera */
/* ------------- */

function Escena({ datos, estado }: { datos: DatosJaboque; estado: React.RefObject<EstadoTiempo> }) {
  const { camera, size } = useThree();
  const geometrias = useMemo(() => construirGeometrias(datos), [datos]);
  const origen = useMemo(
    () => new THREE.Vector2(ORIGEN_CIUDAD.x * datos.ancho - datos.ancho / 2, ORIGEN_CIUDAD.y * datos.alto - datos.alto / 2),
    [datos],
  );
  const materiales = useMemo(() => {
    const m: Record<string, THREE.ShaderMaterial[]> = {};
    for (const p of datos.periodos) m[p] = geometrias[p].map((c) => crearMaterial(c.cobertura, origen));
    return m;
  }, [datos, geometrias, origen]);

  const onda = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ondaVertice,
        fragmentShader: ondaFragmento,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uRadio: { value: 0 }, uBrillo: { value: 0 }, uTiempo: { value: 0 }, uCentro: { value: new THREE.Vector2() } },
      }),
    [],
  );

  const grupos = useRef<(THREE.Group | null)[]>([]);
  const mapa = useRef<THREE.Group>(null);
  const objetivo = useMemo(() => new THREE.Vector3(), []);
  const mirada = useMemo(() => new THREE.Vector3(), []);
  const puntero = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      puntero.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      puntero.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", mover, { passive: true });
    return () => window.removeEventListener("pointermove", mover);
  }, []);

  useEffect(
    () => () => {
      Object.values(geometrias).forEach((cs) => cs.forEach((c) => c.geometria.dispose()));
      Object.values(materiales).forEach((ms) => ms.forEach((m) => m.dispose()));
      onda.dispose();
    },
    [geometrias, materiales, onda],
  );

  useFrame((state, delta) => {
    const e = estado.current;
    const t = state.clock.elapsedTime;
    const radio = e.avance * RADIO_MAX;
    const enTransicion = e.avance > 0 && e.avance < 1;

    datos.periodos.forEach((p, i) => {
      const g = grupos.current[i];
      if (!g) return;
      const modo = i === e.tramo ? 0 : i === e.tramo + 1 ? 1 : -1;
      g.visible = modo >= 0;
      if (modo < 0) return;
      for (const m of materiales[p]) {
        m.uniforms.uModo.value = modo;
        m.uniforms.uFrente.value = radio;
        m.uniforms.uBrillo.value = enTransicion ? e.brillo : 0;
        m.uniforms.uTiempo.value = t;
      }
    });

    // El plano de la onda está centrado en la ciudad y girado: su eje v apunta a -z.
    onda.uniforms.uCentro.value.set(-origen.x, origen.y);
    onda.uniforms.uRadio.value = radio;
    onda.uniforms.uBrillo.value = enTransicion ? Math.max(0.25, e.brillo) : 0;
    onda.uniforms.uTiempo.value = t;

    // Cámara: órbita lenta ligada al progreso, más un vaivén y el mouse. Todo amortiguado.
    const ancho = size.width >= 960;
    const az = (ancho ? -0.6 : -0.3) + e.progreso * (ancho ? 0.75 : 0.4) + Math.sin(t * 0.15) * 0.05 + puntero.current.x * 0.1;
    const polar = (ancho ? 0.68 : 0.5) - e.brillo * 0.1 + puntero.current.y * 0.05;
    const dist = (ancho ? 21 : 34) - e.brillo * 1.5;
    objetivo.set(Math.sin(az) * Math.sin(polar) * dist, Math.cos(polar) * dist, Math.cos(az) * Math.sin(polar) * dist);
    const k = 1 - Math.exp(-delta * 3.2);
    camera.position.lerp(objetivo, k);
    mirada.set(ancho ? -4.6 : 0.9, 0, ancho ? 1.9 : -4.6);
    camera.lookAt(mirada);

    if (mapa.current) mapa.current.position.y = Math.sin(t * 0.6) * 0.06;
  });

  return (
    <>
      <group ref={mapa} scale={ESCALA}>
        {datos.periodos.map((p, i) => (
          <group key={p} ref={(g) => void (grupos.current[i] = g)}>
            {geometrias[p].map((c, j) => (
              <mesh key={c.cobertura} geometry={c.geometria} material={materiales[p][j]} />
            ))}
          </group>
        ))}
        {/* Onda: un plano grande centrado en el origen de la ciudad, a ras del piso. */}
        <mesh position={[origen.x, 1.5, origen.y]} rotation={[-Math.PI / 2, 0, 0]} material={onda}>
          <planeGeometry args={[4000, 4000]} />
        </mesh>
      </group>
      <gridHelper args={[40, 40, "#3a2a7a", "#1a1438"]} position={[0, -0.02, 0]} />
    </>
  );
}

function Postproceso({ estado }: { estado: React.RefObject<EstadoTiempo> }) {
  const aberracion = useRef<ChromaticAberrationEffect>(null);
  const desfase = useMemo(() => new THREE.Vector2(0.0004, 0.0004), []);
  useFrame(() => {
    const b = estado.current.avance > 0 && estado.current.avance < 1 ? estado.current.brillo : 0;
    desfase.set(0.0004 + b * 0.0045, 0.0003 + b * 0.0025);
    if (aberracion.current) aberracion.current.offset = desfase;
  });
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
      <ChromaticAberration
        ref={aberracion}
        blendFunction={BlendFunction.NORMAL}
        offset={desfase}
        radialModulation
        modulationOffset={0.25}
      />
      <Vignette eskil={false} offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}

// Solo dibuja mientras la portada está en pantalla.
function Pausa({ estado }: { estado: React.RefObject<EstadoTiempo> }) {
  const { setFrameloop } = useThree();
  useEffect(() => {
    let ultimo = true;
    const id = window.setInterval(() => {
      const a = estado.current.activo;
      if (a !== ultimo) {
        setFrameloop(a ? "always" : "never");
        ultimo = a;
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [estado, setFrameloop]);
  return null;
}

function Jaboque3D({
  datos,
  estado,
  alListo,
}: {
  datos: DatosJaboque;
  estado: React.RefObject<EstadoTiempo>;
  alListo?: () => void;
}) {
  return (
    <Canvas
      className="lienzo-3d"
      dpr={[1, 1.75]}
      camera={{ position: [0, 12, 12], fov: 38, near: 0.1, far: 200 }}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      onCreated={() => alListo?.()}
      aria-hidden
    >
      <Escena datos={datos} estado={estado} />
      <Postproceso estado={estado} />
      <Pausa estado={estado} />
    </Canvas>
  );
}

export default memo(Jaboque3D);
