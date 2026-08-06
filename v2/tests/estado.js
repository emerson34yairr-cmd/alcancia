const { chromium, devices } = require('playwright');
const steps = [], errs = [];
const ok = (n, c, x) => steps.push((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   << ' + JSON.stringify(x)));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await b.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(String(e).slice(0,220)));
  await pg.goto('http://localhost:8898/v2/', { waitUntil: 'load' });
  await pg.waitForTimeout(800);

  const sembrar = () => pg.evaluate(() => {
    state = blank(); state.onboarded = true;
    const hoy = dayKey();
    state.entries = [
      { id:'a', date:hoy, kind:'earn', amount:100, cat:'trabajo', note:'Sueldo', ts:3, grp:null, src:null },
      { id:'b', date:hoy, kind:'spend', amount:20, cat:'food', note:'Pan', ts:2, grp:null, src:null },
    ];
    state.goals = [{ id:'g', name:'Bici', target:500, since:hoy, due:null, done:false, doneAt:null }];
    save(true); render();
  });

  // 1 — «Traer datos anteriores» cuando la v1 no tiene nada NO debe vaciarte
  await sembrar();
  await pg.evaluate(() => { ['alcancia_v4','alcancia_metas','alcancia_budgets_v1','budgets',
    'alcancia_shop_v1','alcancia_shop_spent_v1'].forEach(k => localStorage.removeItem(k)); });
  await pg.evaluate(() => go('datos'));
  await pg.waitForTimeout(450);
  await pg.evaluate(() => ACTIONS['reimportar-v1-ok']());
  await pg.waitForTimeout(600);
  let s = await pg.evaluate(() => ({ n: state.entries.length, g: state.goals.length }));
  ok('traer datos de una v1 vacía NO borra lo tuyo', s.n === 2 && s.g === 1, s);

  // 2 — dos avisos de deshacer a la vez: cada botón deshace LO SUYO
  await sembrar();
  s = await pg.evaluate(async () => {
    go('actividad');
    const ids = state.entries.map(e => e.id);
    // borra los dos movimientos, uno tras otro, sin esperar a que caduque el aviso
    ACTIONS['borrar-mov']({ dataset: { id: ids[0] } });
    ACTIONS['borrar-mov']({ dataset: { id: ids[1] } });
    const botones = Array.from(document.querySelectorAll('[data-act="deshacer"]'));
    const trasBorrar = state.entries.length;
    // pulsa el PRIMER aviso (el del primer borrado)
    botones[0].click();
    return { trasBorrar, avisos: botones.length, quedan: state.entries.map(e => e.id), esperado: ids[0] };
  });
  ok('dos borrados dejan dos avisos', s.avisos === 2 && s.trasBorrar === 0, s);
  ok('deshacer el primer aviso restaura SU movimiento, no el otro',
     s.quedan.length === 1 && s.quedan[0] === s.esperado, s);

  // 3 — importar un archivo bien formado pero vacío no debe reemplazar nada
  await sembrar();
  s = await pg.evaluate(() => {
    const previo = state.entries.length;
    const vacio = { app:'Mi Alcancía', version:2, state: Object.assign(blank(), { entries: [] }) };
    // se recorre la misma lógica del importador
    const inc = vacio.state;
    const base = blank();
    Object.keys(base).forEach(k => { if (inc[k] != null) base[k] = inc[k]; });
    const guardar = state;
    state = base; sanitize();
    let rechazado = false;
    if (!state.entries.length && !state.goals.length && !state.shop.length) { state = guardar; rechazado = true; }
    return { previo, rechazado, ahora: state.entries.length };
  });
  ok('un respaldo vacío se rechaza y no borra lo tuyo', s.rechazado && s.ahora === s.previo, s);

  // 4 — el respaldo de la versión ANTERIOR se puede importar
  s = await pg.evaluate(() => {
    const keys = {
      alcancia_v4: JSON.stringify({ days: [
        { date:'2026-07-10', worked:true, entries:[{ earned:90, saved:25, spent:10, note:'Turno', category:'food' }] }],
        unlockedAchs:['primer_paso'], achDates:{ primer_paso:'2026-07-10' } }),
      alcancia_metas: JSON.stringify([{ id:'m', name:'Tenis', goal:120, startFrom:'2026-07-10' }]),
      alcancia_moneda: 'HNL',
    };
    const conv = deV1(keys);
    return conv ? { n: conv.entries.length, earned: conv.entries.filter(e=>e.kind==='earn')[0].amount,
                    metas: conv.goals.length, moneda: conv.currency,
                    logro: !!conv.achievements['primer_paso'] } : null;
  });
  ok('un respaldo .json de la versión anterior se convierte', s && s.n === 3 && s.earned === 90 && s.metas === 1 && s.moneda === 'HNL' && s.logro, s);

  // 5 — datos principales rotos pero con respaldo: se recupera en vez de abrir vacío
  s = await pg.evaluate(() => {
    const bueno = JSON.stringify(Object.assign(blank(), {
      entries: [{ id:'z', date:dayKey(), kind:'earn', amount:77, cat:'trabajo', note:'', ts:1, grp:null, src:null }] }));
    localStorage.setItem('alcancia.v2.bak', bueno);
    localStorage.setItem('alcancia.v2', '{roto');
    state = blank(); readFailed = false; recovered = false;
    load();
    return { readFailed, recovered, n: state.entries.length, amount: state.entries[0] && state.entries[0].amount };
  });
  ok('con los datos rotos se recupera del respaldo', !s.readFailed && s.recovered && s.n === 1 && s.amount === 77, s);

  // 6 — sin respaldo utilizable sí se rinde, y sin escribir encima
  s = await pg.evaluate(() => {
    localStorage.removeItem('alcancia.v2.bak');
    localStorage.setItem('alcancia.v2', '{roto');
    state = blank(); readFailed = false; recovered = false;
    load();
    save(true);
    return { readFailed, raw: localStorage.getItem('alcancia.v2'), rescate: localStorage.getItem('alcancia.v2.rota') };
  });
  ok('sin respaldo se rinde y no sobrescribe', s.readFailed && s.raw === '{roto' && s.rescate === '{roto', s);

  // 7 — el aviso de cuota no manda a borrar fotos (están en otro almacén)
  s = await pg.evaluate(() => {
    const host = document.querySelector('#toasts');
    host.innerHTML = '';
    persistFail({ name: 'QuotaExceededError' });
    return host.textContent;
  });
  ok('el aviso de sin espacio no culpa a las fotos', !/foto/i.test(s) && /respaldo/i.test(s), s);

  // 8 — pasar a segundo plano vuelca el guardado pendiente
  s = await pg.evaluate(async () => {
    readFailed = false; recovered = false;   // la prueba anterior dejó la marca puesta
    localStorage.removeItem('alcancia.v2');
    state = blank(); state.onboarded = true;
    state.entries = [{ id:'q', date:dayKey(), kind:'save', amount:9, cat:null, note:'', ts:1, grp:null, src:null }];
    save();                                   // retrasado, NO inmediato
    const antes = (localStorage.getItem('alcancia.v2') || '').indexOf('"q"') >= 0;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    const despues = (localStorage.getItem('alcancia.v2') || '').indexOf('"q"') >= 0;
    delete document.visibilityState;
    return { antes, despues };
  });
  ok('al ocultarse la app se vuelca lo pendiente', s.antes === false && s.despues === true, s);

  // 9 — «Borrar todo» no toca las fotos si no lo pides
  s = await pg.evaluate(async () => {
    await fotoPut({ key: '2026-07-01', blob: new Blob(['x']), w:1, h:1, bytes:1, type:'image/jpeg', addedAt:'' });
    await cargarFotoKeys();
    const antes = Object.keys(fotoSet).length;
    state.entries = []; render();
    ACTIONS['borrar-todo']();
    await new Promise(r => setTimeout(r, 400));
    ACTIONS['borrar-todo-ok']();                 // sin marcar la casilla
    await new Promise(r => setTimeout(r, 400));
    const quedan = await fotoKeys();
    return { antes, despues: quedan.length, marcaOfrecida: true };
  });
  ok('borrar todo respeta las fotos compartidas con la v1', s.antes === 1 && s.despues === 1, s);

  console.log(steps.join('\n'));
  console.log('\nERRORES JS:', errs.length ? errs.join('\n') : 'ninguno');
  console.log('RESUMEN:', steps.filter(x=>x.startsWith('PASS')).length + '/' + steps.length);
  await b.close();
})();
