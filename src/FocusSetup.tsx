import { usePrivateStorage } from './privateStorage.js';
import { useEffect, useId, useState } from 'react';
import { useCopy } from './lockInCopy.js';

const KEY = 'studyroom.focusSetup.v1';

function loadConfirmed(storage: Storage): boolean {
  try { return storage?.getItem(KEY) === 'confirmed'; } catch { return false; }
}

export function FocusSetup() {
  const storage = usePrivateStorage();
  const c = useCopy();
  const id = useId();
  const [confirmed, setConfirmed] = useState(() => loadConfirmed(storage));
  useEffect(() => {
    try {
      if (confirmed) storage?.setItem(KEY, 'confirmed');
      else storage?.removeItem(KEY);
    } catch { /* storage unavailable: session-only */ }
  }, [confirmed]);
  return <details className="optional-panel focus-setup">
    <summary>{c('focusSetupSummary', 'Protect your focus')}</summary>
    <p className="quiet-note">
      Study Room cannot turn on system Focus, Do Not Disturb or notification silencing for you. This page has no access to those operating-system settings, and nothing here is detected or confirmed automatically.
    </p>
    <ul className="focus-setup-steps">
      <li><strong>iPhone / iPad:</strong> open Settings → Focus, choose a Focus, then enable it before you start. A Shortcut with the “Set Focus” action can do this if you set it up yourself.</li>
      <li><strong>Android:</strong> open Settings → Sound &amp; vibration → Do Not Disturb (or Digital Wellbeing → Bedtime mode) and enable it manually. A website cannot enable it.</li>
      <li><strong>Mac:</strong> open Control Center → Focus and enable a Focus. Allowing Shortcuts automation is your own choice.</li>
    </ul>
    <label className="storage-option">
      <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
      I enabled my device’s Focus or Do Not Disturb myself for this session
    </label>
    <p className="quiet-note" role="status">
      {confirmed
        ? 'Recorded as your own confirmation on this device. Study Room did not verify it and cannot turn it off or on.'
        : 'Not confirmed. Notifications remain under your device’s control.'}
    </p>
    <p className="quiet-note">Emergency calls and your existing Focus preferences are untouched.</p>
    <p className="quiet-note" id={`${id}-limits`}>This guidance never enables, disables or reports system Focus state.</p>
  </details>;
}
