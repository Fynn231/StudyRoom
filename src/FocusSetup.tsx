import { usePrivateStorage } from './privateStorage.js';
import { useEffect, useId, useState } from 'react';
import { useCopy } from './lockInCopy.js';

const KEY = 'studyroom.focusSetup.v1';

function loadConfirmed(storage: Storage): boolean {
  try { return storage?.getItem(KEY) === 'confirmed'; } catch { return false; }
}

export function FocusSetup({onEnter,active=false}:{onEnter?:()=>void;active?:boolean}={}) {
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
    {onEnter&&<><p>Focus view keeps your timer, intention and reviewed plan visible while hiding secondary tools. It never changes the room clock or starts a timer for you.</p><button onClick={onEnter}>{active?'Return to focus view':'Enter focus view'}</button><p className="quiet-note">Operational: timer, private planning, optional fullscreen and a reversible distraction-free view. Website blocking is optional and requires the separate extension below. Device notification controls remain manual.</p></>}
    <p className="quiet-note">
      Study Room cannot turn on system Focus, Do Not Disturb or notification silencing for you. This page has no access to those operating-system settings, and nothing here is detected or confirmed automatically.
    </p>
    <details><summary>Optional website blocker · Chrome / Edge</summary><p>Download and extract the extension, then open chrome://extensions or edge://extensions, enable Developer mode and choose Load unpacked. Review its permissions yourself. Choose your distracting domains and a duration in its popup; Start blocking and Stop remain under your control.</p><a className="launch-link" href="/downloads/studyroom-focus-extension.zip" download>Download optional focus blocker</a><p className="quiet-note">Desktop Chrome/Edge only; not Safari or mobile. This page cannot install it or verify that it is active. Blocking and your study timer start separately. New page loads are blocked; already-open media may continue. No content scripts, history collection or network telemetry.</p></details>
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
