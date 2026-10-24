import { usePrivateStorage } from './privateStorage.js';
import { useId, useState } from 'react';
import { historyLimit, parseHistory, storageKey } from './history.js';

export type Outcome = 'completed' | 'partial' | 'blocked';
export type SessionRecord = { id: string; openedAt: number; finishedAt: number; commitment: string; outcome: Outcome; note: string };
const newSession = () => ({ id: crypto.randomUUID(), openedAt: Date.now() });


import { useCopy } from './lockInCopy.js';

export function PrivateReview({ commitment, onFinish, onNew }: { commitment: string; onFinish: () => void; onNew: () => void }) {
  const storage = usePrivateStorage();
  const c = useCopy();
  const uid = useId();
  const [session, setSession] = useState(newSession);
  const [reflection, setReflection] = useState<{ commitment: string; finishedAt: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>('partial');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [persist, setPersist] = useState(false);
  const [storageError, setStorageError] = useState('');
  function updateHistory(records: SessionRecord[]) {
    setHistory(records);
    if (persist) {
      try { storage.setItem(storageKey, JSON.stringify({ version: 1, records })); setStorageError(''); }
      catch { setPersist(false); setStorageError('Could not save on this device. History remains in this tab; an older stored copy may remain. Try Clear private history to delete it.'); }
    }
  }
  function toggleStorage(enabled: boolean) {
    setStorageError('');
    setPersist(false);
    if (!enabled) { deleteStored(); return; }
    try {
      const stored = parseHistory(storage.getItem(storageKey));
      const records = [...history, ...stored.filter(item => !history.some(existing => existing.id === item.id))].slice(0, historyLimit);
      storage.setItem(storageKey, JSON.stringify({ version: 1, records }));
      setHistory(records); setPersist(true);
    } catch { setStorageError('Device history was not loaded or saved. Storage is unavailable or its data is invalid. Your tab history is unchanged; clear stored history before trying again.'); }
  }
  function deleteStored() {
    try { storage.removeItem(storageKey); setStorageError(''); }
    catch { setStorageError('Could not delete the stored copy. Tab history can still be cleared; use browser site-data controls when storage is available.'); }
  }
  function finish() {
    if (saved) return;
    onFinish();
    setReflection({ commitment: commitment.slice(0, 240), finishedAt: Date.now() });
  }
  function save() {
    if (!reflection || saved) return;
    const record = { ...session, ...reflection, outcome, note: note.slice(0, 500) };
    updateHistory([record, ...history.filter(item => item.id !== record.id)].slice(0, historyLimit));
    setSaved(true); setReflection(null); setNote('');
  }
  return <section className="private-review" aria-label="Private reflection and history">
    <div className="intention-actions"><button disabled={saved || !!reflection} onClick={finish}>{c('finishPrivately', 'Finish privately')}</button><span className="quiet-note">Only your personal clock pauses. The room cycle keeps going.</span>{saved && <button onClick={() => { setSession(newSession()); setSaved(false); setReflection(null); setNote(''); setOutcome('partial'); onNew(); }}>{c('newPrivateSession', 'New private session')}</button>}</div>
    {reflection && <form className="reflection-form" onSubmit={e => { e.preventDefault(); save(); }}>
      <h2>A moment to reflect.</h2><label htmlFor={`${uid}-outcome`}>Session outcome</label><select id={`${uid}-outcome`} value={outcome} onChange={e => setOutcome(e.target.value as Outcome)}><option value="completed">Completed</option><option value="partial">Partial</option><option value="blocked">Blocked</option></select>
      <label htmlFor={`${uid}-note`}>Reflection note (optional)</label><textarea id={`${uid}-note`} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      <button className="primary" type="submit">Save private reflection</button><button type="button" onClick={() => setReflection(null)}>Cancel reflection</button>
    </form>}
    <details className="optional-panel"><summary>{c('historySummary', 'Private history')} {history.length > 0 && `(${history.length})`}</summary><p className="quiet-note">Only in this tab by default. Closing or refreshing discards it. Up to 50 sessions; no sample accomplishments.</p>
      <label className="storage-option"><input type="checkbox" checked={persist} onChange={e => toggleStorage(e.target.checked)} />Store history on this device</label><p className="quiet-note">Opt in to save completed reflections, including commitments and notes, in this browser’s local storage. Not encrypted; anyone using this browser profile or scripts on this origin may read it. Never sent to the room. Drafts, music and clocks are not saved. Enable again after refresh to load saved history. Opting out deletes the stored copy but keeps this tab’s history.</p>
      {history.length === 0 ? <p>No private sessions yet.</p> : <ul className="history" aria-label="Private sessions">{history.map(item => <li key={item.id}><time dateTime={new Date(item.finishedAt).toISOString()}>{new Date(item.finishedAt).toLocaleString()}</time><strong>{item.outcome}</strong><p>{item.commitment || 'No commitment entered'}</p>{item.note && <p>{item.note}</p>}</li>)}</ul>}
      <button onClick={() => { setHistory([]); deleteStored(); }}>Clear private history</button>
    </details>
    {storageError && <p className="error" role="alert">{storageError}</p>}
  </section>;
}
