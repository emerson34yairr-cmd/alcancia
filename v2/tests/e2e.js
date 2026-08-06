const { chromium, devices } = require('playwright');
const OUT = './capturas';
require('fs').mkdirSync(OUT, { recursive: true });
const errs = [], steps = [];
const ok = (n, c) => steps.push((c ? 'PASS  ' : 'FAIL  ') + n);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await b.newContext({ ...devices['iPhone 13'], isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 260)));
  pg.on('console', m => { if (m.type() === 'error' && !/404|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0,200)); });
  await pg.goto('http://localhost:8898/v2/', { waitUntil: 'load' });
  await pg.waitForTimeout(700);

  // 1. Registrar un ingreso
  await pg.click('[data-act="nuevo"][data-kind="earn"]');
  await pg.waitForTimeout(450);
  ok('hoja de ingreso abre', await pg.isVisible('#mAmount'));
  await pg.fill('#mAmount', '120.50');
  await pg.click('[data-act="guardar-mov"]');
  await pg.waitForTimeout(600);
  let s = await pg.evaluate(() => ({ n: state.entries.length, bal: totals().balance }));
  ok('ingreso guardado (1 mov, saldo 120.5)', s.n === 1 && Math.abs(s.bal - 120.5) < 0.001);

  // 2. Registrar un gasto con categoría
  await pg.click('[data-act="nuevo"][data-kind="spend"]');
  await pg.waitForTimeout(450);
  await pg.fill('#mAmount', '30');
  await pg.click('[data-act="elegir-cat"][data-cat="transport"]');
  await pg.fill('#mNote', 'Bus al trabajo');
  await pg.click('[data-act="guardar-mov"]');
  await pg.waitForTimeout(600);
  s = await pg.evaluate(() => ({ n: state.entries.length, bal: totals().balance, cat: state.entries.find(e=>e.kind==='spend').cat }));
  ok('gasto guardado con categoría transport', s.n === 2 && Math.abs(s.bal - 90.5) < 0.001 && s.cat === 'transport');

  // 3. Ahorro -> el cerdito debe reaccionar y subir el nivel
  await pg.click('[data-act="nuevo"][data-kind="save"]');
  await pg.waitForTimeout(450);
  await pg.fill('#mAmount', '60');
  await pg.click('[data-act="guardar-mov"]');
  await pg.waitForTimeout(700);
  s = await pg.evaluate(() => ({ saved: totals().saved, lvl: level().now.name, logros: Object.keys(state.achievements) }));
  ok('ahorro suma y sube a Ahorrador', Math.abs(s.saved - 60) < 0.001 && s.lvl === 'Ahorrador');
  ok('logros primer_paso + primer_ahorro', s.logros.includes('primer_paso') && s.logros.includes('primer_ahorro'));
  await pg.screenshot({ path: `${OUT}/1-hoy.png` });

  // 4. Editar un movimiento tocando su fila
  await pg.click('.row[data-act="ver-mov"]');
  await pg.waitForTimeout(450);
  const v = await pg.inputValue('#mAmount');
  ok('editar precarga el importe', parseFloat(v) > 0);
  await pg.fill('#mAmount', '75');
  await pg.click('[data-act="guardar-mov"]');
  await pg.waitForTimeout(600);
  s = await pg.evaluate(() => state.entries.length);
  ok('editar no duplica (sigue en 3)', s === 3);

  // 5. Validación: importe vacío no debe guardar
  await pg.click('[data-act="nuevo"][data-kind="spend"]');
  await pg.waitForTimeout(450);
  await pg.click('[data-act="guardar-mov"]');
  await pg.waitForTimeout(400);
  s = await pg.evaluate(() => ({ n: state.entries.length, open: !!document.querySelector('.sheet') }));
  ok('importe vacío se rechaza y la hoja sigue abierta', s.n === 3 && s.open);
  await pg.click('.sheet__head [data-act="cerrar-hoja"]');
  await pg.waitForTimeout(400);

  // 6. Meta
  await pg.evaluate(() => go('metas'));
  await pg.waitForTimeout(400);
  await pg.click('[data-act="nueva-meta"]');
  await pg.waitForTimeout(450);
  await pg.fill('#gName', 'Audífonos');
  await pg.fill('#gTarget', '50');
  await pg.click('[data-act="guardar-meta"]');
  await pg.waitForTimeout(600);
  s = await pg.evaluate(() => ({ n: state.goals.length, done: state.goals[0].done, pct: goalPct(state.goals[0]) }));
  ok('meta creada y auto-cumplida (60 ahorrado > 50)', s.n === 1 && s.done === true && s.pct === 100);
  await pg.screenshot({ path: `${OUT}/2-metas.png` });

  // 7. Compras
  await pg.evaluate(() => go('compras'));
  await pg.waitForTimeout(400);
  await pg.fill('#shopName', 'Leche');
  await pg.fill('#shopQty', '2');
  await pg.click('[data-act="agregar-item"]');
  await pg.waitForTimeout(500);
  ok('artículo agregado', await pg.evaluate(() => state.shop.length === 1));
  await pg.fill('#shopName', 'Leche');
  await pg.click('[data-act="agregar-item"]');
  await pg.waitForTimeout(500);
  ok('duplicado rechazado (sigue en 1)', await pg.evaluate(() => state.shop.length === 1));
  await pg.click('[data-act="editar-item"]');
  await pg.waitForTimeout(450);
  await pg.fill('#iPrice', '2.5');
  await pg.click('[data-act="guardar-item"]');
  await pg.waitForTimeout(550);
  await pg.click('[data-act="marcar-item"]');
  await pg.waitForTimeout(500);
  await pg.click('[data-act="compras-a-gasto"]');
  await pg.waitForTimeout(650);
  s = await pg.evaluate(() => ({ n: state.entries.length, last: state.entries.find(e=>e.src==='compra'), logged: state.shop[0].logged }));
  ok('compra pasa a gasto (2 × 2.50 = 5)', s.n === 4 && s.last && Math.abs(s.last.amount - 5) < 0.001 && s.logged);
  const btnGone = await pg.isVisible('[data-act="compras-a-gasto"]').catch(() => false);
  ok('el botón desaparece: no se puede contar dos veces', !btnGone);
  await pg.screenshot({ path: `${OUT}/3-compras.png` });

  // 8. Presupuesto rebasado
  await pg.evaluate(() => go('presupuesto'));
  await pg.waitForTimeout(400);
  await pg.click('[data-act="nuevo-presupuesto"]');
  await pg.waitForTimeout(450);
  await pg.click('[data-act="elegir-cat"][data-cat="transport"]');
  await pg.fill('#bAmount', '10');
  await pg.click('[data-act="guardar-presupuesto"]');
  await pg.waitForTimeout(600);
  s = await pg.evaluate(() => ({ used: budgetSpent(state.budgets[0]), amount: state.budgets[0].amount }));
  ok('el gasto manual SÍ consume presupuesto (bug de la v1)', s.used === 30 && s.amount === 10);
  await pg.screenshot({ path: `${OUT}/4-presupuesto.png` });

  // 9. Privacidad
  await pg.evaluate(() => go('hoy'));
  await pg.waitForTimeout(350);
  await pg.click('#privacyBtn');
  await pg.waitForTimeout(500);
  const oculto = await pg.textContent('.hero__amount');
  ok('privacidad oculta las cifras', oculto.includes('••'));
  await pg.click('#privacyBtn');
  await pg.waitForTimeout(400);

  // 10. Moneda: cambiar a lempiras no debe alterar los datos base
  await pg.evaluate(() => { state.rates = { HNL: 24 }; state.currency = 'HNL'; render(); });
  await pg.waitForTimeout(450);
  s = await pg.evaluate(() => ({ txt: document.querySelector('.hero__amount').textContent, base: totals().balance, view: toView(totals().balance) }));
  ok('HNL se muestra con símbolo L', s.txt.indexOf('L') === 0);
  ok('la base sigue en USD y solo se convierte al mostrar', Math.abs(s.view - s.base * 24) < 0.01);
  await pg.evaluate(() => { state.currency = 'USD'; render(); });
  await pg.waitForTimeout(300);

  // 11. Persistencia tras recargar
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForTimeout(1100);
  s = await pg.evaluate(() => ({ n: state.entries.length, g: state.goals.length, sh: state.shop.length, b: state.budgets.length }));
  ok('todo sobrevive a recargar', s.n === 4 && s.g === 1 && s.sh === 1 && s.b === 1);

  // 12. Respaldo: exportar produce un JSON restaurable
  const backup = await pg.evaluate(() => JSON.stringify({ app:'Mi Alcancía', version:2, state: state }));
  await pg.evaluate(() => { state = blank(); save(true); render(); });
  await pg.waitForTimeout(400);
  ok('estado vaciado antes de restaurar', await pg.evaluate(() => state.entries.length === 0));
  await pg.evaluate(txt => {
    const inc = JSON.parse(txt).state;
    const base = blank();
    Object.keys(base).forEach(k => { if (inc[k] != null) base[k] = inc[k]; });
    state = base; sanitize(); reconcile(); save(true); render();
  }, backup);
  await pg.waitForTimeout(500);
  ok('respaldo restaura los 4 movimientos', await pg.evaluate(() => state.entries.length === 4));

  // 13. Datos corruptos: load() debe rendirse sin escribir encima
  s = await pg.evaluate(() => {
    localStorage.setItem('alcancia.v2', '{roto!!');
    localStorage.removeItem('alcancia.v2.rota');
    state = blank(); readFailed = false;
    load();
    const antes = localStorage.getItem('alcancia.v2');
    save(true);                       // debe ser un no-op
    return { failed: readFailed, raw: localStorage.getItem('alcancia.v2'), antes,
             rescue: localStorage.getItem('alcancia.v2.rota'), n: state.entries.length };
  });
  ok('detecta corrupción', s.failed === true);
  ok('abre vacía', s.n === 0);
  ok('NO sobrescribe los datos ilegibles', s.raw === '{roto!!');
  ok('aparta una copia para rescate', s.rescue === '{roto!!');


  // 14. Recetas: abrir una y mandar ingredientes a la lista
  await pg.evaluate(() => go('recetas'));
  await pg.waitForTimeout(450);
  ok('las 30 recetas van dentro del archivo', await pg.evaluate(() => RECETAS.length === 30));
  const antesShop = await pg.evaluate(() => state.shop.length);
  await pg.click('[data-act="ver-receta"]');
  await pg.waitForTimeout(500);
  ok('la ficha de receta abre con pasos', await pg.isVisible('.pasos'));
  await pg.click('[data-act="receta-a-compras"]');
  await pg.waitForTimeout(600);
  const despShop = await pg.evaluate(() => state.shop.length);
  ok('los ingredientes entran a la lista', despShop > antesShop);
  await pg.screenshot({ path: `${OUT}/5-receta.png` });

  // 15. Filtro por categoría de receta
  await pg.evaluate(() => { recetaCat = 'Postre'; render(); });
  await pg.waitForTimeout(400);
  const nPostres = await pg.evaluate(() => document.querySelectorAll('.receta').length);
  ok('el filtro de categoría reduce la rejilla', nPostres > 0 && nPostres < 30);
  await pg.evaluate(() => { recetaCat = 'Todas'; render(); });

  // 16. Asistente sin clave: debe responder igual con el motor local
  await pg.evaluate(() => { try { localStorage.removeItem('groq_api_key'); } catch(e){} });
  await pg.evaluate(() => go('asistente'));
  await pg.waitForTimeout(450);
  await pg.click('[data-act="chat-chip"]');
  await pg.waitForTimeout(600);
  let burbujas = await pg.evaluate(() => document.querySelectorAll('.burbuja').length);
  ok('sin clave responde igual (pregunta + respuesta)', burbujas === 2);
  const resp = await pg.evaluate(() => document.querySelectorAll('.burbuja--ella')[0].textContent);
  ok('la respuesta local cita cifras reales', /\$|\d/.test(resp) && resp.length > 20);

  await pg.fill('#chatIn', '¿en qué gasto más?');
  await pg.click('[data-act="chat-enviar"]');
  await pg.waitForTimeout(600);
  const r2t = await pg.evaluate(() => {
    const b = document.querySelectorAll('.burbuja--ella');
    return b[b.length-1].textContent;
  });
  ok('reconoce la pregunta por categorías', /Transporte|Compras|gastos registrados/i.test(r2t));
  await pg.screenshot({ path: `${OUT}/6-asistente.png` });

  // 17. Escanear sin clave pide la clave, no se cuelga
  await pg.evaluate(() => go('escanear'));
  await pg.waitForTimeout(450);
  ok('escanear pide la clave cuando no hay', await pg.isVisible('#gk'));
  await pg.fill('#gk', 'gsk_prueba_falsa');
  await pg.click('[data-act="guardar-key"]');
  await pg.waitForTimeout(500);
  ok('con clave aparece el botón de foto', await pg.isVisible('[data-act="scan-foto"]'));
  await pg.click('[data-act="borrar-key"]');
  await pg.waitForTimeout(400);
  ok('la clave se puede quitar', await pg.evaluate(() => !localStorage.getItem('groq_api_key')));

  // 18. Los importes nunca producen NaN
  const nan = await pg.evaluate(() => {
    const t = totals();
    return [money(t.balance), money(t.saved), money(0), money(null), money(undefined), money(NaN)]
      .some(s => /NaN|undefined/.test(s));
  });
  ok('money() nunca devuelve NaN', !nan);

  console.log(steps.join('\n'));
  console.log('\nERRORES JS:', errs.length ? errs.slice(0,8).join('\n') : 'ninguno');
  console.log('RESUMEN:', steps.filter(x=>x.startsWith('PASS')).length + '/' + steps.length + ' pasan');
  await b.close();
})();
