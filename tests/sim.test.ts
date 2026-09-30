import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlant, step, stopLine, resumeLine, totals, lineOee, pareto, clock, SHIFT } from '../src/sim.ts';

test('misma semilla, mismo turno', () => {
 const a = createPlant(7), b = createPlant(7);
 step(a, 3600); for (let i = 0; i < 360; i++) step(b, 10);
 assert.deepEqual(totals(a), totals(b));
 assert.equal(a.events.length, b.events.length);
});

test('un turno completo da un OEE creíble', () => {
 const p = createPlant();
 step(p, SHIFT + 500);
 assert.equal(p.t, SHIFT);
 const t = totals(p);
 assert.ok(t.oee > 0.6 && t.oee < 0.95, `OEE ${t.oee}`);
 assert.ok(t.made > 800, `piezas ${t.made}`);
 for (const l of p.lines) { const o = lineOee(l, p.t); assert.ok(o.A <= 1 && o.R <= 1 && o.Q <= 1); }
});

test('una detención manual baja la disponibilidad y entra al Pareto', () => {
 const p = createPlant(3);
 step(p, 600);
 stopLine(p, 'L2', 'Falta de material', 60);
 step(p, 1800);
 assert.equal(p.lines[1].state, 'stop');
 assert.ok(lineOee(p.lines[1], p.t).A < 0.4);
 assert.equal(pareto(p)[0][0], 'Falta de material');
 resumeLine(p, 'L2');
 assert.equal(p.lines[1].state, 'run');
 assert.equal(p.stops['Falta de material'], 30);
});

test('los lotes terminan, se inspeccionan y se liberan o retienen', () => {
 const p = createPlant();
 step(p, 5 * 3600);
 assert.ok(p.lots.some(l => l.state === 'ok'));
 for (const l of p.lots.filter(x => x.state === 'held')) assert.ok(l.rej / l.made > 0.03);
 assert.ok(p.history.length > 0 && p.history.length <= 60);
});

test('el reloj arranca a las 6', () => {
 assert.equal(clock(0), '06:00');
 assert.equal(clock(3600 * 8 + 59), '14:00');
});
