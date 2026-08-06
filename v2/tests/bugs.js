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

  // BUG 1 — cambiar el tipo mientras editas duplicaba el movimiento
  await pg.click('[data-act="nuevo"][data-kind="spend"]');
  await pg.waitForTimeout(400);
  await pg.fill('#mAmount', '25');
  await pg.click('[data-act="guardar-mov"]');
  await pg.waitForTimeout(550);
  await pg.click('.row[data-act="ver-mov"]');
  await pg.waitForTimeout(450);
  await pg.click('[data-act="cambiar-tipo"][data-kind="earn"]');
  await pg.waitForTimeout(450);
  await pg.click('[data-act="guardar-mov"]');
  await pg.waitForTimeout(600);
  let s = await pg.evaluate(() => ({ n: state.entries.length, kind: state.entries[0].kind }));
  ok('cambiar de tipo al editar CONVIERTE, no duplica', s.n === 1 && s.kind === 'earn', s);

  // BUG 2 — la cantidad de la lista es texto libre y multiplicaba el precio
  s = await pg.evaluate(() => ({
    limpio: cantidadDe('3'), decimal: cantidadDe('2.5'), coma: cantidadDe('2,5'),
    gramos: cantidadDe('500 g'), palabra: cantidadDe('docena'), vacio: cantidadDe(''),
    cero: cantidadDe('0'), negativo: cantidadDe('-4'),
  }));
  ok('"500 g" NO multiplica por 500', s.gramos === 1, s);
  ok('un número limpio sí multiplica', s.limpio === 3 && s.decimal === 2.5 && s.coma === 2.5, s);
  ok('texto, vacío, cero y negativo valen 1', s.palabra === 1 && s.vacio === 1 && s.cero === 1 && s.negativo === 1, s);

  // BUG 3 — moneda sin tipo de cambio guardaba lo tecleado como dólares
  s = await pg.evaluate(() => {
    state.currency = 'HNL'; state.rates = null;
    const r = { hayTasa: hayTasa(), sym: simbolo(), base: toBase(500), vista: toView(10), txt: money(10) };
    state.rates = { HNL: 25 };
    r.conTasa = { hayTasa: hayTasa(), sym: simbolo(), base: toBase(500), txt: money(10) };
    state.currency = 'USD'; state.rates = null;
    return r;
  });
  ok('sin tasa se captura y se muestra en dólares', !s.hayTasa && s.sym === '$' && s.base === 500 && s.vista === 10, s);
  ok('con tasa sí convierte (500 L = 20 USD)', s.conTasa.hayTasa && s.conTasa.sym === 'L' && Math.abs(s.conTasa.base - 20) < 0.001, s.conTasa);

  // BUG 4 — el reparto ahorro/gasto se salía de 0–100 con retiros
  s = await pg.evaluate(() => {
    const hoy = dayKey();
    state.entries = [
      { id:'a', date:hoy, kind:'save', amount:10, cat:null, note:'', ts:1, grp:null, src:null },
      { id:'b', date:hoy, kind:'save', amount:60, cat:null, note:'', ts:2, grp:null, src:'retiro' },
      { id:'c', date:hoy, kind:'spend', amount:30, cat:'food', note:'', ts:3, grp:null, src:null },
    ];
    render();
    const leg = document.querySelector('.hero__ratioLegend');
    return { saved: totals().saved, texto: leg ? leg.textContent : '' };
  });
  const nums = (s.texto.match(/-?\d+/g) || []).map(Number);
  ok('ahorro negativo no produce porcentajes fuera de 0–100',
     s.saved < 0 && nums.every(n => n >= 0 && n <= 100), s);

  // BUG 5 — la curva se salía del recuadro con valores negativos
  s = await pg.evaluate(() => {
    const svg = (function(){ const c=lineChart([0,-40,-80,-20,10],'save');
      const d=document.createElement('div'); d.innerHTML=c; return d.querySelector('path[stroke]'); })();
    const ys = (svg.getAttribute('d').match(/-?\d+\.\d+/g) || []).map(Number).filter((_,i)=>i%2===1);
    return { min: Math.min(...ys), max: Math.max(...ys) };
  });
  ok('la curva se queda dentro del recuadro (0–120)', s.min >= 0 && s.max <= 120, s);

  // BUG 6 — el mapa de constancia salía transpuesto
  s = await pg.evaluate(() => {
    const box = document.createElement('div');
    box.innerHTML = heatmapCard();
    document.body.appendChild(box);
    const heat = box.querySelector('.heat');
    // Con grid-auto-flow: column, las 7 primeras celdas deben ser la primera COLUMNA
    const cs = getComputedStyle(heat);
    const cells = box.querySelectorAll('.heat > .heat__c');   // la leyenda usa la misma clase
    const r = { flow: cs.gridAutoFlow, filas: cs.gridTemplateRows.split(' ').length,
                cols: cs.gridTemplateColumns.split(' ').length, n: cells.length };
    box.remove();
    return r;
  });
  ok('el mapa es 12 columnas × 7 filas, 84 celdas', s.cols === 12 && s.filas === 7 && s.n === 84, s);

  // BUG 7 — semana contra semana comparaba días desiguales
  s = await pg.evaluate(() => {
    const hoy = dayKey();
    const lun = startOfWeek(hoy);
    const d = weekday(hoy);
    const lunPrev = addDays(lun, -7);
    // 10 por día TODA la semana pasada; 10 por día en lo que va de esta
    const E = [];
    for (let i = 0; i < 7; i++) E.push({ id:'p'+i, date:addDays(lunPrev,i), kind:'spend', amount:10, cat:'food', note:'', ts:i, grp:null, src:null });
    for (let i = 0; i <= d; i++) E.push({ id:'c'+i, date:addDays(lun,i), kind:'spend', amount:10, cat:'food', note:'', ts:100+i, grp:null, src:null });
    state.entries = E; go('analisis');
    const filas = Array.from(document.querySelectorAll('.cmp')).map(r => r.textContent);
    return { d, gastos: filas.find(t => t.indexOf('Gastos') === 0) || '' };
  });
  ok('mismo ritmo semana a semana se lee «Igual», no una caída falsa',
     /Igual/.test(s.gastos), s);

  // BUG 8 — el día del vencimiento decía que ya había pasado
  s = await pg.evaluate(() => {
    state.entries = []; state.goals = [{ id:'g', name:'X', target:100, since:dayKey(), due:dayKey(), done:false, doneAt:null }];
    render(); go('metas');
    return document.querySelector('.goal').textContent;
  });
  ok('el día límite dice «Hoy es la fecha límite»', /Hoy es la fecha límite/.test(s), s.slice(0,140));

  // BUG 9 — «Nuevo» salía en verde también en la fila de Gastos
  s = await pg.evaluate(() => ({
    gasto: deltaLabel(50, 0, true), ahorro: deltaLabel(50, 0, false),
  }));
  ok('«Nuevo» no se pinta de verde en Gastos', /faint/.test(s.gasto) && /pos/.test(s.ahorro), s);

  // BUG 10 — un día de solo ingresos se pintaba ámbar de «parejo»
  s = await pg.evaluate(() => {
    const hoy = dayKey();
    state.entries = [{ id:'x', date:hoy, kind:'earn', amount:80, cat:'trabajo', note:'', ts:1, grp:null, src:null }];
    state.goals = []; calMes = monthKey(hoy); render(); go('calendario');
    const c = document.querySelector('.cal__c.is-today');
    return c ? c.className : '';
  });
  ok('un día de solo ingresos se pinta verde', /is-good/.test(s), s);

  console.log(steps.join('\n'));
  console.log('\nERRORES JS:', errs.length ? errs.join('\n') : 'ninguno');
  console.log('RESUMEN:', steps.filter(x=>x.startsWith('PASS')).length + '/' + steps.length);
  await b.close();
})();
