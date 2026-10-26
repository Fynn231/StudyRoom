// normalVisibility.ts — normal-mode visibility helpers.
//
// Hidden-tab pause is driven by the page visibility API; reduced motion is
// read from the OS preference. They are surfaced as React hooks and applied
// to the document element so that the normal-mode atmosphere, the layered
// background gradient and the blossom trailing can pause or stop without
// touching the timer or any panel. No feature flags are used.

import { useEffect, useState } from 'react';

export function useHiddenTabPause(): boolean {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);

    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return paused;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);

    setReduced(media.matches);
    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
