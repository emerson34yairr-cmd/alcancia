# Pruebas de Mi Alcancía v2

94 comprobaciones contra Chromium a tamaño de iPhone 13. No hay marco de
pruebas: cada archivo es un script de Playwright que abre la app, la usa como
la usarías tú y comprueba el resultado.

## Correrlas

```bash
# 1. Servir el repositorio (desde la raíz, no desde v2/)
python3 -m http.server 8898

# 2. Instalar Playwright
npm i playwright

# 3. Correr (CHROME apunta al navegador; vacío usa el que trae Playwright)
export CHROME=""
for f in e2e estado bugs migra movil inter; do node $f.js; done
```

Cada script imprime una línea por comprobación y un resumen al final.
Si cambias el puerto, ajústalo en la constante del principio de cada archivo.

## Qué hay en cada uno

| Archivo | Qué comprueba |
|---|---|
| `e2e.js` | El recorrido completo: registrar, editar y borrar movimientos, validación, metas, lista de compras convertida en gasto, presupuestos, privacidad, cambio de moneda, recarga, respaldo y restauración, datos corruptos, recetas, asistente sin clave y escáner |
| `migra.js` | La migración desde datos con la forma exacta de la versión anterior, y que `alcancia_v4` queda intacta |
| `bugs.js` | Una prueba por cada defecto que encontró la revisión adversarial, para que no vuelva |
| `inter.js` | Iconos de la cabecera, botón de atrás, doble toque, hojas que se reemplazan, buscadores, vistas que fallan |
| `estado.js` | Los caminos por los que se podía perder información: importar, traer datos de la v1, deshacer, respaldo de rescate, cuota llena |
| `movil.js` | Comportamiento en iPhone: zoom al enfocar campos, áreas táctiles, botones anidados, desplazamiento horizontal, áreas seguras, rutas relativas |

## Nota sobre la semilla

`e2e.js` arranca con la app vacía y va construyendo el estado con la interfaz,
que es lo que se quiere probar. `migra.js` y las capturas siembran datos con
`addInitScript`, **antes** de que cargue la página: si se siembran después, el
propio guardado de la app los sobrescribe al recargar, que es el comportamiento
correcto pero rompe el test.
