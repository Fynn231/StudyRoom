import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Juliette flowers spin twice during bounded staggered falling durations', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const flowers = readFileSync(new URL('../src/Flowers.tsx', import.meta.url), 'utf8');
  const keyframes = css.match(/@keyframes flower-fall \{(.*?)\} \}/s)?.[1];
  assert.ok(keyframes, 'real falling keyframes exist');
  assert.match(keyframes, /rotate\(720deg\)/, 'two rotations during the unchanged fall');
  assert.match(flowers, /24 \+ \(i % 7\) \* 3/, 'keep 24–42 second durations as flower count increases');
});

test('Moon Garden drifts and Autumn Letters flutter with distinct CSS-only effects', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /data-kind="moon"[^}]+animation-name: moon-drift/s);
  assert.match(css, /data-kind="leaves"[^}]+animation-name: leaf-flutter/s);
  assert.match(css, /@keyframes moon-drift/);
  assert.match(css, /@keyframes leaf-flutter/);
});
