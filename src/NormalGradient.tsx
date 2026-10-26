import { memo, useEffect, useRef, type CSSProperties } from 'react';

export const NormalGradient = memo(function NormalGradient({ colors, suspended }: { colors: readonly string[]; suspended: boolean }) {
  const ref = useRef<HTMLDivElement>(null), time = useRef(0);
  useEffect(() => {
    const layer = ref.current!;
    const fields = [...layer.querySelectorAll('i')];
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0, previous: number | null = null;
    function paint() {
      const t = time.current;
      fields[0].style.transform = `translate(${Math.sin(t * .17) * 21}%,${Math.cos(t * .21) * 15}%) rotate(${t * 2.4}deg) scale(${1 + Math.sin(t * .14) * .12})`;
      fields[1].style.transform = `translate(${Math.cos(t * .23) * 24}%,${Math.sin(t * .19) * 20}%) rotate(${-t * 3}deg)`;
    }
    function active() { return !suspended && !document.hidden && !media?.matches; }
    function loop(now: number) {
      frame = 0;
      if (!active()) return;
      if (previous !== null) time.current += Math.min((now - previous) / 1000, .05);
      previous = now; paint(); frame = window.requestAnimationFrame(loop);
    }
    function sync() {
      window.cancelAnimationFrame?.(frame); frame = 0; previous = null;
      layer.dataset.running = String(active());
      if (active() && window.requestAnimationFrame) frame = window.requestAnimationFrame(loop);
    }
    paint(); sync();
    document.addEventListener('visibilitychange', sync); media?.addEventListener('change', sync);
    return () => { window.cancelAnimationFrame?.(frame); document.removeEventListener('visibilitychange', sync); media?.removeEventListener('change', sync); };
  }, [suspended]);
  return <div ref={ref} aria-hidden="true" className="normal-gradient" style={{ '--motion-first': colors[0], '--motion-second': colors[1] } as CSSProperties}><i /><i /></div>;
});
