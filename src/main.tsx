import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountApp } from './AccountApp.js';
import { AuthGate } from './AuthGate.js';
import { AuthProvider } from './auth.js';
import { useHiddenTabPause, useReducedMotion } from './normalVisibility.js';
import './styles.css';
import './lock-in-mode.css';
import './locked-atmospheres.css';
import './normal-atmosphere.css';

function NormalModeVisibility() {
  const hidden = useHiddenTabPause();
  const reduced = useReducedMotion();

  useEffect(() => {
    document.documentElement.setAttribute('data-hidden', String(hidden));
    document.documentElement.setAttribute('data-reduced-motion', String(reduced));
  }, [hidden, reduced]);

  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <NormalModeVisibility />
        <AccountApp />
      </AuthGate>
    </AuthProvider>
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell is optional; the app keeps working without it.
    });
  });
}
