# Mi Alcancía v2

Reconstrucción completa de la app. Un solo archivo, sin dependencias y sin paso
de compilación: `index.html` se abre y funciona.

La versión anterior sigue en la raíz del repositorio, intacta y funcionando.
Esta vive aparte, en `v2/`, y de las claves originales de `localStorage` **solo
lee**. Puedes usar las dos a la vez y volver a la anterior cuando quieras.

---

## Cómo verla

### En GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Guarda y espera un minuto.

Queda en:

```
https://emerson34yairr-cmd.github.io/alcancia/v2/
```

La versión anterior sigue respondiendo en `…github.io/alcancia/`, así que
publicar esta no la tumba.

Si el trabajo todavía está en la rama `claude/dime-cloud-vfkv3r`, únela a `main`
primero: Pages publica desde la rama que hayas elegido, no desde todas.

### En el iPhone

Abre esa dirección en Safari → **Compartir → Agregar a pantalla de inicio**.
Desde ahí arranca a pantalla completa, sin barra del navegador, y funciona sin
conexión.

### Sin servidor

`index.html` también abre con doble clic desde el disco. Sin conexión no hay
tipos de cambio (todo se muestra en dólares) y no se registra el service
worker; el resto funciona igual.

### Dentro de la app de iOS (Capacitor)

`capacitor.config.json` apunta a `www/`. Para envolver esta versión:

```bash
cp v2/index.html v2/app.webmanifest v2/sw.js v2/icon*.svg v2/icon*.png www/
npm run cap:sync:ios
```

---

## Qué hay dentro

```
v2/
  index.html          la app entera: estilos, lógica, iconos y 30 recetas
  app.webmanifest     para instalarla en la pantalla de inicio
  sw.js               service worker, solo para abrirla sin conexión
  icon.svg            icono
  icon-maskable.svg   icono recortable de Android
  icon.png            512 px
  icon-180.png        icono de pantalla de inicio de iOS
```

Dentro de `index.html` el orden está marcado con comentarios y conviene
respetarlo al editar:

| Sección | Qué es |
|---|---|
| 1. Tokens | variables de diseño; se cambia aquí, no más abajo |
| 2. Base | reset y elementos nativos |
| 3. Layout | cabecera, scroller y barra de pestañas |
| 4. Componentes | card, botón, chip, campo, hoja, toast… |
| 5. Vistas | estilos propios de cada pantalla |
| 6. Utilidades | ayudantes de una sola propiedad |

Y en el JavaScript: iconos → utilidades → estado → chrome → cálculo → logros →
navegación → una función por vista → acciones → arranque.

**No existe ninguna capa de override al final.** Si algo se ve mal, se arregla
la regla original. Ese fue el defecto que arrastraba la versión anterior:
cada arreglo se pegaba al final del `<style>` y el CSS viejo seguía peleando
contra el nuevo.

---

## Reglas de la casa

- Ni un `onclick=` en el HTML. Todo pasa por `data-act` y un único despachador.
- Solo `save()` escribe en `localStorage`. Si falla, el usuario se entera.
- Toda cadena que venga del usuario pasa por `esc()` antes de tocar el HTML.
- Los importes se guardan **en dólares**; la moneda activa es solo presentación.
- Las fechas son locales (`dayKey()`), nunca `toISOString()`.

---

## Tus datos

Viven en tu teléfono y no salen de ahí.

| Dónde | Qué |
|---|---|
| `localStorage['alcancia.v2']` | movimientos, metas, presupuestos, lista, ajustes |
| `localStorage['alcancia.v2.bak']` | copia del último estado bueno |
| `localStorage['groq_api_key']` | tu clave, si pusiste una (fuera de los respaldos) |
| IndexedDB `alcanciaFotos` | fotos del calendario (la misma base de la v1) |

La primera vez que abras v2 se traen solos los datos de la versión anterior.
Puedes volver a traerlos cuando quieras desde **Más → Tus datos**.

En esa misma pantalla puedes bajar un respaldo `.json` con todo tu historial.
Hazlo antes de cambiar de teléfono: las fotos del calendario no caben en el
archivo y son lo único que no viaja.

Las únicas dos llamadas a internet que hace la app:

- `open.er-api.com` — tipos de cambio, una vez al día. **No se manda ningún dato
  tuyo.** Sin tipo de cambio la app muestra y captura en dólares, y lo avisa.
- `api.groq.com` — **solo si guardaste una clave**. Al escanear un recibo se
  envía esa foto; al preguntarle al asistente se envían tus **totales**
  (ganado, ahorrado, gastado, metas y presupuestos). Tus notas no se envían.
  Sin clave, el asistente responde igual con las reglas que lleva dentro.

---

## Probarla

Con Node y Playwright instalados:

```bash
python3 -m http.server 8000     # o cualquier servidor estático
```

Las pruebas de esta reconstrucción son 94, escritas contra Chromium a tamaño de
iPhone 13, repartidas en seis suites:

| Suite | Qué cubre |
|---|---|
| 35 de extremo a extremo | altas, ediciones y bajas de movimientos, validación, metas, lista de compras a gasto, presupuestos, privacidad, moneda, recarga, respaldo y restauración, recetas, asistente y escáner |
| 16 de migración | conversión desde datos con la forma exacta de la v1, y que la v1 queda byte a byte igual |
| 13 de defectos | una por cada bug que encontró la revisión, para que no vuelvan |
| 12 de interacción | iconos, botón de atrás, doble toque, hojas, buscadores, vistas que fallan |
| 10 de datos | los caminos por los que se podía perder información |
| 8 de móvil | zoom de iOS, áreas táctiles, botones anidados, áreas seguras, rutas relativas |
