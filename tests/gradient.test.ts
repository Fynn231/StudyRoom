import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { customGradient } from '../src/appearanceColors.js';
import { PRESETS } from '../src/Appearance.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const lum = (hex: string) => hex.replace('#', '').match(/\w\w/g)!.map(h => parseInt(h, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);

test('full app defaults to a stationary deeper white-to-sage diagonal instead of a multicolor timer-only mesh', () => {
  const backdrop = css.match(/\.room-backdrop\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.ok(backdrop.includes('linear-gradient(to bottom right, #ffffff 0%, #80a879 100%)'));
  assert.ok(backdrop.includes('min-height: 100vh'));
  const focus = css.match(/\.focus-surface\s*\{([^}]+)\}/)![1];
  assert.equal(focus.includes('radial-gradient'), false);
  assert.equal(/animation/.test(backdrop + focus), false);
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
});

test('normal focus text clears 4.5:1 against its actual opaque reading surface', () => {
  assert.match(css, /\.focus-surface \{ background: var\(--paper\)/);
  const paper = css.match(/--paper: (#[a-f0-9]{6})/)![1];
  const colors = [css.match(/--muted: (#[a-f0-9]{6})/)![1], css.match(/\.timer-caption \{[^}]*color: (#[a-f0-9]{6})/)![1], css.match(/\.timer-area \.eyebrow \{[^}]*color: (#[a-f0-9]{6})/)![1]];
  for (const color of colors) assert.ok(ratio(paper, color) >= 4.5, color);
});

test('direct custom extremes retain their entered stops while protected text surfaces and focus retain contrast', () => {
  const adversarial = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];
  for (let channel = 0; channel < 256; channel++) adversarial.push('#' + channel.toString(16).padStart(2, '0').repeat(3));
  for (const color of [...adversarial, ...PRESETS.flatMap(p => [...p.colors])]) {
    assert.equal(customGradient(color, '#ffffff'), `linear-gradient(to bottom right, ${color}, #ffffff)`);
  }
  // Opaque islands, not an app-sized wash: actual browser compositing is also checked.
  for (const selector of ['.masthead', '.page-heading', '.demo-note', '.session-tools', '.focus-surface', '.people-surface', '.intention-surface', '.optional-panel', '.chime-controls', '.private-review', 'footer']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.ok(css.includes('background: var(--paper);') && css.includes('/* Protected reading islands'));
  const paper = css.match(/--paper: (#[a-f0-9]{6})/)![1];
  for (const token of ['ink', 'muted', 'accent']) assert.ok(ratio(css.match(new RegExp(`--${token}: (#[a-f0-9]{6})`))![1], paper) >= 4.5);
  assert.ok(ratio('#fffdf7', '#3b5741') >= 4.5);
  assert.ok(css.includes('outline: 3px solid var(--accent)'));
});
