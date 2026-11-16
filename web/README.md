# Web: Jaboque en datos

Una sola página (SPA) con seis pantallas independientes. Cada pantalla tiene su enlace (`#jaboque`, `#rio`, `#basura`, `#maqueta`, `#impacto`, `#fuentes`), se cambia con las pestañas, con las flechas del paginador o con las teclas ← y →.

```bash
npm install
npm run dev     # http://localhost:3000
npm run datos   # actualiza las copias de respaldo de los datos abiertos
```

## Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `src/app/page.tsx` | Consulta los datos abiertos y arma las seis pantallas |
| `src/components/Estacion.tsx` | Pestañas, navegación por hash y teclado, transición entre pantallas y aviso de nivel crítico |
| `src/components/ConexionMaqueta.tsx` | Conexión con el servidor de la maqueta (o modo demostración), compartida por todas las pantallas |
| `src/components/MaquetaEnVivo.tsx` | Pantalla de la maqueta: lecturas, estado de alerta y botones de demostración |
| `src/components/MapaJaboque.tsx` + `3d/` | Portada: el humedal de 1952 a 2014, en 3D si hay WebGL |
| `src/lib/maqueta.ts` | Límites, regla de alerta y simulador (copia de los de `iot-server/`) |
| `src/lib/fuentes.ts`, `src/lib/datos.ts` | Conectores a los portales de datos abiertos, con copias de respaldo en `src/data/` |

El sistema visual está en `DESIGN.md`.
