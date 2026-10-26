import { memo, useRef, type CSSProperties } from 'react';
import type { FlowerEffect } from './Appearance.js';
import { cuppedPetalFaces, useNaturalMotion } from './naturalMotion.js';

// 48 flower positions (scattered across the viewport)
const SCATTER: Array<[number, number]> = [
  [3, 7], [10, 20], [17, 33], [24, 46], [31, 59], [38, 72], [45, 85], [52, 98],
  [59, 11], [66, 24], [73, 37], [80, 50], [87, 63], [94, 76], [1, 89], [8, 2],
  [15, 15], [22, 28], [29, 41], [36, 54], [43, 67], [50, 80], [57, 93], [64, 6],
  [71, 19], [78, 32], [85, 45], [92, 58], [99, 71], [6, 84], [13, 97], [20, 10],
  [27, 23], [34, 36], [41, 49], [48, 62], [55, 75], [62, 88], [69, 1], [76, 14],
  [83, 27], [90, 40], [97, 53], [4, 66], [11, 79], [18, 92], [25, 5], [32, 18]
];
const CUPPED = SCATTER.map((_, i) => cuppedPetalFaces(i));

// Star positions for the Moon atmosphere (used only when kind === 'moon')
const STARS: Array<{ x: number; y: number; s: number }> = [
  { x: 5, y: 9, s: 2.0 }, { x: 16, y: 26, s: 2.8 }, { x: 27, y: 43, s: 3.6 },
  { x: 38, y: 60, s: 2.0 }, { x: 49, y: 77, s: 2.8 }, { x: 60, y: 94, s: 3.6 },
  { x: 71, y: 11, s: 2.0 }, { x: 82, y: 28, s: 2.8 }, { x: 93, y: 45, s: 3.6 },
  { x: 4, y: 62, s: 2.0 }, { x: 15, y: 79, s: 2.8 }, { x: 26, y: 96, s: 3.6 },
  { x: 37, y: 13, s: 2.0 }, { x: 48, y: 30, s: 2.8 }, { x: 59, y: 47, s: 3.6 },
  { x: 70, y: 64, s: 2.0 }, { x: 81, y: 81, s: 2.8 }, { x: 92, y: 98, s: 3.6 },
  { x: 3, y: 15, s: 2.0 }, { x: 14, y: 32, s: 3.0 }, { x: 25, y: 49, s: 3.6 },
  { x: 36, y: 66, s: 2.0 }, { x: 47, y: 83, s: 3.6 }, { x: 58, y: 0, s: 4.0 }
];

export const Flowers = memo(function Flowers({ effect, suspended = false }: { effect: Exclude<FlowerEffect, 'none'>; suspended?: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const kind = effect.startsWith('moon-') ? 'moon' : effect.startsWith('leaves-') ? 'leaves' : 'flowers';
  useNaturalMotion(layer, effect.endsWith('falling'), suspended);

  // Render starfield for Moon mode
  const stars = kind === 'moon' ? (
    <div className="moon-stars" aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {STARS.map((star, i) => (
        <svg
          key={i}
          className="star"
          viewBox="-1.2 -1.2 2.4 2.4"
          focusable="false"
          style={{
            position: 'absolute',
            width: 'var(--s)',
            height: 'var(--s)',
            left: `${star.x}%`,
            top: `${star.y}%`,
            '--s': `${star.s}px`,
            '--c': '#f6df9d' // warm bright star colour
          } as CSSProperties}
        >
          <path d="M0,-1 L1,0 L0,0.7 L-1,0 L0,-0.7 Z" fill="var(--c)" stroke="#67818f" strokeWidth="0.2" />
        </svg>
      ))}
    </div>
  ) : null;

  return (
    <div ref={layer} className="flower-layer natural-flowers" aria-hidden="true" data-kind={kind} data-falling={effect.endsWith('falling')}>
      {SCATTER.map(([x, y], i) => (
        <svg
          key={i}
          className="flower"
          viewBox={kind === 'flowers' ? '-1.7 -1.7 3.4 3.4' : '0 0 40 40'}
          focusable="false"
          style={{
            '--x': `${x}%`,
            '--size': `${42 + (i % 4) * 7}px`,
            '--duration': `${24 + (i % 7) * 3}s`,
            '--delay': `${-i * 7}s`,
            '--rest': `${y}vh`,
          } as CSSProperties}
        >
          {kind === 'flowers' ? (
            <>
              {CUPPED[i].map((face, n) => (
                <path
                  key={n}
                  d={face.d}
                  fill={face.color}
                  stroke={face.color}
                  strokeWidth=".012"
                  strokeLinejoin="round"
                />
              ))}
              <ellipse cx="0" cy="0" rx=".145" ry=".105" fill="#b89042" />
            </>
          ) : kind === 'moon' ? (
            <>
              <path
                d={
                  i % 4 === 0
                    ? 'M29 4C9 0 0 22 16 33C24 39 34 34 37 27C16 32 10 13 29 4Z'
                    : 'M20 3L24 15L37 20L24 24L20 37L16 24L3 20L16 16Z'
                }
                fill={i % 4 === 0 ? '#f6df9d' : '#edf4ef'}
                stroke="#67818f"
                strokeWidth="1"
              />
            </>
          ) : (
            <>
              <path
                d={i % 2 ? 'M5 34C0 13 18 4 35 5C36 25 28 39 5 34Z' : 'M6 34L8 24L2 20L13 18L12 7L21 13L30 3L31 17L38 19L29 26L32 33L20 31Z'}
                fill={i % 2 ? '#bd7046' : '#d5a34e'}
                stroke="#805436"
                strokeWidth="1"
              />
              <path d="M5 35L29 11M14 26L12 18M20 20L29 21" fill="none" stroke="#805436" strokeWidth="1.3" />
            </>
          )}
        </svg>
      ))}
      {stars}
    </div>
  );
});

export default Flowers;
