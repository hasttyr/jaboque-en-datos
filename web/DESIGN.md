# Diseño: Jaboque en datos

Cada tema es un afiche: una pantalla completa con su propio color, sacado del humedal. Se proyecta en clase, así que todo se lee desde lejos: cifras enormes y condensadas, poco texto por pantalla.

## Color

| Token | Valor | Uso |
|---|---|---|
| `--humedal` | `#0d3b2e` | Portada y barra: el verde del agua quieta con juncos |
| `--humedal-hondo` | `#092b21` | Fuentes |
| `--papel` | `#e9ecdf` | Río Bogotá: fondo claro para que los colores de turbidez se lean |
| `--senal` | `#ff5b14` | Basura (fondo) y todo lo crítico: alertas, límites, "sobre el límite" |
| `--buchon` | `#c9b8ff` | Impacto: el lila de la flor del buchón de agua |
| `--agua-limpia` → `--lodo` | `#2f8fd0` → `#6e4520` | Maqueta: el fondo es el color del agua según la turbidez en vivo |
| `--espuma` | `#f2f5e8` | Texto sobre fondos oscuros |
| `--junco` | `#2fbf71` | Conectado, normal, año actual en la línea de tiempo |

Cada pantalla redefine `--fondo`, `--tinta`, `--suave`, `--linea`, `--acento` y `--alerta` en `.estacion[data-pantalla="…"]`. Los componentes solo usan esos tokens.

## Tipografía

Una sola familia: **Archivo** variable, usando su eje de ancho.
- Cifras: ancho 62,5 %, peso 800, interlineado 0,82. Son el elemento gráfico principal de cada pantalla.
- Títulos: ancho 75 %, peso 700.
- Texto: ancho normal, 17 px, máximo 62 caracteres por línea.

## Movimiento

- Al cambiar de pantalla, el color nuevo barre la pantalla en la dirección del avance (View Transitions).
- La portada reproduce 1952 → 2014 una vez al entrar; después se controla con el botón y la línea de tiempo.
- Las barras crecen y los puntos de arrojo caen cada vez que su pantalla aparece: muestran los datos, no decoran.
- En la maqueta, la luz del agua se apaga a medida que se enturbia, y la franja de estado se vuelve naranja y se sacude al llegar a nivel crítico.
- Con "reducir movimiento" activado no hay animaciones ni 3D.

## Disposición

- Escritorio: pestañas arriba, paginador abajo a la derecha. Cada pantalla busca caber en 1440 × 900.
- Celular (≤ 860 px): barra de pestañas fija abajo con íconos. Fuentes se abre desde Impacto. Una columna por pantalla.
