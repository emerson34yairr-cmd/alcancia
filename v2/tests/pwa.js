/* Comprobaciones de comportamiento en iPhone que no se ven con datos pequeños:
   cifras largas, el respaldo en un navegador sin descargas, y el scroll. */
const { chromium, devices } = require('playwright');
const steps = [], errs = [];
const ok = (n, c, x) => steps.push((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   << ' + JSON.stringify(x)));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });

  // Pesos colombianos: cifras de siete dígitos con separadores de millar
  for (const [ancho, alto, nombre] of [[390, 844, 'iPhone 13'], [320, 568, 'iPhone SE 1ª gen']]) {
    const ctx = await b.newContext({ viewport: { width: ancho, height: alto },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto('http://localhost:8898/v2/', { waitUntil: 'load' });
    await pg.waitForTimeout(800);

    const r = await pg.evaluate(() => {
      const hoy = dayKey();
      state.currency = 'COP';
      state.rates = { COP: 4000 };
      state.entries = [
        { id:'a', date:hoy, kind:'earn',  amount:574, cat:'trabajo', note:'', ts:3, grp:null, src:null },
        { id:'b', date:hoy, kind:'save',  amount:574, cat:null,      note:'', ts:2, grp:null, src:null },
        { id:'c', date:hoy, kind:'spend', amount:574, cat:'food',    note:'', ts:1, grp:null, src:null },
      ];
      go('actividad');
      const stats = document.querySelector('.stats');
      const scroller = document.querySelector('#scroll');
      const cajas = Array.from(document.querySelectorAll('.stat__v'));
      const limite = scroller.getBoundingClientRect().right;
      return {
        texto: cajas.map(c => c.textContent),
        desborda: stats.scrollWidth > stats.clientWidth + 1,
        fuera: cajas.filter(c => c.getBoundingClientRect().right > limite + 0.5).length,
        docAncho: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
      };
    });
    ok(`[${nombre}] las cifras en pesos colombianos caben en pantalla`,
       !r.desborda && r.fuera === 0, r);
    ok(`[${nombre}] la página no se desplaza en horizontal`, r.docAncho <= r.ventana, r);

    // El cambio de pestaña aterriza arriba, sin animación
    const salto = await pg.evaluate(async () => {
      go('recetas');                                  // pantalla larga de verdad
      await new Promise(r => setTimeout(r, 150));
      const sc = document.querySelector('#scroll');
      sc.scrollTop = sc.scrollHeight;
      await new Promise(r => setTimeout(r, 120));
      const antes = sc.scrollTop;
      go('actividad');
      await new Promise(r => setTimeout(r, 60));   // mucho antes de que acabe un scroll suave
      return { antes, despues: document.querySelector('#scroll').scrollTop };
    });
    ok(`[${nombre}] cambiar de pestaña aterriza arriba al instante`,
       salto.antes > 0 && salto.despues === 0, salto);

    await ctx.close();
  }

  // El respaldo en un navegador que no puede descargar: no debe mentir
  const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8898/v2/', { waitUntil: 'load' });
  await pg.waitForTimeout(800);

  // a) con hoja de compartir disponible se usa esa, y solo avisa si se completó
  let s = await pg.evaluate(async () => {
    let compartido = null;
    navigator.canShare = () => true;
    navigator.share = (d) => { compartido = d.files[0].name; return Promise.resolve(); };
    document.querySelector('#toasts').innerHTML = '';
    ACTIONS.exportar();
    await new Promise(r => setTimeout(r, 300));
    return { compartido, aviso: document.querySelector('#toasts').textContent, ancla: !!document.querySelector('a[download]') };
  });
  ok('en iPhone usa la hoja de compartir, no una descarga', /^mi-alcancia-\d{4}-\d{2}-\d{2}\.json$/.test(s.compartido || '') && !s.ancla, s);
  ok('avisa solo cuando compartir terminó', /guardado/i.test(s.aviso), s);

  // b) si cancelas la hoja, no dice nada y no cae a otro camino
  s = await pg.evaluate(async () => {
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
    document.querySelector('#toasts').innerHTML = '';
    ACTIONS.exportar();
    await new Promise(r => setTimeout(r, 300));
    return { aviso: document.querySelector('#toasts').textContent.trim(), hoja: !!document.querySelector('.sheet') };
  });
  ok('cancelar la hoja de compartir no dice nada ni abre nada', s.aviso === '' && !s.hoja, s);

  // c) sin compartir NI descargas, enseña el respaldo para copiarlo
  s = await pg.evaluate(async () => {
    delete navigator.canShare; delete navigator.share;
    const real = document.createElement.bind(document);
    document.createElement = function (t) {
      const el = real(t);
      if (t === 'a') Object.defineProperty(el, 'download', { value: undefined, configurable: true });
      return el;
    };
    document.querySelector('#toasts').innerHTML = '';
    ACTIONS.exportar();
    await new Promise(r => setTimeout(r, 400));
    document.createElement = real;
    const t = document.querySelector('#respaldoTxt');
    let valido = false;
    try { valido = JSON.parse(t.value).state.entries !== undefined; } catch (e) {}
    return { hoja: !!document.querySelector('.sheet'), valido,
             aviso: document.querySelector('#toasts').textContent.trim() };
  });
  ok('sin descargas enseña el respaldo copiable con JSON válido', s.hoja && s.valido, s);
  ok('y NO dice que se descargó', !/descargado/i.test(s.aviso), s);

  // La barra de estado de iOS no queda invisible en tema claro
  s = await pg.evaluate(() =>
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content);
  ok('la barra de estado no usa black-translucent', s === 'default', s);

  console.log(steps.join('\n'));
  console.log('\nERRORES JS:', errs.length ? errs.join('\n') : 'ninguno');
  console.log('RESUMEN:', steps.filter(x => x.startsWith('PASS')).length + '/' + steps.length);
  await b.close();
})();
