import { cacheLife } from "next/cache";
import { cargarArrojo, cargarResiduos, cargarRio, type Estacion, type PuntoArrojo, type Residuos } from "./fuentes";
import rioRespaldo from "@/data/rio.json";
import arrojoRespaldo from "@/data/arrojo.json";
import residuosRespaldo from "@/data/residuos.json";
import jaboque from "@/data/jaboque.json";

export type Resultado<T> = { datos: T; enVivo: boolean; consultado: string };

// Intenta la API en vivo; si falla (portal caído, sin red) usa la copia guardada.
async function conRespaldo<T>(cargar: () => Promise<T>, respaldo: T): Promise<Resultado<T>> {
  const consultado = new Date().toISOString();
  try {
    return { datos: await cargar(), enVivo: true, consultado };
  } catch (e) {
    console.warn("Usando copia de respaldo:", (e as Error).message);
    return { datos: respaldo, enVivo: false, consultado };
  }
}

export async function datosRio(): Promise<Resultado<Estacion[]>> {
  "use cache";
  cacheLife("days");
  return conRespaldo(cargarRio, rioRespaldo as Estacion[]);
}

export async function datosArrojo(): Promise<Resultado<PuntoArrojo[]>> {
  "use cache";
  cacheLife("days");
  return conRespaldo(cargarArrojo, arrojoRespaldo as PuntoArrojo[]);
}

export async function datosResiduos(): Promise<Resultado<Residuos>> {
  "use cache";
  cacheLife("days");
  return conRespaldo(cargarResiduos, residuosRespaldo as Residuos);
}

export type CapaJaboque = { cobertura: string; ha: number; d: string };
export type DatosJaboque = { ancho: number; alto: number; periodos: string[]; capas: Record<string, CapaJaboque[]> };

export const datosJaboque = jaboque as DatosJaboque;
