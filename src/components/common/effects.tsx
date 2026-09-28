import { useCallback, useRef, type PointerEvent } from 'react';

/** 3D tilt + glare following the pointer (after React Bits' Tilted Card). */
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const onPointerMove = useCallback((e: PointerEvent<T>) => {
    const el = ref.current; if (!el) return;
    const b = el.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 12).toFixed(2)}deg)`;
    el.style.setProperty('--gx', `${(px + 0.5) * 100}%`); el.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  }, []);
  const onPointerLeave = useCallback(() => { if (ref.current) ref.current.style.transform = ''; }, []);
  return { ref, onPointerMove, onPointerLeave };
}

/** Burst of sparks from the click point (after React Bits' Click Spark). */
export function spark(e: PointerEvent<HTMLElement>) {
  const b = e.currentTarget.getBoundingClientRect();
  const cv = document.createElement('canvas');
  const W = b.width + 160, H = b.height + 160, dpr = devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr;
  Object.assign(cv.style, { position: 'fixed', pointerEvents: 'none', zIndex: '100', width: `${W}px`, height: `${H}px`, left: `${b.left - 80}px`, top: `${b.top - 80}px` });
  document.body.appendChild(cv);
  const c = cv.getContext('2d')!; c.scale(dpr, dpr);
  const ox = e.clientX - b.left + 80, oy = e.clientY - b.top + 80, t0 = performance.now();
  const rays = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2 + Math.random() * 0.2, l: 30 + Math.random() * 40 }));
  const tick = (now: number) => {
    const q = Math.min(1, (now - t0) / 480), ease = 1 - (1 - q) ** 3;
    c.clearRect(0, 0, W, H); c.lineCap = 'round';
    for (const r of rays) {
      const d0 = ease * r.l, d1 = d0 + 14 * (1 - q);
      c.strokeStyle = `rgba(255,${200 - q * 80},80,${1 - q})`; c.lineWidth = 3 * (1 - q) + 0.5;
      c.beginPath(); c.moveTo(ox + Math.cos(r.a) * d0, oy + Math.sin(r.a) * d0); c.lineTo(ox + Math.cos(r.a) * d1, oy + Math.sin(r.a) * d1); c.stroke();
    }
    if (q < 1) requestAnimationFrame(tick); else cv.remove();
  };
  requestAnimationFrame(tick);
}
