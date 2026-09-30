import { useEffect, useRef } from 'react';
import type { Plant } from './sim';

export const LINE_COLORS: Record<string, string> = { L1: '#000080', L2: '#008080', L3: '#800000' };

// Se dibuja en su propio ciclo: la gráfica corre de lado entre muestra y muestra, así se ve en vivo aunque haya una por minuto.
export default function LiveChart({ plant }: { plant: Plant }) {
 const ref = useRef<HTMLCanvasElement>(null);
 const plantRef = useRef(plant);
 plantRef.current = plant;
 useEffect(() => {
  let raf = 0;
  const draw = () => {
   const c = ref.current;
   if (!c) return;
   const dpr = Math.min(2, window.devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight;
   if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
   const g = c.getContext('2d')!;
   g.setTransform(dpr, 0, 0, dpr, 0, 0);
   g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
   const p = plantRef.current, top = 90, span = 60 * 60;
   const x = (t: number) => W - (p.t - t) / span * W, y = (v: number) => H - 4 - Math.min(v, top) / top * (H - 18);
   // Cuadrícula que se recorre con el tiempo, como la de un osciloscopio.
   g.strokeStyle = '#e4e4e4'; g.lineWidth = 1; g.beginPath();
   for (let m = Math.floor((p.t - span) / 600) * 600; m <= p.t; m += 600) { const gx = Math.round(x(m)) + .5; g.moveTo(gx, 0); g.lineTo(gx, H); }
   for (let v = 0; v <= top; v += 30) { const gy = Math.round(y(v)) + .5; g.moveTo(0, gy); g.lineTo(W, gy); }
   g.stroke();
   g.fillStyle = '#808080'; g.font = '10px "Pixelated MS Sans Serif", Arial';
   for (let v = 30; v <= top; v += 30) g.fillText(String(v), 3, y(v) - 2);
   const h = p.history;
   for (const l of p.lines) {
    g.strokeStyle = LINE_COLORS[l.id]; g.lineWidth = 2; g.beginPath();
    h.forEach((s, i) => { const px = x(s.t), py = y(s.rate[l.id]); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    // El último tramo llega hasta "ahora" con el valor en curso.
    if (h.length) g.lineTo(W, y(l.state === 'stop' ? 0 : h[h.length - 1].rate[l.id]));
    g.stroke();
   }
   raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
 }, []);
 return <canvas ref={ref} className="chart" role="img" aria-label="Piezas por hora de cada línea en los últimos 60 minutos"/>;
}
