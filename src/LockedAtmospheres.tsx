import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export const ATMOSPHERES = [
  {
    "id": "obsidian-static",
    "name": "Obsidian Static",
    "effect": "Film grain · slow scan sweep",
    "colors": [
      "#06070a",
      "#0d1014",
      "#9fb3a8"
    ],
    "background": "radial-gradient(120% 90% at 50% 10%, #10141a 0%, #07090c 60%, #040507 100%)",
    "timer": "#e8ece9",
    "accent": "#9fb3a8"
  },
  {
    "id": "ember-column",
    "name": "Ember Column",
    "effect": "Rising embers · warm floor glow",
    "colors": [
      "#0a0705",
      "#c2653a",
      "#f0e2d6"
    ],
    "background": "radial-gradient(90% 120% at 50% 110%, #1a0e07 0%, #0a0705 55%, #050303 100%)",
    "timer": "#f0e2d6",
    "accent": "#d9a07a"
  },
  {
    "id": "contour-drift",
    "name": "Contour Drift",
    "effect": "Flowing topographic lines · lateral",
    "colors": [
      "#05070b",
      "#6f8fa8",
      "#dfe7ee"
    ],
    "background": "radial-gradient(110% 100% at 30% 20%, #0b1119 0%, #070a0f 55%, #04060a 100%)",
    "timer": "#dfe7ee",
    "accent": "#6f8fa8"
  },
  {
    "id": "eclipse-bloom",
    "name": "Eclipse Bloom",
    "effect": "Breathing corona · no particles",
    "colors": [
      "#07050a",
      "#b9a6c9",
      "#ece6f2"
    ],
    "background": "#060409",
    "timer": "#ece6f2",
    "accent": "#b9a6c9"
  },
  {
    "id": "shard-field",
    "name": "Shard Field",
    "effect": "Diagonal parallax shards · rising",
    "colors": [
      "#050608",
      "#8d9aa6",
      "#e6eaee"
    ],
    "background": "linear-gradient(155deg, #0a0d12 0%, #06080b 60%, #04060a 100%)",
    "timer": "#e6eaee",
    "accent": "#8d9aa6"
  },
  {
    "id": "undertow",
    "name": "Undertow",
    "effect": "Layered bands · sideways swell",
    "colors": [
      "#04080a",
      "#4f8f86",
      "#dcebe7"
    ],
    "background": "#04080a",
    "timer": "#dcebe7",
    "accent": "#a9c6bd"
  },
  {
    "id": "signal-sweep",
    "name": "Signal Sweep",
    "effect": "Radar wedge · concentric rings",
    "colors": [
      "#050a09",
      "#8cdcbe",
      "#e6f2ec"
    ],
    "background": "radial-gradient(120% 120% at 50% 50%, #0a1210 0%, #050a09 60%, #030605 100%)",
    "timer": "#e6f2ec",
    "accent": "#8cdcbe"
  },
  {
    "id": "wireframe-drift",
    "name": "Wireframe Drift",
    "effect": "Perspective grid travelling forward",
    "colors": [
      "#04060a",
      "#7e96aa",
      "#e2eaf2"
    ],
    "background": "#04060a",
    "timer": "#e2eaf2",
    "accent": "#7e96aa"
  },
  {
    "id": "frost-lattice",
    "name": "Frost Lattice",
    "effect": "Crystal branches drawing themselves",
    "colors": [
      "#050a0e",
      "#9fc6d8",
      "#e7f4fa"
    ],
    "background": "radial-gradient(90% 90% at 50% 40%, #0a1218 0%, #050a0e 65%, #030608 100%)",
    "timer": "#e7f4fa",
    "accent": "#9fc6d8"
  },
  {
    "id": "aurora-fold",
    "name": "Aurora Fold",
    "effect": "Soft bands folding · blurred",
    "colors": [
      "#05070c",
      "#6ea0be",
      "#e8eef7"
    ],
    "background": "#05070c",
    "timer": "#e8eef7",
    "accent": "#6ea0be"
  },
  {
    "id": "halftone-pulse",
    "name": "Halftone Pulse",
    "effect": "Dot matrix breathing · centre mask",
    "colors": [
      "#06070a",
      "#bec8d0",
      "#eceff2"
    ],
    "background": "#06070a",
    "timer": "#eceff2",
    "accent": "#bec8d0"
  },
  {
    "id": "orbital-ash",
    "name": "Orbital Ash",
    "effect": "Tilted rings orbiting · trails",
    "colors": [
      "#060608",
      "#aab0b9",
      "#e9ebf0"
    ],
    "background": "radial-gradient(100% 100% at 50% 50%, #0a0a0d 0%, #060608 60%, #030304 100%)",
    "timer": "#e9ebf0",
    "accent": "#aab0b9"
  }
] as const;
export type AtmosphereId = typeof ATMOSPHERES[number]['id'];
const PREFERENCE_KEY = 'studyroom.lockedAtmosphere.v1';
type Preference = { id: AtmosphereId; motion: boolean };
export function readAtmosphere(storage: Pick<Storage, 'getItem'>): Preference {
  try {
    const value: unknown = JSON.parse(storage.getItem(PREFERENCE_KEY) ?? 'null');
    if (value && typeof value === 'object' && 'id' in value && 'motion' in value && typeof value.motion === 'boolean' && ATMOSPHERES.some(t => t.id === value.id)) return value as Preference;
  } catch { /* Denied or malformed storage must not stop a focus session. */ }
  return { id: 'obsidian-static', motion: true };
}
export function saveAtmosphere(storage: Pick<Storage, 'setItem'>, value: Preference): boolean {
  try { storage.setItem(PREFERENCE_KEY, JSON.stringify({ id: value.id, motion: value.motion })); return true; } catch { return false; }
}
export function atmosphereStyle(id: AtmosphereId): CSSProperties {
  const theme = ATMOSPHERES.find(t => t.id === id) ?? ATMOSPHERES[0];
  return { '--locked-background': theme.background, '--locked-timer': theme.timer, '--locked-accent': theme.accent } as CSSProperties;
}
function Effect({ selected }: { selected: AtmosphereId }) {
  switch (selected) {
    case 'obsidian-static': return <><div className="grain"></div><div className="scan"></div></>;
    case 'ember-column': return <><div className="glow"></div>
      <span className="ember" style={{"left": "12%", "animationDuration": "11s", "--drift": "34px"} as CSSProperties}></span>
      <span className="ember" style={{"left": "22%", "animationDuration": "14s", "animationDelay": "-6s", "--drift": "-18px"} as CSSProperties}></span>
      <span className="ember" style={{"left": "34%", "animationDuration": "9s", "animationDelay": "-3s", "--drift": "12px"} as CSSProperties}></span>
      <span className="ember" style={{"left": "44%", "animationDuration": "16s", "animationDelay": "-11s", "--drift": "-30px"} as CSSProperties}></span>
      <span className="ember" style={{"left": "57%", "animationDuration": "12s", "animationDelay": "-2s", "--drift": "24px"} as CSSProperties}></span>
      <span className="ember" style={{"left": "68%", "animationDuration": "17s", "animationDelay": "-8s", "--drift": "-12px"} as CSSProperties}></span>
      <span className="ember" style={{"left": "79%", "animationDuration": "10s", "animationDelay": "-5s", "--drift": "28px"} as CSSProperties}></span>
      <span className="ember" style={{"left": "88%", "animationDuration": "13s", "animationDelay": "-13s", "--drift": "-22px"} as CSSProperties}></span></>;
    case 'contour-drift': return <><svg viewBox="0 0 600 300" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-20 40 C 120 10, 200 90, 320 60 S 520 20, 640 55" />
        <path d="M-20 80 C 140 45, 220 125, 340 95 S 540 55, 640 92" />
        <path d="M-20 120 C 130 90, 240 160, 360 130 S 520 95, 640 130" />
        <path d="M-20 162 C 150 130, 230 200, 350 172 S 540 140, 640 172" />
        <path d="M-20 205 C 120 175, 220 245, 340 215 S 530 185, 640 216" />
        <path d="M-20 248 C 140 220, 240 285, 360 258 S 520 228, 640 260" />
      </svg></>;
    case 'eclipse-bloom': return <><div className="halo"></div><div className="core"></div></>;
    case 'shard-field': return <><span className="shard" style={{"left": "8%", "top": "20%", "animationDuration": "19s", "animationDelay": "-4s"} as CSSProperties}></span>
      <span className="shard" style={{"left": "26%", "top": "60%", "animationDuration": "24s", "animationDelay": "-12s"} as CSSProperties}></span>
      <span className="shard" style={{"left": "44%", "top": "8%", "animationDuration": "16s", "animationDelay": "-9s"} as CSSProperties}></span>
      <span className="shard" style={{"left": "62%", "top": "55%", "animationDuration": "27s", "animationDelay": "-2s"} as CSSProperties}></span>
      <span className="shard" style={{"left": "78%", "top": "26%", "animationDuration": "21s", "animationDelay": "-16s"} as CSSProperties}></span>
      <span className="shard" style={{"left": "92%", "top": "66%", "animationDuration": "23s", "animationDelay": "-7s"} as CSSProperties}></span></>;
    case 'undertow': return <><div className="band" style={{"top": "8%", "animationDuration": "22s"} as CSSProperties}></div>
      <div className="band" style={{"top": "38%", "animationDuration": "17s", "animationDirection": "reverse"} as CSSProperties}></div>
      <div className="band" style={{"top": "68%", "animationDuration": "27s"} as CSSProperties}></div></>;
    case 'signal-sweep': return <><div className="rings"></div><div className="sweep"></div></>;
    case 'wireframe-drift': return <><div className="floor"></div><div className="horizon"></div></>;
    case 'frost-lattice': return <><svg viewBox="0 0 600 300" aria-hidden="true">
        <path d="M300 150 L300 20 M300 150 L300 280 M300 150 L150 60 M300 150 L450 60 M300 150 L150 240 M300 150 L450 240" />
        <path d="M300 90 L260 70 M300 90 L340 70 M300 210 L260 230 M300 210 L340 230 M230 105 L215 130 M370 105 L385 130 M230 195 L215 170 M370 195 L385 170" />
        <path d="M180 75 L200 100 M420 75 L400 100 M180 225 L200 200 M420 225 L400 200" />
        <path d="M120 150 L150 150 M450 150 L480 150 M300 20 L300 40 M300 260 L300 280" />
        <path d="M300 150 L300 150" />
      </svg></>;
    case 'aurora-fold': return <><div className="fold" style={{"top": "14%"} as CSSProperties}></div><div className="fold"></div><div className="fold"></div></>;
    case 'halftone-pulse': return <><div className="dots"></div></>;
    case 'orbital-ash': return <><div className="ring"></div><div className="ring"></div><div className="ring"></div></>;
  }
}
export function LockedAtmosphere({ selected, motion }: { selected: AtmosphereId; motion: boolean }) {
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => { const update = () => setHidden(document.hidden); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  return <div className="locked-atmosphere" data-atmosphere={selected} data-motion={motion} data-paused={hidden} aria-hidden="true"><Effect key={selected} selected={selected} /></div>;
}
export function AtmospherePicker({ selected, onSelect, motion, onMotion }: { selected: AtmosphereId; onSelect: (id: AtmosphereId) => void; motion: boolean; onMotion: (value: boolean) => void }) {
  return <div className="locked-appearance"><p className="quiet-note">Only your view. Your chosen atmosphere is saved privately on this device, separately from normal appearance. Never sent to the room.</p><div className="atmosphere-options" role="group" aria-label="LOCKED IN atmospheres">{ATMOSPHERES.map(t => <button type="button" key={t.id} aria-pressed={selected === t.id} onClick={() => onSelect(t.id)}><span className="atmosphere-chips" aria-hidden="true">{t.colors.map(color => <i key={color} style={{ background: color }} />)}</span><span><strong>{t.name}</strong><small>{t.effect}</small></span></button>)}</div><label className="storage-option"><input type="checkbox" checked={motion} onChange={e => onMotion(e.target.checked)} />Animate atmosphere</label><p className="quiet-note">Motion off keeps a still composition. Reduced motion keeps every atmosphere still; hidden tabs pause. Only the selected effect is mounted.</p></div>;
}
