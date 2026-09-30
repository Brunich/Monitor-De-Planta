import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPlant, step, stopLine, resumeLine, lineOee, totals, pareto, clock, CAUSE_NAMES, SHIFT, type Plant, type Lot } from './sim';
import LiveChart, { LINE_COLORS } from './LiveChart';
import { Icon } from './icons';

const SPEEDS = [1, 60, 300];
const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
const STATE: Record<Lot['state'], string> = { prod: 'Produciendo', insp: 'En inspección', ok: 'Liberado', held: 'Retenido' };

// Barra de progreso por bloques, como las de copiar archivos.
function SegBar({ value, label }: { value: number; label?: string }) {
 const n = 12, on = Math.round(Math.min(1, value) * n);
 return <div className="seg" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
  {Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : ''}/>)}
  <span>{Math.round(value * 100)}%</span>
 </div>;
}

function Panel({ icon, title, children, className = '' }: { icon: Parameters<typeof Icon>[0]['name']; title: string; children: ReactNode; className?: string }) {
 return <section className={`panel ${className}`} aria-label={title}>
  <h2 className="panel-head"><Icon name={icon}/>{title}</h2>
  <div className="panel-body">{children}</div>
 </section>;
}

// Ventana que se arrastra desde la barra de título (sólo en pantallas grandes).
function useDrag(initial: { x: number; y: number }) {
 const [pos, setPos] = useState(initial);
 const onPointerDown = (e: React.PointerEvent) => {
  if ((e.target as HTMLElement).closest('button') || window.innerWidth < 900) return;
  const sx = e.clientX - pos.x, sy = e.clientY - pos.y;
  const move = (ev: PointerEvent) => setPos({ x: Math.max(-200, ev.clientX - sx), y: Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - sy)) });
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
 };
 return { pos, onPointerDown };
}

function StopDialog({ line, onOk, onCancel }: { line: string; onOk: (cause: string) => void; onCancel: () => void }) {
 const [cause, setCause] = useState(CAUSE_NAMES[0]);
 return <div className="modal-back">
  <div className="window dialog" role="dialog" aria-modal="true" aria-labelledby="stop-title">
   <div className="title-bar"><div className="title-bar-text" id="stop-title">Registrar detención · {line}</div><div className="title-bar-controls"><button aria-label="Close" onClick={onCancel}/></div></div>
   <div className="window-body">
    <div className="dialog-row"><Icon name="warn" size={32}/><p>La línea {line} se detendrá hasta que la reanudes. ¿Cuál es la causa?</p></div>
    <div className="field-row-stacked"><label htmlFor="cause">Causa</label>
     <select id="cause" value={cause} onChange={e => setCause(e.target.value)} autoFocus>{CAUSE_NAMES.map(c => <option key={c}>{c}</option>)}</select></div>
    <div className="dialog-buttons"><button className="default" onClick={() => onOk(cause)}>Aceptar</button><button onClick={onCancel}>Cancelar</button></div>
   </div>
  </div>
 </div>;
}

export default function App() {
 const plant = useRef<Plant>(createPlant());
 const [, setFrame] = useState(0);
 const [speed, setSpeed] = useState(60);
 const [paused, setPaused] = useState(false);
 const [open, setOpen] = useState(true);
 const [asking, setAsking] = useState<string | null>(null);
 const drag = useDrag({ x: 110, y: 16 });
 const live = useRef({ speed, paused: paused || !!asking });
 live.current = { speed, paused: paused || !!asking };

 // La simulación avanza cada cuadro; React sólo se repinta unas 8 veces por segundo.
 useEffect(() => {
  let raf = 0, last = performance.now(), acc = 0;
  const tick = (now: number) => {
   const dt = Math.min(0.25, (now - last) / 1000); last = now;
   if (!live.current.paused && plant.current.t < SHIFT) step(plant.current, dt * live.current.speed);
   acc += dt;
   if (acc > 0.12) { acc = 0; setFrame(f => f + 1); }
   raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
 }, []);

 const p = plant.current, tot = totals(p), par = pareto(p), done = p.t >= SHIFT;
 const perHour = p.history.length ? Object.values(p.history[p.history.length - 1].rate).reduce((a, b) => a + b, 0) : 0;
 const maxPar = par[0]?.[1] ?? 1, held = p.lots.filter(l => l.state === 'held').length;

 return <div className="desktop">
  <button className="desk-icon" onClick={() => setOpen(true)}><Icon name="factory" size={32}/><span>Monitor de planta</span></button>

  {open && <main className="window app" style={{ left: drag.pos.x, top: drag.pos.y }}>
   <div className="title-bar" onPointerDown={drag.onPointerDown}>
    <div className="title-bar-text"><Icon name="factory"/>Monitor de planta · Turno matutino</div>
    <div className="title-bar-controls"><button aria-label="Minimize" onClick={() => setOpen(false)}/><button aria-label="Maximize" disabled/><button aria-label="Close" onClick={() => setOpen(false)}/></div>
   </div>
   <div className="window-body">
    <div className="toolbar">
     <button onClick={() => setPaused(v => !v)} disabled={done}><Icon name={paused ? 'play' : 'pause'}/>{paused ? 'Reanudar' : 'Pausa'}</button>
     <div className="field-row"><label htmlFor="speed">Velocidad</label>
      <select id="speed" value={speed} onChange={e => setSpeed(+e.target.value)}>{SPEEDS.map(s => <option key={s} value={s}>{s === 1 ? 'Tiempo real' : `x${s}`}</option>)}</select></div>
     <button onClick={() => { plant.current = createPlant(Math.floor(Math.random() * 1e6)); setPaused(false); }}><Icon name="new"/>Nuevo turno</button>
     <span className="clock" aria-label="Hora de planta">{clock(p.t)} <small>/ 14:00</small></span>
    </div>

    <Panel icon="scope" title="Pulso de la planta" className="pulse">
     <div className="lcd">
      <small>OEE DEL TURNO</small>
      <strong>{pct(tot.oee)}</strong>
      <dl><div><dt>Disponibilidad</dt><dd>{pct(tot.A)}</dd></div><div><dt>Rendimiento</dt><dd>{pct(tot.R)}</dd></div><div><dt>Calidad</dt><dd>{pct(tot.Q)}</dd></div></dl>
      <small className="rate">PIEZAS POR HORA · <b>{Math.round(perHour)}</b></small>
     </div>
     <div className="chart-wrap">
      <div className="chart-legend"><span>Piezas por hora</span>{p.lines.map(l => <span key={l.id}><i style={{ background: LINE_COLORS[l.id] }}/>{l.id}</span>)}</div>
      <LiveChart plant={p}/>
      <div className="chart-foot"><span>← 60 min</span><span>ahora</span></div>
     </div>
    </Panel>

    <Panel icon="gear" title="Líneas">
     <table className="lines"><tbody>{p.lines.map(l => {
      const o = lineOee(l, p.t), stopped = l.state === 'stop';
      return <tr key={l.id} className={stopped ? 'is-stop' : ''}>
       <td><span className={`led ${stopped ? 'red' : 'green'}`} aria-hidden/><b>{l.id}</b> · {l.model}</td>
       <td className="state">{stopped ? <>Detenida: {l.cause} <small>({Math.round((p.t - l.stopStart) / 60)} min)</small></> : 'Produciendo'}</td>
       <td className="lot">Lote {l.lot.id} <SegBar value={l.lot.made / l.lot.plan} label={`Avance del lote ${l.lot.id}`}/></td>
       <td className="oee">OEE <b>{pct(o.oee)}</b></td>
       <td>{stopped ? <button onClick={() => resumeLine(p, l.id)} disabled={done}>Reanudar</button> : <button onClick={() => setAsking(l.id)} disabled={done}>Detener…</button>}</td>
      </tr>;
     })}</tbody></table>
    </Panel>

    <div className="split">
     <Panel icon="queue" title="Cola de lotes">
      <div className="sunken-panel queue"><table className="interactive">
       <thead><tr><th>Lote</th><th>Línea</th><th>Estado</th><th>Avance</th></tr></thead>
       <tbody>{p.lots.slice(0, 9).map(lot => <tr key={lot.id}>
        <td>{lot.id}</td><td>{lot.line}</td>
        <td className={`st-${lot.state}`}>{STATE[lot.state]}{lot.state === 'held' && lot.defect ? <small> · {lot.defect}</small> : null}</td>
        <td><SegBar value={lot.state === 'prod' ? lot.made / lot.plan : lot.state === 'insp' ? 1 - lot.inspLeft / 360 : 1} label={`Lote ${lot.id}`}/></td>
       </tr>)}</tbody>
      </table></div>
     </Panel>
     <Panel icon="warn" title="Detenciones">
      <div className="pareto">{par.length ? par.slice(0, 5).map(([c, m]) => <div key={c} className="pbar"><span>{c}</span><i style={{ width: `${m / maxPar * 100}%` }}/><b>{m} min</b></div>) : <p className="empty">Sin detenciones todavía.</p>}</div>
      <ul className="log sunken-panel" aria-label="Registro del turno" aria-live="polite">{p.events.slice(0, 7).map((e, i) => <li key={`${e.t}-${i}`} className={`ev-${e.kind}`}><time>{clock(e.t)}</time>{e.text}</li>)}</ul>
     </Panel>
    </div>
   </div>
   <div className="status-bar">
    <p className="status-bar-field">{done ? 'Turno cerrado' : paused ? 'En pausa' : speed === 1 ? 'En vivo' : `En vivo · x${speed}`}</p>
    <p className="status-bar-field">{tot.made.toLocaleString('es-MX')} piezas</p>
    <p className="status-bar-field">{tot.rej} {tot.rej === 1 ? 'rechazo' : 'rechazos'}</p>
    <p className="status-bar-field">{held} {held === 1 ? 'lote retenido' : 'lotes retenidos'}</p>
   </div>
  </main>}

  {asking && <StopDialog line={asking} onCancel={() => setAsking(null)} onOk={c => { stopLine(p, asking, c, 999); setAsking(null); }}/>}

  <footer className="taskbar">
   <button className="start"><Icon name="logo"/>Inicio</button>
   <button className={`task ${open ? 'active' : ''}`} onClick={() => setOpen(o => !o)}><Icon name="factory"/>Monitor de planta</button>
   <span className="tray"><Icon name="speaker"/>{clock(p.t)}</span>
  </footer>
 </div>;
}
