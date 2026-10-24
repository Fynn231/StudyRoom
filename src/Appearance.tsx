import { useId, useState, type ReactNode } from 'react';
import { customGradient } from './appearanceColors.js';

export const PRESETS = [
  { name: 'Sage', colors: ['#f0f6e6', '#557b53'] },
  { name: 'Peach Glow', colors: ['#ffdfb6', '#bd665e'] },
  { name: 'Lavender Mist', colors: ['#e4d7f2', '#766192'] },
  { name: 'Ocean Haze', colors: ['#c4e5de', '#316d7b'] },
  { name: 'Forest Study', colors: ['#8ba884', '#243e36'] },
  { name: 'Rosewood', colors: ['#edc8b9', '#7e3e50'] },
  { name: 'Blue Hour', colors: ['#abbfce', '#293c60'] },
  { name: 'Juliette', colors: ['#ffe6a3', '#8faa78'] },
  { name: 'Moon Garden', colors: ['#b9c8da', '#283e50'] },
  { name: 'Autumn Letters', colors: ['#f3d5a3', '#925743'] },
] as const;

export type FlowerEffect = 'none' | 'static' | 'falling' | 'moon-static' | 'moon-falling' | 'leaves-static' | 'leaves-falling';
const EFFECT_THEMES: Record<string, { still: FlowerEffect; moving: FlowerEffect; label: string }> = {
  Juliette: { still: 'static', moving: 'falling', label: 'Falling flowers' },
  'Moon Garden': { still: 'moon-static', moving: 'moon-falling', label: 'Drifting moonlight' },
  'Autumn Letters': { still: 'leaves-static', moving: 'leaves-falling', label: 'Falling leaves' },
};
import { useCopy } from './lockInCopy.js';

export function Appearance({ onChange, onEffectChange, lockedPicker }: { onChange: (background: string | undefined) => void; onEffectChange: (effect: FlowerEffect) => void; lockedPicker?: ReactNode }) {
  const c = useCopy();
  const [falling, setFalling] = useState(false);
  function clearEffects() { setFalling(false); onEffectChange('none'); }
  const [selected, setSelected] = useState('default');
  const [colors, setColors] = useState(['#ffffff', '#80a879']);
  const [text, setText] = useState(colors);
  const [errors, setErrors] = useState([false, false]);
  const uid = useId();
  function chooseColor(index: number, value: string) {
    setText(previous => previous.map((color, i) => i === index ? value : color));
    const next = colors.map((color, i) => i === index ? value : color);
    const background = customGradient(next[0], next[1]);
    setErrors(previous => previous.map((error, i) => i === index ? !background : error));
    if (!background) return;
    clearEffects(); setColors(next); setSelected('custom'); onChange(background);
  }
  function syncColors(next: string[]) { setColors(next); setText(next); setErrors([false, false]); }
  return <details className="appearance">
    <summary>{c('appearanceSummary', 'Appearance')}</summary>
    <div hidden={!!lockedPicker}>
    <p className="quiet-note">Only your view, in Solo or Party. Stays in this tab until reload; never sent to the room.</p>
    <div className="appearance-presets" role="group" aria-label="Color presets">
      {PRESETS.map(preset => <button key={preset.name} aria-pressed={selected === preset.name} onClick={() => {
        setFalling(false); onEffectChange(EFFECT_THEMES[preset.name]?.still ?? 'none');
        setSelected(preset.name); syncColors([...preset.colors]);
        onChange(customGradient(preset.colors[0], preset.colors[1])!);
      }}><span aria-hidden="true" className="preset-swatch" style={{ background: customGradient(preset.colors[0], preset.colors[1])! }} />{preset.name}</button>)}
    </div>
    {EFFECT_THEMES[selected] && <div className="flower-option"><label className="storage-option"><input type="checkbox" checked={falling} onChange={e => { setFalling(e.target.checked); onEffectChange(e.target.checked ? EFFECT_THEMES[selected].moving : EFFECT_THEMES[selected].still); }} />{EFFECT_THEMES[selected].label}</label><p className="quiet-note">Original background accents. Motion is off by default. Reduced motion keeps them still; hidden tabs pause. Only in your view.</p></div>}
    <fieldset className="appearance-custom" aria-describedby={`${uid}-contract`}><legend>Custom two-color gradient · #RRGGBB</legend>
      {colors.map((color, index) => <div className="appearance-color" key={index}>
        <label htmlFor={`${uid}-color-${index}`}>{index === 0 ? 'First custom color' : 'Second custom color'}</label>
        <div className="color-pair"><input id={`${uid}-color-${index}`} type="color" value={color} onChange={e => chooseColor(index, e.target.value)} onInput={e => chooseColor(index, e.currentTarget.value)} />
          <div><label htmlFor={`${uid}-hex-${index}`}>{index === 0 ? 'First custom HEX' : 'Second custom HEX'}</label>
            <input id={`${uid}-hex-${index}`} type="text" value={text[index]} spellCheck={false} autoComplete="off" aria-invalid={errors[index]} aria-describedby={errors[index] ? `${uid}-error-${index}` : `${uid}-contract`} onChange={e => chooseColor(index, e.target.value)} />
          </div>
        </div>
        {errors[index] && <p id={`${uid}-error-${index}`} role="alert" className="hex-error">Use #RRGGBB (six hex digits). Last valid theme is still applied.</p>}
      </div>)}
    </fieldset>
    <button className="appearance-reset" aria-pressed={selected === 'default'} onClick={() => { clearEffects(); setSelected('default'); syncColors(['#ffffff', '#80a879']); onChange(undefined); }}>Reset appearance to white and sage</button>
    <p id={`${uid}-contract`} className="quiet-note">Exact HEX stops, top left → bottom right. No whitening or color adjustment. Opaque paper reading surfaces protect text; the surrounding gradient keeps your colors.</p>
    </div>{lockedPicker}
  </details>;
}
