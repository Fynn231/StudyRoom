import { useEffect, useState, type CSSProperties } from 'react';
import type { FlowerEffect } from './Appearance.js';

// Authored, deterministic scatter: no per-render randomness or layout polling.
// All 24 original marks stay below opaque reading islands, including in gaps.
const SCATTER = [[3, 3], [68, 13], [21, 22], [97, 31], [44, 40], [12, 49], [61, 58], [89, 67], [33, 76], [56, 85], [7, 94], [79, 10], [2, 18], [95, 27], [26, 36], [74, 45], [16, 54], [52, 63], [91, 72], [36, 81], [4, 90], [84, 97], [43, 14.8], [66, 38]];
export function Flowers({ effect }: { effect: Exclude<FlowerEffect, 'none'> }) {
  const [paused, setPaused] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', update);
    update();
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const kind = effect.startsWith('moon-') ? 'moon' : effect.startsWith('leaves-') ? 'leaves' : 'flowers';
  return <div className="flower-layer" aria-hidden="true" data-kind={kind} data-falling={effect.endsWith('falling')} data-paused={paused}>
    {SCATTER.map(([x, y], i) => <svg key={i} className="flower" viewBox="0 0 40 40" focusable="false" style={{ '--x': `${x}%`, '--size': `${18 + (i % 4) * 3}px`, '--duration': `${24 + (i % 7) * 3}s`, '--delay': `${-i * 7}s`, '--rest': `${y}vh` } as CSSProperties}>
      {kind === 'flowers' ? <><g fill={i % 2 ? '#fff6d6' : '#f8edb5'} stroke="#6f855b" strokeWidth=".7">
        {[0, 72, 144, 216, 288].map(angle => <ellipse key={angle} cx="20" cy="11" rx="5.5" ry="9" transform={`rotate(${angle} 20 20)`} />)}
      </g><circle cx="20" cy="20" r="4" fill="#b28b39" /></> : kind === 'moon' ?
        <path d={i % 4 === 0 ? 'M29 4C9 0 0 22 16 33C24 39 34 34 37 27C16 32 10 13 29 4Z' : 'M20 3L24 15L37 20L24 24L20 37L16 24L3 20L16 16Z'} fill={i % 4 === 0 ? '#f6df9d' : '#edf4ef'} stroke="#67818f" strokeWidth="1" /> :
        <><path d={i % 2 ? 'M5 34C0 13 18 4 35 5C36 25 28 39 5 34Z' : 'M6 34L8 24L2 20L13 18L12 7L21 13L30 3L31 17L38 19L29 26L32 33L20 31Z'} fill={i % 2 ? '#bd7046' : '#d5a34e'} stroke="#805436" strokeWidth="1" /><path d="M5 35L29 11M14 26L12 18M20 20L29 21" fill="none" stroke="#805436" strokeWidth="1.3" /></>}
    </svg>)}
  </div>;
}
