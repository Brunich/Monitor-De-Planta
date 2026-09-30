// Planta simulada: tres líneas que producen, fallan y liberan lotes. Todo en segundos de planta,
// con semilla, para que las pruebas salgan igual siempre y la pantalla sólo tenga que dibujar.

export type LineState = 'run' | 'stop';
export type LotState = 'prod' | 'insp' | 'ok' | 'held';
export type Line = { id: string; model: string; cycle: number; state: LineState; cause: string; stopLeft: number; stopStart: number; lot: Lot; made: number; rej: number; stopSec: number; carry: number };
export type Lot = { id: number; line: string; model: string; plan: number; made: number; rej: number; defect: string; state: LotState; inspLeft: number };
export type Event = { t: number; line: string; kind: 'stop' | 'run' | 'lot' | 'held' | 'ok'; text: string };
export type Sample = { t: number; rate: Record<string, number>; oee: number };
export type Plant = { t: number; seed: number; lines: Line[]; lots: Lot[]; events: Event[]; history: Sample[]; stops: Record<string, number>; nextLot: number; lastSample: number; counts: { t: number; n: Record<string, number> }[] };

export const SHIFT = 8 * 3600;
export const LOT_SIZE = 150;
export const REJECT_LIMIT = 0.03;
const SAMPLE_EVERY = 60;
const HISTORY = 60;
const WINDOW = 10;
const CAUSES: [string, number, number][] = [['Cambio de modelo', 12, 20], ['Falla en robot de soldadura', 25, 60], ['Falta de material', 8, 22], ['Ajuste de herramental', 10, 16], ['Atasco en transportador', 5, 12]];
const DEFECTS: Record<string, string[]> = { L1: ['Rayón en puerta', 'Burbuja en cofre', 'Torque fuera de rango'], L2: ['Holgura en puerta', 'Fuga en sello de puerta', 'Arnés mal conectado'], L3: ['Soldadura incompleta', 'Abolladura en caja', 'Escurrimiento'] };
// Qué tan seguido falla cada línea (paros por hora) y qué tanto rechaza: L2 es la problemática.
const PROFILE: Record<string, { stopsPerHour: number; reject: number; pace: number }> = { L1: { stopsPerHour: 0.35, reject: 0.008, pace: 0.96 }, L2: { stopsPerHour: 0.6, reject: 0.018, pace: 0.92 }, L3: { stopsPerHour: 0.45, reject: 0.012, pace: 0.9 } };

// mulberry32: chico y suficiente para una simulación.
function rand(p: Plant) {
 p.seed = (p.seed + 0x6d2b79f5) | 0;
 let x = Math.imul(p.seed ^ (p.seed >>> 15), 1 | p.seed);
 x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
 return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function newLot(p: Plant, line: string, model: string): Lot {
 return { id: p.nextLot++, line, model, plan: LOT_SIZE, made: 0, rej: 0, defect: '', state: 'prod', inspLeft: 0 };
}

export function createPlant(seed = 4411): Plant {
 const p: Plant = { t: 0, seed, lines: [], lots: [], events: [], history: [], stops: {}, nextLot: 4411, lastSample: 0, counts: [{ t: 0, n: { L1: 0, L2: 0, L3: 0 } }] };
 // Lo que dejó el turno nocturno: la cola no arranca vacía, como en una planta de verdad.
 const night: [number, string, string, number, string, LotState][] = [
  [4410, 'L2', 'M-34 SUV', 3, 'Holgura en puerta', 'insp'], [4409, 'L1', 'M-21 Sedán', 2, 'Rayón en puerta', 'ok'], [4408, 'L3', 'M-40 Pickup', 7, 'Soldadura incompleta', 'held'],
  [4407, 'L2', 'M-34 SUV', 2, 'Arnés mal conectado', 'ok'], [4406, 'L1', 'M-21 Sedán', 1, 'Burbuja en cofre', 'ok'],
 ];
 p.lots.push(...night.map(([id, line, model, rej, defect, state]) => ({ id, line, model, plan: LOT_SIZE, made: LOT_SIZE, rej, defect, state, inspLeft: state === 'insp' ? 1500 : 0 })));
 ([['L1', 'M-21 Sedán', 60], ['L2', 'M-34 SUV', 72], ['L3', 'M-40 Pickup', 80]] as const).forEach(([id, model, cycle]) => {
  const lot = newLot(p, id, model);
  p.lots.unshift(lot);
  p.lines.push({ id, model, cycle, state: 'run', cause: '', stopLeft: 0, stopStart: 0, lot, made: 0, rej: 0, stopSec: 0, carry: 0 });
 });
 return p;
}

function log(p: Plant, line: string, kind: Event['kind'], text: string) {
 p.events.unshift({ t: p.t, line, kind, text });
 if (p.events.length > 80) p.events.length = 80;
}

export function stopLine(p: Plant, id: string, cause?: string, minutes?: number) {
 const l = p.lines.find(x => x.id === id);
 if (!l || l.state === 'stop') return;
 const c = cause ? CAUSES.find(x => x[0] === cause) ?? [cause, 10, 10] : CAUSES[Math.floor(rand(p) * CAUSES.length)];
 const min = minutes ?? Math.round(c[1] + rand(p) * (c[2] - c[1]));
 l.state = 'stop'; l.cause = c[0]; l.stopLeft = min * 60; l.stopStart = p.t;
 log(p, id, 'stop', `${id} detenida: ${c[0]}`);
}

export function resumeLine(p: Plant, id: string) {
 const l = p.lines.find(x => x.id === id);
 if (!l || l.state !== 'stop') return;
 const min = Math.max(1, Math.round((p.t - l.stopStart) / 60));
 p.stops[l.cause] = (p.stops[l.cause] ?? 0) + min;
 log(p, id, 'run', `${id} reanudó tras ${min} min (${l.cause})`);
 l.state = 'run'; l.cause = ''; l.stopLeft = 0;
}

function finishLot(p: Plant, l: Line) {
 const lot = l.lot;
 lot.state = 'insp'; lot.inspLeft = 6 * 60;
 log(p, l.id, 'lot', `Lote ${lot.id} terminado, pasa a inspección`);
 l.lot = newLot(p, l.id, l.model);
 p.lots.unshift(l.lot);
 if (p.lots.length > 14) p.lots.length = 14;
}

// Avanza la planta `dt` segundos. Se parte en pasos de un segundo para que la velocidad no cambie el resultado.
export function step(p: Plant, dt: number) {
 let left = Math.min(dt, SHIFT - p.t);
 while (left > 0) {
  const h = Math.min(1, left);
  left -= h; p.t += h;
  for (const l of p.lines) {
   const prof = PROFILE[l.id];
   if (l.state === 'stop') {
    l.stopSec += h; l.stopLeft -= h;
    if (l.stopLeft <= 0) resumeLine(p, l.id);
    continue;
   }
   if (rand(p) < prof.stopsPerHour / 3600 * h) { stopLine(p, l.id); continue; }
   // El ritmo real oscila alrededor del ideal: eso es lo que baja el rendimiento.
   l.carry += h / (l.cycle / (prof.pace * (0.94 + rand(p) * 0.12)));
   while (l.carry >= 1) {
    l.carry -= 1; l.made++; l.lot.made++;
    if (rand(p) < prof.reject * (l.lot.id % 5 === 0 ? 2.6 : 1)) {
     l.rej++; l.lot.rej++;
     const d = DEFECTS[l.id]; l.lot.defect = d[Math.floor(rand(p) * d.length)];
    }
    if (l.lot.made >= l.lot.plan) finishLot(p, l);
   }
  }
  for (const lot of p.lots) if (lot.state === 'insp' && (lot.inspLeft -= h) <= 0) {
   const rate = lot.rej / lot.made;
   lot.state = rate > REJECT_LIMIT ? 'held' : 'ok';
   log(p, lot.line, lot.state, lot.state === 'held' ? `Lote ${lot.id} retenido: rechazo de ${(rate * 100).toFixed(1)} %${lot.defect ? ` · ${lot.defect}` : ''}` : `Lote ${lot.id} liberado`);
  }
  if (p.t - p.lastSample >= SAMPLE_EVERY) sample(p);
 }
}

// Ritmo de los últimos 10 minutos, contando la pieza a medias: medido minuto a minuto sale en serrucho.
function sample(p: Plant) {
 const rate: Record<string, number> = {}, back = p.counts[Math.max(0, p.counts.length - WINDOW)];
 const now: Record<string, number> = {};
 for (const l of p.lines) { now[l.id] = l.made + l.carry; rate[l.id] = back ? (now[l.id] - back.n[l.id]) / (p.t - back.t) * 3600 : 0; }
 p.counts.push({ t: p.t, n: now });
 if (p.counts.length > WINDOW) p.counts.shift();
 p.history.push({ t: p.t, rate, oee: totals(p).oee });
 if (p.history.length > HISTORY) p.history.shift();
 p.lastSample = p.t;
}

// OEE = disponibilidad × rendimiento × calidad, igual que en el consolidador.
export function lineOee(l: Line, t: number) {
 const T = Math.max(t, 1), run = Math.max(T - l.stopSec, 1);
 const A = run / T, R = Math.min(1, l.made * l.cycle / run), Q = l.made ? (l.made - l.rej) / l.made : 1;
 return { A, R, Q, oee: A * R * Q };
}

export function totals(p: Plant) {
 const T = Math.max(p.t, 1) * p.lines.length;
 const run = p.lines.reduce((a, l) => a + Math.max(p.t - l.stopSec, 0), 0) || 1;
 const ideal = p.lines.reduce((a, l) => a + l.made * l.cycle, 0);
 const made = p.lines.reduce((a, l) => a + l.made, 0), rej = p.lines.reduce((a, l) => a + l.rej, 0);
 const A = run / T, R = Math.min(1, ideal / run), Q = made ? (made - rej) / made : 1;
 return { A, R, Q, oee: A * R * Q, made, rej };
}

// Minutos de detención por causa, contando las que siguen abiertas.
export function pareto(p: Plant): [string, number][] {
 const m = { ...p.stops };
 for (const l of p.lines) if (l.state === 'stop') m[l.cause] = (m[l.cause] ?? 0) + Math.round((p.t - l.stopStart) / 60);
 return Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

export function clock(t: number, start = 6) {
 const s = Math.floor(t) + start * 3600;
 return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
}

export const CAUSE_NAMES = CAUSES.map(c => c[0]);
