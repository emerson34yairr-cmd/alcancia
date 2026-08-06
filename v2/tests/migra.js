const { chromium, devices } = require('playwright');
const steps = [], errs = [];
const ok = (n, c, extra) => steps.push((c ? 'PASS  ' : 'FAIL  ') + n + (c ? '' : '   << ' + JSON.stringify(extra)));

// Datos con la forma EXACTA de la versión anterior
const v1 = () => {
  const V4 = { days: [
    { date: '2026-07-01', worked: true, entries: [
        { earned: 100, saved: 20, spent: 0, note: 'Turno', category: 'food' },
        { earned: 0, saved: 0, spent: 15, note: 'Almuerzo', category: 'food' } ] },
    { date: '2026-07-02', worked: false, entries: [
        { earned: 0, saved: 0, spent: 8.5, note: 'Compra: Leche · Lácteos',
          source: 'shop', itemName: 'Leche', expenseCategory: 'shopping',
          shopCategory: 'lacteos', estPrice: 8.5, savedAdj: -8.5, entryDate: '2026-07-02' } ] },
    { date: '2026-07-03', worked: true, entries: [
        { earned: 60, saved: 30, spent: 12, note: '', category: 'transport' } ] },
  ], unlockedAchs: ['primer_paso', 'primer_ahorro'], achDates: { primer_paso: '2026-07-01' } };

  localStorage.setItem('alcancia_v4', JSON.stringify(V4));
  localStorage.setItem('alcancia_metas', JSON.stringify([
    { id: 'm1', name: 'Bici', goal: 200, startFrom: '2026-07-01', deadline: '2026-12-31', createdAt: '2026-07-01T00:00:00Z' } ]));
  localStorage.setItem('alcancia_budgets_v1', JSON.stringify([
    { id: '1', category: 'lacteos', amount: 50, period: 'mensual' },
    { id: '2', category: 'general', amount: 200, period: 'mensual' } ]));
  localStorage.setItem('alcancia_shop_v1', JSON.stringify([
    { id: 9, name: 'Pan', qty: '2', estPrice: 1.5, category: 'panaderia', status: 'pending', priority: 'urgente' },
    { id: 10, name: 'Café', qty: '', price: 4, checked: true, priority: 'espera', spentLogged: true } ]));
  localStorage.setItem('alcancia_shop_spent_v1', JSON.stringify([
    { id: 11, name: 'Leche', category: 'lacteos', price: 8.5, items: [], date: '2026-07-02' },
    { id: 12, name: 'Jabón', category: 'limpieza', price: 3, items: [], date: '2026-07-05' } ]));
  localStorage.setItem('alcancia_price_history', JSON.stringify([
    { nombreItem: 'Pan', precio: 1.5, fecha: '2026-06-20' } ]));
  localStorage.setItem('alcancia_moneda', 'HNL');
  localStorage.setItem('alcancia_privacy_mode', '1');
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
  await ctx.addInitScript(v1);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(String(e).slice(0,240)));
  await pg.goto('http://localhost:8898/v2/', { waitUntil: 'load' });
  await pg.waitForTimeout(1400);

  const s = await pg.evaluate(() => ({
    entries: state.entries.length,
    earned: totals().earned, saved: totals().saved, spent: totals().spent,
    kinds: state.entries.reduce((a,e)=>{a[e.kind]=(a[e.kind]||0)+1;return a;},{}),
    retiros: state.entries.filter(e=>e.src==='retiro').length,
    days: state.days,
    goals: state.goals,
    budgets: state.budgets,
    shop: state.shop,
    prices: state.prices,
    achievements: Object.keys(state.achievements),
    currency: state.currency, privacy: state.privacy,
    v1Intacto: !!localStorage.getItem('alcancia_v4'),
    dupLeche: state.entries.filter(e => e.kind==='spend' && Math.abs(e.amount-8.5)<0.001).length,
  }));

  // v1: earned 100+60=160 | saved (20)+(0-8.5)+(30)=41.5 | spent 15+8.5+12=35, más Jabón 3 del historial = 38
  ok('ingresos migrados (160)', Math.abs(s.earned-160)<0.001, s.earned);
  ok('ahorros con savedAdj negativo (41.5)', Math.abs(s.saved-41.5)<0.001, s.saved);
  ok('el savedAdj negativo se marca como retiro', s.retiros===1, s.retiros);
  // 15 (almuerzo) + 8.50 (leche) + 12 (transporte) = 35.50, más Jabón 3 del historial
  ok('gastos: ledger 35.50 + Jabón 3 del historial = 38.50', Math.abs(s.spent-38.5)<0.001, s.spent);
  ok('la compra de Leche NO se cuenta dos veces', s.dupLeche===1, s.dupLeche);
  ok('días trabajados conservados', s.days['2026-07-01'].worked===true && s.days['2026-07-02'].worked===false, s.days);
  ok('meta con su fecha de inicio', s.goals[0].name==='Bici' && s.goals[0].target===200 && s.goals[0].since==='2026-07-01', s.goals[0]);
  ok('fecha límite conservada', s.goals[0].due==='2026-12-31', s.goals[0].due);
  ok('presupuesto de pasillo "lacteos" mapeado a Comida', s.budgets[0].cat==='food', s.budgets);
  ok('lista de compras con prioridades traducidas', s.shop.length===2 && s.shop[0].prio==='alta' && s.shop[1].prio==='baja', s.shop.map(i=>i.prio));
  ok('estado comprado/registrado conservado', s.shop[1].done===true && s.shop[1].logged===true, s.shop[1]);
  ok('memoria de precios en campos nuevos', s.prices[0] && s.prices[0].name==='Pan' && s.prices[0].price===1.5, s.prices);
  ok('logros ya ganados se conservan', s.achievements.includes('primer_paso') && s.achievements.includes('primer_ahorro'), s.achievements);
  ok('moneda HNL y privacidad conservadas', s.currency==='HNL' && s.privacy===true, [s.currency, s.privacy]);
  ok('la versión anterior queda INTACTA', s.v1Intacto === true, s.v1Intacto);

  // El ledger v1 sigue byte a byte igual
  const same = await pg.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('alcancia_v4'));
    return d.days.length===3 && d.days[0].entries.length===2 && d.unlockedAchs.length===2;
  });
  ok('alcancia_v4 sin modificar', same);

  await pg.screenshot({ path: './capturas/7-migrado.png' });
  console.log(steps.join('\n'));
  console.log('\nERRORES:', errs.length ? errs.join('\n') : 'ninguno');
  console.log('RESUMEN:', steps.filter(x=>x.startsWith('PASS')).length + '/' + steps.length);
  await b.close();
})();
