import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountApp } from './AccountApp.js';
import { AuthGate } from './AuthGate.js';
import { AuthProvider } from './auth.js';
import './styles.css';
import './lock-in-mode.css';
import './locked-atmospheres.css';
createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><AuthGate><AccountApp /></AuthGate></AuthProvider></StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell is optional; the app keeps working without it.
    });
  });
}
