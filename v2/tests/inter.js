const { chromium, devices } = require('playwright');
const steps = [], errs = [];
const ok = (n, c, x) => steps.push((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   << ' + JSON.stringify(x)));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await b.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(String(e).slice(0,220)));
  await pg.goto('http://localhost:8898/v2/', { waitUntil: 'load' });
  await pg.waitForTimeout(900);

  // 1 — los iconos de la cabecera se pintan
  let s = await pg.evaluate(() => ({
    ajustes: !!document.querySelector('[data-act="ajustes"] svg'),
    privacidad: !!document.querySelector('#privacyBtn svg'),
    racha: !!document.querySelector('#streak svg'),
    sinPintar: document.querySelectorAll('[data-icon]').length,
  }));
  ok('los tres iconos de la cabecera se pintan', s.ajustes && s.privacidad && s.racha && s.sinPintar === 0, s);

  // 2 — atrás desde una pantalla de "Más" vuelve a "Más", no sale de la app
  await pg.evaluate(() => go('mas'));
  await pg.waitForTimeout(350);
  await pg.evaluate(() => go('calendario'));
  await pg.waitForTimeout(400);
  await pg.goBack();
  await pg.waitForTimeout(500);
  s = await pg.evaluate(() => ({ tab: state.tab, url: location.pathname }));
  ok('atrás desde Calendario vuelve a Más', s.tab === 'mas' && /v2/.test(s.url), s);
  await pg.goBack();
  await pg.waitForTimeout(450);
  ok('otro atrás vuelve a Hoy', (await pg.evaluate(() => state.tab)) === 'hoy');

  // 3 — atrás con una hoja abierta cierra la hoja y deja la pestaña quieta
  await pg.evaluate(() => go('compras'));
  await pg.waitForTimeout(400);
  await pg.fill('#shopName', 'Arroz');
  await pg.click('[data-act="agregar-item"]');
  await pg.waitForTimeout(450);
  await pg.click('[data-act="editar-item"]');
  await pg.waitForTimeout(450);
  ok('la hoja del artículo abre', await pg.isVisible('.sheet'));
  await pg.goBack();
  await pg.waitForTimeout(550);
  s = await pg.evaluate(() => ({ hoja: !!document.querySelector('.sheet'), tab: state.tab }));
  ok('atrás cierra la hoja y sigue en Compras', !s.hoja && s.tab === 'compras', s);

  // 4 — guardar desde una hoja no te saca de la pantalla
  await pg.click('[data-act="editar-item"]');
  await pg.waitForTimeout(450);
  await pg.fill('#iPrice', '3');
  await pg.click('[data-act="guardar-item"]');
  await pg.waitForTimeout(650);
  s = await pg.evaluate(() => ({ tab: state.tab, precio: state.shop[0].price }));
  ok('guardar un artículo deja la pantalla donde estaba', s.tab === 'compras' && s.precio === 3, s);

  // 5 — doble toque no duplica el movimiento
  await pg.evaluate(() => { state.entries = []; go('hoy'); });
  await pg.waitForTimeout(400);
  await pg.click('[data-act="nuevo"][data-kind="spend"]');
  await pg.waitForTimeout(450);
  await pg.fill('#mAmount', '15');
  await pg.evaluate(() => {
    const b = document.querySelector('[data-act="guardar-mov"]');
    b.click(); b.click(); b.click();      // tres golpes seguidos
  });
  await pg.waitForTimeout(700);
  s = await pg.evaluate(() => state.entries.length);
  ok('tres toques seguidos crean UN movimiento', s === 1, s);

  // 6 — cambiar de tipo conserva lo escrito
  await pg.evaluate(() => { state.entries = []; go('hoy'); });
  await pg.waitForTimeout(350);
  await pg.click('[data-act="nuevo"][data-kind="spend"]');
  await pg.waitForTimeout(450);
  await pg.fill('#mAmount', '42.50');
  await pg.fill('#mNote', 'Taxi al centro');
  await pg.click('[data-act="cambiar-tipo"][data-kind="earn"]');
  await pg.waitForTimeout(500);
  s = await pg.evaluate(() => ({ a: document.querySelector('#mAmount').value, n: document.querySelector('#mNote').value }));
  ok('cambiar de tipo conserva cantidad y nota', s.a === '42.50' && s.n === 'Taxi al centro', s);

  // 7 — y el filtro de dígitos sigue puesto tras cambiar
  await pg.fill('#mAmount', '');
  await pg.type('#mAmount', '12a.b3x');
  await pg.waitForTimeout(250);
  s = await pg.evaluate(() => document.querySelector('#mAmount').value);
  ok('el filtro de dígitos sigue activo tras cambiar de tipo', s === '12.3', s);
  await pg.click('.sheet__head [data-act="cerrar-hoja"]');
  await pg.waitForTimeout(500);

  // 8 — el buscador respeta la posición del cursor
  await pg.evaluate(() => {
    const hoy = dayKey();
    state.entries = [{ id:'x', date:hoy, kind:'spend', amount:5, cat:'food', note:'almuerzo', ts:1, grp:null, src:null }];
    go('actividad');
  });
  await pg.waitForTimeout(450);
  await pg.fill('#fq', 'muerzo');
  await pg.waitForTimeout(400);
  s = await pg.evaluate(() => {
    const n = document.querySelector('#fq');
    n.focus(); n.setSelectionRange(0, 0);
    n.value = 'almuerzo';                    // como si hubieras escrito "al" delante
    n.setSelectionRange(2, 2);
    n.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise(r => setTimeout(() => r(document.querySelector('#fq').selectionStart), 500));
  });
  ok('el cursor se queda donde estaba al buscar', s === 2, s);

  // 9 — una vista que falla no deja la app sin navegación
  s = await pg.evaluate(() => {
    const bueno = VIEWS.metas;
    VIEWS.metas = function () { throw new Error('prueba'); };
    go('metas');
    const r = { tabs: document.querySelectorAll('.tabbar__btn').length,
                aviso: /no se pudo dibujar/i.test(document.querySelector('#view').textContent) };
    VIEWS.metas = bueno;
    return r;
  });
  ok('una vista rota deja la barra de pestañas usable', s.tabs === 5 && s.aviso, s);

  // 10 — Ajustes ya no promete de más
  await pg.evaluate(() => { VIEWS.metas && go('ajustes'); });
  await pg.waitForTimeout(450);
  s = await pg.evaluate(() => document.querySelector('#view').textContent);
  ok('Ajustes explica las dos llamadas a internet en vez de prometer que no hay ninguna',
     /open\.er-api/.test(s) && /Groq/.test(s) && !/Nada sale de tu tel/.test(s), s.slice(-120));

  console.log(steps.join('\n'));
  console.log('\nERRORES JS:', errs.length ? errs.join('\n') : 'ninguno');
  console.log('RESUMEN:', steps.filter(x=>x.startsWith('PASS')).length + '/' + steps.length);
  await b.close();
})();
