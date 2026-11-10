"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type ChromaticAberrationEffect } from "postprocessing";

// Lo que la sección de la maqueta le cuenta a la escena. Se lee en cada cuadro, sin React.
export type EstadoLago = {
  turbidez: number; // NTU
  tds: number; // ppm
  basura: number; // g
  objetos: number; // contador acumulado del sensor
  lecturas: number; // sube con cada lectura recibida (para el destello de los sensores)
  demo: boolean; // en modo demostración se puede arrojar basura tocando el agua
  activo: boolean; // la sección está en pantalla
};

const RX = 4.3; // semiejes del lago (elipse)
const RZ = 2.9;
const MAX_GOTAS = 8;
const MAX_BASURA = 40;
const SALPICADURA = 14; // gotas por objeto
const MAX_SALPICADURA = SALPICADURA * 16;
const BARRERA_X = 3.1;

// Mismas olas que el shader, para que la basura flote sobre ellas.
function alturaOla(x: number, z: number, t: number) {
  return 0.06 * Math.sin(x * 1.6 + t * 1.1) + 0.04 * Math.sin(z * 2.3 - t * 1.4) + 0.025 * Math.sin((x + z) * 3.1 + t * 2.0);
}

const dentroLago = (x: number, z: number, margen = 0.85) => (x / (RX * margen)) ** 2 + (z / (RZ * margen)) ** 2 < 1;

/* ------------- */
/* Agua (shader) */
/* ------------- */

const aguaVertice = /* glsl */ `
  uniform float uTiempo;
  uniform vec4 uGotas[${MAX_GOTAS}];
  varying vec3 vPos;
  varying float vOnda;
  void main() {
    vec3 p = position;
    float t = uTiempo;
    float h = 0.06 * sin(p.x * 1.6 + t * 1.1) + 0.04 * sin(p.z * 2.3 - t * 1.4) + 0.025 * sin((p.x + p.z) * 3.1 + t * 2.0);
    float onda = 0.0;
    for (int i = 0; i < ${MAX_GOTAS}; i++) {
      vec4 g = uGotas[i];
      float edad = t - g.z;
      if (g.w > 0.5 && edad > 0.0 && edad < 5.0) {
        float d = distance(p.xz, g.xy);
        float r = edad * 1.5;
        onda += 0.16 * exp(-edad * 0.8) * sin((d - r) * 10.0) * exp(-pow(d - r, 2.0) * 2.5);
      }
    }
    h += onda;
    p.y += h;
    vOnda = onda;
    vec4 mundo = modelMatrix * vec4(p, 1.0);
    vPos = mundo.xyz;
    gl_Position = projectionMatrix * viewMatrix * mundo;
  }
`;

const aguaFragmento = /* glsl */ `
  uniform float uTiempo;
  uniform float uTurbidez;
  varying vec3 vPos;
  varying float vOnda;
  void main() {
    // Borde del lago: elipse con una orilla irregular.
    float borde = pow(vPos.x / ${RX.toFixed(2)}, 2.0) + pow(vPos.z / ${RZ.toFixed(2)}, 2.0);
    borde += 0.035 * sin(atan(vPos.z, vPos.x) * 7.0) + 0.02 * sin(atan(vPos.z, vPos.x) * 13.0 + 1.3);
    if (borde > 1.0) discard;

    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
    if (n.y < 0.0) n = -n;
    vec3 vista = normalize(cameraPosition - vPos);
    vec3 luz = normalize(vec3(-0.4, 1.0, 0.6));
    float fresnel = pow(1.0 - max(dot(n, vista), 0.0), 3.0);
    float brillo = pow(max(dot(reflect(-luz, n), vista), 0.0), 70.0);

    vec3 hondo = vec3(0.02, 0.16, 0.28);
    vec3 claro = vec3(0.12, 0.62, 0.86);
    vec3 turbio = vec3(0.40, 0.28, 0.12);
    vec3 col = mix(hondo, claro, 0.35 + 0.65 * fresnel);
    col = mix(col, turbio * (0.7 + 0.5 * fresnel), uTurbidez);

    // Mancha de contaminación: película iridiscente que aparece cuando el agua se ensucia.
    float pelicula = 0.5 + 0.5 * sin(vPos.x * 1.3 + vPos.z * 2.1 + uTiempo * 0.4);
    vec3 iris = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fresnel * 2.0 + pelicula + uTiempo * 0.05));
    col += iris * smoothstep(0.5, 1.0, uTurbidez) * pelicula * 0.4;

    col += vec3(1.0, 0.95, 0.85) * brillo * 2.2;      // destello del sol
    col += vec3(0.85, 0.95, 1.0) * abs(vOnda) * 5.0;  // espuma de las ondas
    float alfa = (1.0 - smoothstep(0.88, 1.0, borde)) * mix(0.78, 0.95, uTurbidez);
    gl_FragColor = vec4(col, alfa);
  }
`;

/* -------------------------------- */
/* Basura que cae, salpica y flota */
/* -------------------------------- */

type Objeto = {
  x: number; z: number; y: number; vy: number;
  enAgua: boolean; fase: number; giro: number; tipo: number; vivo: boolean;
};

const TIPOS = [
  { geo: () => new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), color: "#e8f4ff" }, // botella
  { geo: () => new THREE.CylinderGeometry(0.07, 0.07, 0.035, 12), color: "#ff4d6d" }, // tapa
  { geo: () => new THREE.IcosahedronGeometry(0.12, 0), color: "#f1ead2" }, // bolsa
  { geo: () => new THREE.BoxGeometry(0.16, 0.05, 0.11), color: "#ffb829" }, // empaque
];

function Escena({
  estado,
  alArrojar,
}: {
  estado: React.RefObject<EstadoLago>;
  alArrojar: React.RefObject<((x: number, z: number) => void) | null>;
}) {
  const { camera, size } = useThree();

  /* Agua */
  const gotas = useMemo(() => Array.from({ length: MAX_GOTAS }, () => new THREE.Vector4(0, 0, -99, 0)), []);
  const agua = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: aguaVertice,
        fragmentShader: aguaFragmento,
        transparent: true,
        uniforms: { uTiempo: { value: 0 }, uTurbidez: { value: 0 }, uGotas: { value: gotas } },
      }),
    [gotas],
  );
  const siguienteGota = useRef(0);
  // Plano ya acostado: el shader trabaja en x/z del mundo.
  const planoAgua = useMemo(() => new THREE.PlaneGeometry(RX * 2.1, RZ * 2.1, 170, 120).rotateX(-Math.PI / 2), []);

  /* Orilla */
  const orilla = useMemo(() => {
    const exterior = new THREE.Shape().absellipse(0, 0, RX + 0.75, RZ + 0.6, 0, Math.PI * 2, false, 0);
    exterior.holes.push(new THREE.Path().absellipse(0, 0, RX - 0.05, RZ - 0.05, 0, Math.PI * 2, true, 0));
    const g = new THREE.ExtrudeGeometry(exterior, { depth: 0.32, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 64 });
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.12, 0);
    return g;
  }, []);

  /* Juncos alrededor de la orilla */
  const juncos = useRef<THREE.InstancedMesh>(null);
  const datosJuncos = useMemo(
    () =>
      Array.from({ length: 150 }, (_, i) => {
        const a = (i / 150) * Math.PI * 2 + Math.sin(i * 7.1) * 0.03;
        const r = 1.02 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.14;
        return { x: Math.cos(a) * RX * r, z: Math.sin(a) * RZ * r, h: 0.45 + ((i * 37) % 11) / 18, fase: i * 0.7 };
      }).filter((j) => j.x < BARRERA_X), // la salida al este queda despejada
    [],
  );
  const aux = useMemo(() => new THREE.Object3D(), []);

  /* Suspendidos (TDS) */
  const MAX_PUNTOS = 900;
  const suspendidos = useRef<THREE.Points>(null);
  const posSusp = useMemo(() => {
    const a = new Float32Array(MAX_PUNTOS * 3);
    for (let i = 0; i < MAX_PUNTOS; i++) {
      let x = 0, z = 0;
      do { x = (Math.random() * 2 - 1) * RX; z = (Math.random() * 2 - 1) * RZ; } while (!dentroLago(x, z, 0.92));
      a[i * 3] = x; a[i * 3 + 1] = -0.05 - Math.random() * 0.5; a[i * 3 + 2] = z;
    }
    return a;
  }, []);

  /* Basura */
  const objetos = useRef<Objeto[]>(
    Array.from({ length: MAX_BASURA }, (_, i) => ({ x: 0, z: 0, y: -10, vy: 0, enAgua: false, fase: i * 1.7, giro: i * 0.9, tipo: i % TIPOS.length, vivo: false })),
  );
  const mallas = useRef<(THREE.Mesh | null)[]>([]);
  const geometriasBasura = useMemo(() => TIPOS.map((t) => t.geo()), []);
  const materialesBasura = useMemo(
    () => TIPOS.map((t) => new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.35, metalness: 0.05, emissive: t.color, emissiveIntensity: 0.15 })),
    [],
  );
  const contados = useRef(-1);
  const siguienteObjeto = useRef(0);
  const posicionPedida = useRef<{ x: number; z: number } | null>(null);

  /* Salpicaduras */
  const salpicadura = useRef<THREE.Points>(null);
  const salp = useMemo(
    () => ({ pos: new Float32Array(MAX_SALPICADURA * 3).fill(-10), vel: new Float32Array(MAX_SALPICADURA * 3), vida: new Float32Array(MAX_SALPICADURA) }),
    [],
  );
  const siguienteSalp = useRef(0);
  const sacudida = useRef(0); // para la aberración cromática

  /* Sensores, barrera y canasta */
  const sensores = useRef<(THREE.Mesh | null)[]>([]);
  const ultimaLectura = useRef(0);
  const pulso = useRef(0);
  const canasta = useRef<THREE.Mesh>(null);
  const boyas = useMemo(() => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      pts.push([BARRERA_X - 0.9 + s * 0.9 + 0.35, -1.3 + s * 1.3]);
      if (i < 8) pts.push([BARRERA_X - 0.9 + s * 0.9 + 0.35, 1.3 - s * 1.3]);
    }
    return pts;
  }, []);

  const objetivo = useMemo(() => new THREE.Vector3(), []);
  const puntero = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      puntero.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      puntero.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", mover, { passive: true });
    return () => window.removeEventListener("pointermove", mover);
  }, []);

  // Para arrojar en un punto exacto (clic en el agua en modo demostración).
  useEffect(() => {
    alArrojar.current = (x, z) => (posicionPedida.current = { x, z });
    return () => void (alArrojar.current = null);
  }, [alArrojar]);

  useEffect(
    () => () => {
      agua.dispose();
      planoAgua.dispose();
      orilla.dispose();
      geometriasBasura.forEach((g) => g.dispose());
      materialesBasura.forEach((m) => m.dispose());
    },
    [agua, planoAgua, orilla, geometriasBasura, materialesBasura],
  );

  function lanzar(t: number, enElAire: boolean) {
    const o = objetos.current[siguienteObjeto.current % MAX_BASURA];
    siguienteObjeto.current++;
    let x: number, z: number;
    if (posicionPedida.current) {
      ({ x, z } = posicionPedida.current);
      posicionPedida.current = null;
    } else {
      do { x = (Math.random() * 2 - 1) * RX; z = (Math.random() * 2 - 1) * RZ; } while (!dentroLago(x, z, 0.7));
    }
    Object.assign(o, { x, z, y: enElAire ? 3.2 + Math.random() * 0.8 : alturaOla(x, z, t), vy: 0, enAgua: !enElAire, vivo: true });
  }

  function salpicar(x: number, z: number, t: number) {
    const g = gotas[siguienteGota.current % MAX_GOTAS];
    siguienteGota.current++;
    g.set(x, z, t, 1);
    for (let k = 0; k < SALPICADURA; k++) {
      const i = siguienteSalp.current % MAX_SALPICADURA;
      siguienteSalp.current++;
      const a = Math.random() * Math.PI * 2;
      const v = 0.6 + Math.random() * 1.1;
      salp.pos.set([x, 0.05, z], i * 3);
      salp.vel.set([Math.cos(a) * v * 0.6, 1.6 + Math.random() * 1.8, Math.sin(a) * v * 0.6], i * 3);
      salp.vida[i] = 1;
    }
    sacudida.current = 1;
  }

  useFrame((state, delta) => {
    const e = estado.current;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Turbidez: escala logarítmica, como la percibe el ojo.
    const turb = Math.min(1, Math.log10(Math.max(1, e.turbidez)) / Math.log10(250));
    agua.uniforms.uTiempo.value = t;
    agua.uniforms.uTurbidez.value += (turb - agua.uniforms.uTurbidez.value) * Math.min(1, dt * 1.5);

    // Nuevos objetos: la primera vez se colocan flotando; después caen desde el cielo.
    if (contados.current < 0 && e.lecturas > 0) {
      for (let i = 0; i < Math.min(e.objetos, 14); i++) lanzar(t, false);
      contados.current = e.objetos;
    } else if (contados.current >= 0 && e.objetos < contados.current) {
      // El contador se reinició (cambio de servidor o de modo): seguimos desde el valor nuevo.
      contados.current = e.objetos;
    } else if (contados.current >= 0 && e.objetos > contados.current) {
      for (let i = 0; i < Math.min(e.objetos - contados.current, 4); i++) lanzar(t, true);
      contados.current = e.objetos;
    }

    // Física simple: gravedad, impacto con el agua, flotación y deriva hacia la barrera.
    objetos.current.forEach((o, i) => {
      const m = mallas.current[i];
      if (!m) return;
      m.visible = o.vivo;
      if (!o.vivo) return;
      const superficie = alturaOla(o.x, o.z, t);
      if (!o.enAgua) {
        o.vy -= 9.8 * dt;
        o.y += o.vy * dt;
        if (o.y <= superficie) {
          o.enAgua = true;
          o.y = superficie;
          salpicar(o.x, o.z, t);
        }
      } else {
        o.y += (superficie + 0.03 + Math.sin(t * 2.2 + o.fase) * 0.015 - o.y) * Math.min(1, dt * 8);
        // Corriente hacia la salida (este), con un remolino suave.
        const haciaX = BARRERA_X - 0.4 + Math.sin(o.fase) * 0.25;
        o.x += (haciaX - o.x) * dt * 0.05 + Math.sin(t * 0.4 + o.fase) * dt * 0.05;
        o.z += -o.z * dt * 0.03 + Math.cos(t * 0.35 + o.fase) * dt * 0.05;
      }
      m.position.set(o.x, o.y, o.z);
      m.rotation.set(Math.sin(t * 1.3 + o.fase) * 0.35, o.giro + t * (o.enAgua ? 0.15 : 3), Math.cos(t * 1.1 + o.fase) * 0.3);
    });

    // Salpicaduras.
    const ps = salpicadura.current;
    if (ps) {
      for (let i = 0; i < MAX_SALPICADURA; i++) {
        if (salp.vida[i] <= 0) continue;
        salp.vida[i] -= dt * 0.9;
        salp.vel[i * 3 + 1] -= 7 * dt;
        salp.pos[i * 3] += salp.vel[i * 3] * dt;
        salp.pos[i * 3 + 1] += salp.vel[i * 3 + 1] * dt;
        salp.pos[i * 3 + 2] += salp.vel[i * 3 + 2] * dt;
        if (salp.vida[i] <= 0 || salp.pos[i * 3 + 1] < -0.1) {
          salp.vida[i] = 0;
          salp.pos[i * 3 + 1] = -10;
        }
      }
      ps.geometry.attributes.position.needsUpdate = true;
    }
    sacudida.current = Math.max(0, sacudida.current - dt * 1.6);

    // Juncos que se mecen.
    const j = juncos.current;
    if (j) {
      datosJuncos.forEach((d, i) => {
        aux.position.set(d.x, 0.2 + d.h / 2, d.z);
        aux.rotation.set(Math.sin(t * 1.2 + d.fase) * 0.08, 0, Math.cos(t * 0.9 + d.fase) * 0.08);
        aux.scale.set(1, d.h, 1);
        aux.updateMatrix();
        j.setMatrixAt(i, aux.matrix);
      });
      j.instanceMatrix.needsUpdate = true;
    }

    // Partículas suspendidas según los sólidos disueltos.
    const s = suspendidos.current;
    if (s) {
      const n = Math.round(Math.min(1, Math.max(0.05, (e.tds - 120) / 500)) * MAX_PUNTOS);
      s.geometry.setDrawRange(0, n);
      s.rotation.y = t * 0.01;
    }

    // Destello de los sensores con cada lectura.
    if (e.lecturas !== ultimaLectura.current) {
      ultimaLectura.current = e.lecturas;
      pulso.current = 1;
    }
    pulso.current = Math.max(0, pulso.current - dt * 2.2);
    sensores.current.forEach((m) => m?.scale.setScalar(1 + pulso.current * 0.7));

    // La canasta se llena con los gramos recogidos.
    if (canasta.current) {
      const lleno = Math.min(1, e.basura / 2500);
      canasta.current.scale.y += (Math.max(0.02, lleno) - canasta.current.scale.y) * Math.min(1, dt * 3);
      canasta.current.position.y = 0.05 + canasta.current.scale.y * 0.3;
    }

    // Cámara: vaivén lento + mouse.
    // En pantallas angostas la cámara se aleja para que quepan la orilla y la canasta.
    const lejos = Math.max(1.12, 1.45 - (size.width / size.height) * 0.2);
    objetivo.set(Math.sin(t * 0.12) * 0.6 + puntero.current.x * 0.8, (5.6 - puntero.current.y * 0.5) * lejos, (7.6 + Math.cos(t * 0.1) * 0.3) * lejos);
    camera.position.lerp(objetivo, 1 - Math.exp(-dt * 2));
    camera.lookAt(0.45, -0.3, 0.2);
  });

  const alTocar = (ev: ThreeEvent<PointerEvent>) => {
    if (!estado.current.demo) return;
    ev.stopPropagation();
    window.dispatchEvent(new CustomEvent("lago:arrojar", { detail: { x: ev.point.x, z: ev.point.z } }));
    posicionPedida.current = { x: ev.point.x, z: ev.point.z };
  };

  return (
    <>
      <ambientLight intensity={0.35} color="#8f7dff" />
      <directionalLight position={[-3, 6, 4]} intensity={1.6} />
      <pointLight position={[4.5, 1.5, 0]} intensity={6} distance={6} color="#ffb829" />

      {/* Fondo del lago */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} scale={[RX, RZ, 1]}>
        <circleGeometry args={[1, 64]} />
        <meshStandardMaterial color="#0a1a14" roughness={1} />
      </mesh>

      {/* Agua */}
      <mesh geometry={planoAgua} material={agua} onPointerDown={alTocar} />

      {/* Orilla y juncos */}
      <mesh geometry={orilla}>
        <meshStandardMaterial color="#0b2e26" roughness={0.9} />
      </mesh>
      <instancedMesh ref={juncos} args={[undefined, undefined, datosJuncos.length]}>
        <coneGeometry args={[0.025, 1, 5]} />
        <meshStandardMaterial color="#2e8f5e" emissive="#17b890" emissiveIntensity={0.25} />
      </instancedMesh>

      {/* Sólidos disueltos */}
      <points ref={suspendidos}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[posSusp, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.035} color="#c08a4a" transparent opacity={0.75} depthWrite={false} />
      </points>

      {/* Basura */}
      {objetos.current.map((o, i) => (
        <mesh
          key={i}
          ref={(m) => void (mallas.current[i] = m)}
          geometry={geometriasBasura[o.tipo]}
          material={materialesBasura[o.tipo]}
          visible={false}
        />
      ))}

      {/* Salpicaduras */}
      <points ref={salpicadura}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[salp.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.06} color="#d8f3ff" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>

      {/* Barrera flotante en V hacia la salida */}
      {boyas.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.04, z]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshStandardMaterial color="#ffb829" emissive="#ffb829" emissiveIntensity={0.9} />
        </mesh>
      ))}

      {/* Canasta sobre la balanza */}
      <group position={[RX + 0.55, 0.15, 0]}>
        <mesh>
          <boxGeometry args={[0.7, 0.62, 0.9]} />
          <meshBasicMaterial color="#9a9a9a" wireframe transparent opacity={0.45} />
        </mesh>
        <mesh ref={canasta} position={[0, 0.05, 0]} scale={[1, 0.02, 1]}>
          <boxGeometry args={[0.62, 0.6, 0.82]} />
          <meshStandardMaterial color="#f1ead2" emissive="#ffb829" emissiveIntensity={0.2} />
        </mesh>
        <mesh position={[0, -0.36, 0]}>
          <boxGeometry args={[0.9, 0.08, 1.1]} />
          <meshStandardMaterial color="#2a2a2a" />
        </mesh>
      </group>

      {/* Sensores: postes con punta luminosa */}
      {[
        { p: [-2.3, -1.2], c: "#8052ff" },
        { p: [-0.9, 1.55], c: "#3fb6e8" },
        { p: [0.9, -1.75], c: "#ffb829" },
      ].map((s, i) => (
        <group key={i} position={[s.p[0], 0, s.p[1]]}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.1, 8]} />
            <meshStandardMaterial color="#cfcfcf" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh ref={(m) => void (sensores.current[i] = m)} position={[0, 0.8, 0]}>
            <sphereGeometry args={[0.07, 16, 12]} />
            <meshBasicMaterial color={new THREE.Color(s.c).multiplyScalar(2.2)} toneMapped={false} />
          </mesh>
        </group>
      ))}

      <Postproceso sacudida={sacudida} />
    </>
  );
}

function Postproceso({ sacudida }: { sacudida: React.RefObject<number> }) {
  const aberracion = useRef<ChromaticAberrationEffect>(null);
  const desfase = useMemo(() => new THREE.Vector2(0.0003, 0.0003), []);
  useFrame(() => {
    const s = sacudida.current;
    desfase.set(0.0003 + s * 0.006, 0.0002 + s * 0.003);
    if (aberracion.current) aberracion.current.offset = desfase;
  });
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.9} luminanceSmoothing={0.25} />
      <ChromaticAberration ref={aberracion} blendFunction={BlendFunction.NORMAL} offset={desfase} radialModulation modulationOffset={0.2} />
      <Vignette eskil={false} offset={0.3} darkness={0.7} />
    </EffectComposer>
  );
}

function Pausa({ estado }: { estado: React.RefObject<EstadoLago> }) {
  const { setFrameloop } = useThree();
  useEffect(() => {
    let ultimo = true;
    const id = window.setInterval(() => {
      const a = estado.current.activo && !document.hidden;
      if (a !== ultimo) {
        setFrameloop(a ? "always" : "never");
        ultimo = a;
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [estado, setFrameloop]);
  return null;
}

function Lago3D({
  estado,
  alArrojar,
}: {
  estado: React.RefObject<EstadoLago>;
  alArrojar: React.RefObject<((x: number, z: number) => void) | null>;
}) {
  return (
    <Canvas
      className="lago-3d"
      dpr={[1, 1.75]}
      camera={{ position: [0, 5.6, 7.6], fov: 40, near: 0.1, far: 60 }}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
    >
      <Escena estado={estado} alArrojar={alArrojar} />
      <Pausa estado={estado} />
    </Canvas>
  );
}

export default memo(Lago3D);
