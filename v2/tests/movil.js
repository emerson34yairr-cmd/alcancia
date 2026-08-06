const { chromium, devices } = require('playwright');
const steps = [];
const ok = (n, c, x) => steps.push((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   << ' + JSON.stringify(x)));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await b.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8898/v2/', { waitUntil: 'load' });
  await pg.waitForTimeout(800);

  // iOS hace zoom en cualquier campo con letra menor de 16px
  const chicos = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('input,select,textarea').forEach(el => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.push((el.id || el.className) + ':' + fs);
    });
    return out;
  });
  ok('ningún campo con letra <16px (iOS haría zoom)', chicos.length === 0, chicos);

  // Áreas táctiles
  const pequenos = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('button,[role=button],a').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height < 30 || r.width < 30) out.push((el.dataset.act || el.className).slice(0,32) + ':' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    return out;
  });
  ok('áreas táctiles >= 30px', pequenos.length === 0, pequenos);

  // Botones anidados dentro de botones = HTML inválido, rompe el toque en iOS
  const anidados = await pg.evaluate(() => {
    let n = 0;
    ['hoy','actividad','analisis','metas','mas','compras','ajustes','datos','logros'].forEach(t => {
      go(t);
      document.querySelectorAll('button button, button a, a button').forEach(() => n++);
    });
    return n;
  });
  ok('sin botones anidados en ninguna vista', anidados === 0, anidados);

  // El cuerpo nunca se desplaza en horizontal
  await pg.evaluate(() => go('actividad'));
  await pg.waitForTimeout(400);
  const overflow = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok('la página no se desplaza en horizontal', !overflow);

  // El botón de retroceso cierra la hoja con UNA pulsación, aun cambiando de tipo
  await pg.evaluate(() => go('hoy'));
  await pg.waitForTimeout(350);
  const hist0 = await pg.evaluate(() => history.length);
  await pg.click('[data-act="nuevo"][data-kind="earn"]');
  await pg.waitForTimeout(400);
  await pg.click('[data-act="cambiar-tipo"][data-kind="spend"]');
  await pg.waitForTimeout(400);
  await pg.click('[data-act="cambiar-tipo"][data-kind="save"]');
  await pg.waitForTimeout(400);
  const hist1 = await pg.evaluate(() => history.length);
  ok('cambiar de tipo NO apila entradas de historial', hist1 - hist0 === 1, { hist0, hist1 });
  await pg.goBack();
  await pg.waitForTimeout(500);
  ok('una sola pulsación de atrás cierra la hoja', !(await pg.isVisible('.sheet')));

  // Áreas seguras del iPhone declaradas
  const safe = await pg.evaluate(() => {
    const css = document.querySelector('style').textContent;
    return { top: css.includes('safe-area-inset-top'), bottom: css.includes('safe-area-inset-bottom'),
             dvh: css.includes('100dvh') };
  });
  ok('áreas seguras y 100dvh declaradas', safe.top && safe.bottom && safe.dvh, safe);

  // Rutas relativas: nada absoluto que rompa al servir desde /alcancia/v2/
  const abs = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('link[href],script[src],img[src]').forEach(el => {
      const v = el.getAttribute('href') || el.getAttribute('src');
      if (v && v.startsWith('/')) out.push(v);
    });
    return out;
  });
  ok('sin rutas absolutas (funciona en subcarpeta)', abs.length === 0, abs);

  console.log(steps.join('\n'));
  console.log('RESUMEN:', steps.filter(x=>x.startsWith('PASS')).length + '/' + steps.length);
  await b.close();
})();
