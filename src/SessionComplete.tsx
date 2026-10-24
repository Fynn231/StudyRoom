import { usePrivateStorage } from './privateStorage.js';
import { useEffect, useId, useRef, useState } from 'react';
import { clearSessions, rateSession, type SessionRecord } from './sessionRecords.js';

const FULL_NOTE = 'Thank you for choosing Study Room to be part of your day. I built this hoping it could make studying a little more enjoyable, and it means a lot that you’re here. Keep going — I’m rooting for you.';
const SHORT_NOTE = 'Thanks for spending part of your day here. Keep going — I’m rooting for you.';
const LOCKED_NOTE = 'You made the decision to focus, and you followed through. Thanks for letting something I created be part of that effort. Until the next mission.';

function Stars({ legend, name, value, onChange }: { legend: string; name: string; value: number | null; onChange: (v: number | null) => void }) {
  return <fieldset className="sc-stars">
    <legend>{legend}</legend>
    <div className="sc-star-row">
      {[1, 2, 3, 4, 5].map(n => <label key={n} className="sc-star">
        <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${n} out of 5`} />
        <span aria-hidden="true">{'★'}</span>
        <span className="sc-star-number" aria-hidden="true">{n}</span>
      </label>)}
    </div>
    <button type="button" className="sc-clear" onClick={() => onChange(null)} disabled={value === null}>Clear</button>
  </fieldset>;
}

export function SessionComplete({ open, record, locked, firstVisit, storageError, onClose }: {
  open: boolean; record: SessionRecord | null; locked: boolean; firstVisit: boolean; storageError?: string; onClose: () => void;
}) {
  const storage = usePrivateStorage();
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const [experience, setExperience] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !record) return;
    setExperience(record.rating); setFocus(record.focusRating); setMessage(''); setError('');
    restore.current = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button, input, summary, a[href]')].filter(el => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); restore.current?.focus?.(); };
  }, [open, record, onClose]);

  if (!open || !record) return null;
  const minutes = record.focusedMs === 0 ? 0 : Math.max(1, Math.round(record.focusedMs / 60000));
  const steps = record.stepsTotal > 0 ? `${record.stepsDone} of ${record.stepsTotal}` : 'No plan steps';

  function submit() {
    if (!record) return;
    const result = rateSession(record.id, experience, focus, storage);
    if (!result.ok) { setError(result.error ?? 'Feedback was not saved.'); return; }
    setError(''); setMessage('Saved on this device with this session. Not uploaded anywhere.');
  }

  function removeHistory() {
    if (!window.confirm('Delete all completed-session records and ratings stored in this browser? This cannot be undone.')) return;
    setMessage(clearSessions(storage) ? 'Stored session history deleted.' : 'History could not be deleted.');
  }

  return <div className="session-complete-backdrop">
    <div ref={dialog} className={`session-complete${locked ? ' session-complete-locked' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-summary`} tabIndex={-1}>
      <p className="eyebrow">{locked ? 'PROTOCOL COMPLETE' : 'SESSION COMPLETE'}</p>
      <h2 id={`${id}-title`}>{locked ? 'Mission accomplished.' : 'You showed up today. That matters.'}</h2>
      <p className="sc-lead" id={`${id}-summary`}>{locked ? 'The timer has stopped. The progress is yours.' : 'Whether you finished everything or made a little progress, thank you for spending part of your day here.'}</p>

      <dl className="sc-stats">
        <div><dt>{locked ? 'Time in protocol' : 'Time focused'}</dt><dd>{minutes} min</dd></div>
        <div><dt>{locked ? 'Directives cleared' : 'Plan steps checked'}</dt><dd>{steps}</dd></div>
      </dl>

      <Stars legend={locked ? 'How did this operation run?' : 'How was your experience with Study Room today?'} name={`${id}-experience`} value={experience} onChange={setExperience} />
      <Stars legend={locked ? 'How locked in did you feel?' : 'How focused did you feel? (optional)'} name={`${id}-focus`} value={focus} onChange={setFocus} />
      <p className="quiet-note">Optional. Ratings are stored on this device with this session’s duration and step count; no notes, files or room identities. Nothing is uploaded. Skip leaves your session saved without feedback.</p>

      <div className="sc-note">
        <p>{locked ? LOCKED_NOTE : firstVisit ? FULL_NOTE : SHORT_NOTE}</p>
        {!firstVisit && !locked && <details><summary>Read Fynn’s note</summary><p>{FULL_NOTE}</p></details>}
        <p className="sc-signature">— Fynn, creator of Study Room</p>
      </div>

      {storageError && <p className="error" role="alert">{storageError}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="quiet-note" role="status">{message}</p>}

      <div className="sc-actions">
        <button className="primary" onClick={submit} disabled={experience === null && focus === null}>Save feedback</button>
        <button onClick={onClose}>{locked ? 'Close mission report' : 'Skip'}</button>
        <button className="sc-clear" onClick={onClose}>{locked ? 'Close report' : 'Close'}</button>
      </div>
      <button className="sc-delete" onClick={removeHistory}>Delete stored session history</button>
    </div>
  </div>;
}
