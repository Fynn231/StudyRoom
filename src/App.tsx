import { inviteCode, roomInvite, loopbackInvite } from './invite.js';
import { usePrivateStorage } from './privateStorage.js';
import { useEffect, useId, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useOptionalAuth } from './auth';
import type { Reply, RoomState } from './protocol.js';
import { PrivateReview } from './PrivateReview.js';
import { GoalNotes } from './GoalNotesPanel.js';
import { HowStudyRoomWorks } from './HowStudyRoomWorks.js';
import { SessionIntention } from './SessionIntention.js';

import { Music } from './Music.js';
import { FocusSetup } from './FocusSetup.js';
import { CopyContext, lockedCopy, normalCopy } from './lockInCopy.js';
import { SessionComplete } from './SessionComplete.js';
import { creatorNoteSeen, markCreatorNoteSeen, saveSession, type SessionRecord } from './sessionRecords.js';

function countPlanSteps(): { done: number; total: number } {
  for (const selector of ['.session-plan', '.roadmap-panel', '.resumed-study-plan']) {
    const root = document.querySelector(selector);
    if (!root) continue;
    const boxes = [...root.querySelectorAll<HTMLInputElement>('.step-check input[type="checkbox"]')];
    if (boxes.length > 0) return { done: boxes.filter(box => box.checked).length, total: boxes.length };
  }
  return { done: 0, total: 0 };
}
import { createFocusChime } from './sound.js';
import { Appearance, type FlowerEffect } from './Appearance.js';
import { Flowers } from './Flowers.js';
import { LockedAtmosphere, AtmospherePicker, atmosphereStyle, readAtmosphere, saveAtmosphere, type AtmosphereId } from './LockedAtmospheres.js';

type Snapshot = { room: RoomState; receivedAt: number };
export function App({ endpoint }: { endpoint?: string }) {
  const storage = usePrivateStorage();
  const sessionStorage = usePrivateStorage('sessionStorage');
  const [background, setBackground] = useState<string | undefined>();
  const [flowerEffect, setFlowerEffect] = useState<FlowerEffect>('none');
  const [atmospherePreference, setAtmospherePreference] = useState(() => readAtmosphere(storage));
  const [atmosphereStorageError, setAtmosphereStorageError] = useState('');
  const { id: atmosphere, motion: atmosphereMotion } = atmospherePreference;
  function chooseAtmosphere(id: AtmosphereId, motion = atmosphereMotion) {
    const preference = { id, motion };
    setAtmospherePreference(preference);
    setAtmosphereStorageError(saveAtmosphere(storage, preference) ? '' : 'Atmosphere changed for this visit, but could not be saved on this device.');
  }
  const uid = useId();
  const socket = useRef<Socket | null>(null);
  const membership = useRef<{ code: string; name: string } | null>(null);
  const generation = useRef(0);
  const sending = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selfId, setSelfId] = useState('');
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [invited] = useState(() => inviteCode(new URL(window.location.href)));
  const [code, setCode] = useState(invited ?? '');
  const [inviteMessage, setInviteMessage] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (invited) nameInput.current?.focus(); }, [invited]);
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const chimeAllowed = useRef(true);
  const soundGeneration = useRef(0);
  const [soundMessage, setSoundMessage] = useState('');
  const chime = useRef<ReturnType<typeof createFocusChime> | null>(null);
  if (!chime.current) chime.current = createFocusChime(undefined, setSoundMessage);
  useEffect(() => () => chime.current?.dispose(), []);
  const [draft, setDraft] = useState('');
  const [lockIn, setLockIn] = useState(() => {
    try { return sessionStorage.getItem('studyroom.lockIn') === '1'; } catch { return false; }
  });
  const [musicActivation, setMusicActivation] = useState(0);
  const [completion, setCompletion] = useState<SessionRecord | null>(null);
  const [completionFirst, setCompletionFirst] = useState(false);
  const [storageError, setStorageError] = useState('');
  const sessionRef = useRef<{ id: string; plannedMs: number } | null>(null);
  const recordedRef = useRef<string | null>(null);
  const lockInTouched = useRef(false);
  const brandPresses = useRef<number[]>([]);
  function exitLockIn() { lockInTouched.current = true; setLockIn(false); }
  function revealLockIn() {
    lockInTouched.current = true;
    setLockIn(true);
    setMusicActivation(n => n + 1);
  }
  function tapBrand() {
    const now = performance.now();
    brandPresses.current = [...brandPresses.current.filter(at => now - at < 2500), now];
    if (brandPresses.current.length >= 5) { brandPresses.current = []; revealLockIn(); }
  }
  useEffect(() => {
    if (!lockInTouched.current) return;
    try { sessionStorage.setItem('studyroom.lockIn', lockIn ? '1' : '0'); } catch { /* storage unavailable: session-only */ }
  }, [lockIn]);
  useEffect(() => {
    // Hidden activation: five quick "L" presses outside a text field toggle the mode; Escape leaves it.
    let presses: number[] = [];
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && lockIn) { exitLockIn(); return; }
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) { presses = []; return; }
      if (e.repeat || e.isComposing || e.keyCode === 229 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'l') { presses = []; return; }
      const now = performance.now();
      presses = [...presses.filter(at => now - at < 2000), now];
      if (presses.length >= 5) { presses = []; if (lockIn) exitLockIn(); else revealLockIn(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lockIn]);
  const c = lockIn ? lockedCopy : normalCopy;
  useEffect(() => {
    document.title = lockIn ? 'LOCKED IN — focus protocol' : 'Study Room — focus together';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', lockIn ? '#0a0a0a' : '#f5f2e9');
  }, [lockIn]);

  const [submitted, setSubmitted] = useState<string | null>(null);
  const [intentionError, setIntentionError] = useState('');
  const composing = useRef(false);
  function planSession() {
    if (!draft.trim() || draft.length > 240 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(draft)) {
      setIntentionError('Write an intention of 1–240 characters, without control characters.'); return;
    }
    setIntentionError(''); setSubmitted(draft.trim());
  }

  const [clockChoice, setClockChoice] = useState<'personal' | 'room' | null>('personal');
  const [party, setParty] = useState(!!invited);
  const [personal, setPersonal] = useState({ durationMs: 1500000, remainingMs: 1500000, endsAt: null as number | null });
  const [personalMinutes, setPersonalMinutes] = useState('25');
  const [roomMinutes, setRoomMinutes] = useState('25');
  const [roomPreview, setRoomPreview] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const room = snapshot?.room;
  const accept = (state: RoomState) => setSnapshot({ room: state, receivedAt: performance.now() });

  useEffect(() => {
    const clock = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(clock);
  }, []);
  const auth = useOptionalAuth();
  const session = auth?.session;
  const isAuthorized = auth?.isAuthorized ?? false;
  useEffect(() => {
    if (!party) return;
    const s = io(endpoint, {
      autoConnect: false,
      auth: isAuthorized && session?.access_token ? { token: session.access_token } : undefined,
    });
    socket.current = s;
    let active = true;
    s.on('room:state', state => { if (active && s.connected) accept(state); });
    s.on('room:removed', (notice: { code: string; error: string }) => {
      if (notice.code !== membership.current?.code) return;
      generation.current++; sending.current = false; membership.current = null;
      setSnapshot(null); setPending(false); setClockChoice('personal');
      setError(notice.error); nameInput.current?.focus();
    });
    s.on('connect', async () => {
      if (!membership.current) { setConnected(true); setError(''); return; }
      setPending(true);
      try {
        const reply: Reply = await s.timeout(4000).emitWithAck('room:join', membership.current);
        if (!active) return;
        if (!reply.ok) { setSnapshot(null); setError(reply.error); }
        else { accept(reply.state); setSelfId(reply.selfId); setError(''); }
        setConnected(true);
      } catch { if (active) { setConnected(true); setSnapshot(null); setError('Could not confirm rejoining. Your draft is unchanged. Use Join room to retry.'); } }
      finally { if (active) setPending(false); }
    });
    s.on('disconnect', () => { generation.current++; sending.current = false; setConnected(false); setPending(false); });
    s.on('connect_error', () => { setConnected(false); setError('Party connection unavailable or sign-in expired. Retry connection; if your session expired, sign in again. Your draft stays here.'); });
    s.connect();
    return () => { active = false; s.removeAllListeners(); s.disconnect(); };
  }, [endpoint, party, session?.access_token]);
  const sharedClock = !!room && clockChoice === 'room';
  useEffect(() => { if (room) { setRoomMinutes(String(room.timer.durationMs / 60000)); setRoomPreview(null); } }, [room?.timer.durationMs, room?.timer.endsAt]);
  const minutes = sharedClock ? roomMinutes : personalMinutes;
  const setMinutes = sharedClock ? setRoomMinutes : setPersonalMinutes;
  const durationMinutes = /^\d{1,3}$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 180 ? Number(minutes) : null;

  async function send(event: string, data: object) {
    if (!socket.current?.connected || pending || sending.current || !connected) return;
    const currentSocket = socket.current;
    const attempt = generation.current;
    const stillCurrent = () => attempt === generation.current && socket.current === currentSocket;
    sending.current = true; setPending(true); setError('');
    try {
      const reply: Reply = await currentSocket.timeout(4000).emitWithAck(event, data);
      if (!stillCurrent()) return;
      if (!reply.ok) { setError(reply.error); return; }
      if (event === 'room:create' || event === 'room:join') { membership.current = { code: reply.state.code, name: name.trim() }; setClockChoice(null); }
      accept(reply.state); setSelfId(reply.selfId); return true;
    } catch { if (stillCurrent()) setError('The server did not confirm that action. Check the connection before retrying.'); }
    finally { if (stillCurrent()) { sending.current = false; setPending(false); } }
  }
  function goSolo() {
    soundGeneration.current++;
    chime.current?.cancel();
    generation.current++;
    sending.current = false;
    membership.current = null;
    socket.current?.disconnect();
    setSnapshot(null); setConnected(false); setPending(false); setError('');
    setParty(false); setClockChoice('personal');
  }
  const disabled = !connected || pending;
  const timerDisabled = (sharedClock && disabled) || (!!room && clockChoice === null);
  const timer = sharedClock ? room!.timer : personal;
  const remaining = Math.max(0, timer.endsAt === null ? timer.remainingMs : timer.endsAt - (sharedClock ? room!.serverNow + performance.now() - snapshot!.receivedAt : performance.now()));
  const previewRemaining = sharedClock && timer.endsAt === null && timer.remainingMs === timer.durationMs && roomPreview !== null ? roomPreview : remaining;
  const seconds = Math.ceil(previewRemaining / 1000);
  const clockText = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const running = timer?.endsAt !== null && remaining > 0 && !!timer;
  const fresh = !!timer && timer.endsAt === null && timer.remainingMs === timer.durationMs;
  function editMinutes(value: string) {
    if (!fresh || timerDisabled) return;
    setMinutes(value);
    if (!/^\d{1,3}$/.test(value) || Number(value)<1 || Number(value)>180) return;
    const ms=Number(value)*60000;
    if (sharedClock) setRoomPreview(ms);
    else setPersonal({durationMs:ms,remainingMs:ms,endsAt:null});
  }
  const shared = room?.participants.find(p => p.id === selfId)?.intention;
  function control(action: 'start' | 'pause' | 'reset') {
    if (timerDisabled || (action === 'start' && (running || remaining <= 0 || (fresh && durationMinutes === null)))) return;
    if (action === 'reset') { sessionRef.current = null; recordedRef.current = null; setCompletion(null); setStorageError(''); }
    if (action === 'start' && fresh) { sessionRef.current = { id: crypto.randomUUID(), plannedMs: durationMinutes! * 60000 }; recordedRef.current = null; setCompletion(null); setStorageError(''); }
    const soundAttempt = ++soundGeneration.current;
    const sound = action === 'start' && fresh && chimeAllowed.current;
    if (sound) { setSoundMessage(''); void chime.current?.prepare(); }
    else chime.current?.cancel();
    if (sharedClock) {
      void send('timer:control', action === 'start' && fresh ? { action, durationMinutes } : { action }).then(ok => {
        if (soundAttempt !== soundGeneration.current) return;
        if (ok && sound && chimeAllowed.current) void chime.current?.play(lockIn ? 'locked' : 'normal');
        else chime.current?.cancel();
      }); return;
    }
    setPersonal(previous => action === 'reset' ? { ...previous, remainingMs: previous.durationMs, endsAt: null } : action === 'pause' ? { ...previous, remainingMs: previous.endsAt === null ? previous.remainingMs : Math.max(0, previous.endsAt - performance.now()), endsAt: null } : { durationMs: fresh ? durationMinutes! * 60000 : previous.durationMs, remainingMs: fresh ? durationMinutes! * 60000 : remaining, endsAt: performance.now() + (fresh ? durationMinutes! * 60000 : remaining) });
    if (sound) void chime.current?.play(lockIn ? 'locked' : 'normal');
  }
  // tick projects independent private deadlines and authoritative room snapshots.
  void tick;
  // Completion opens only when a started cycle actually reaches zero.
  useEffect(() => {
    if (remaining !== 0 || !sessionRef.current) return;
    const session = sessionRef.current;
    if (recordedRef.current === session.id) return;
    recordedRef.current = session.id;
    const counted = countPlanSteps();
    const record: SessionRecord = {
      id: session.id,
      completedAt: new Date().toISOString(),
      focusedMs: session.plannedMs,
      plannedMs: session.plannedMs,
      stepsDone: counted.done,
      stepsTotal: counted.total,
      rating: null,
      focusRating: null
    };
    const first = !creatorNoteSeen(storage);
    const saved = saveSession(record, storage);
    setCompletionFirst(first);
    setStorageError(saved.ok ? '' : saved.error ?? 'The session could not be saved.');
    setCompletion(record);
    if (saved.ok) markCreatorNoteSeen(storage);
  }, [remaining]);

  return <CopyContext.Provider value={c}><div className={`room-backdrop${lockIn ? ' lock-in-mode' : ''}`} style={lockIn ? atmosphereStyle(atmosphere) : { background }}><a className="skip-link" href="#main">Skip to content</a>{lockIn && <LockedAtmosphere selected={atmosphere} motion={atmosphereMotion} />}{flowerEffect !== 'none' && <Flowers effect={flowerEffect} />}<div className="app-shell">
    <header className="masthead"><button className="wordmark" onClick={tapBrand}>{c('brand', 'study room')}<span className="wordmark-dot" aria-hidden="true">.</span></button><span className="connection" role="status"><i aria-hidden="true" className={connected ? 'live' : ''} />{!party ? 'Solo · private in this tab' : connected ? (auth?.config?.required ? 'Party connected · signed in' : 'Party connected · local demo') : 'Disconnected · shared controls unavailable'}</span></header>
    <main id="main" tabIndex={-1}>
      <HowStudyRoomWorks />
      <div className="page-heading"><div><p className="eyebrow">{c('heroEyebrow', 'A LITTLE SPACE TO BEGIN')}</p><h1>{c('heroTitle', 'One thing at a time.')}</h1></div>{room && <div className="invite"><span>Invite a study partner</span><strong aria-label="Room code">{room.code}</strong><button onClick={async () => { try { await navigator.clipboard.writeText(roomInvite(room.code)); setInviteMessage('Invite link copied.'); } catch { setInviteMessage('Copy unavailable. Select the link below.'); } }}>Copy link</button><input aria-label="Room invite link" readOnly value={roomInvite(room.code)} /><small>{loopbackInvite() ? `Loopback origin ${window.location.origin}: this link only works on the same device, not on a friend’s device. A public HTTPS website with sign-in configured is required for remote friends.` : `Website origin ${window.location.origin}: friends need this exact website to be reachable. Sign in if required, enter your name, then explicitly join. Reachability is not checked here.`}</small><span role="status">{inviteMessage}</span></div>}</div>
      <p className="demo-note">{auth?.config?.required ? 'Signed in · Private device data is separated by account. Rooms reset on server restart.' : 'Local demo · Room codes are not authentication. Don’t enter sensitive content. Rooms reset on server restart.'}</p>
      <div className="session-tools"><nav className="mode-switch" aria-label="Session mode"><button aria-pressed={!party} onClick={goSolo}>{c('modeSolo', 'Solo')}</button><button aria-pressed={party} onClick={() => setParty(true)}>{c('modeParty', 'Party')}</button></nav><Appearance onChange={setBackground} onEffectChange={setFlowerEffect} lockedPicker={lockIn ? <><AtmospherePicker selected={atmosphere} onSelect={id => chooseAtmosphere(id)} motion={atmosphereMotion} onMotion={motion => chooseAtmosphere(atmosphere, motion)} />{atmosphereStorageError && <p className="quiet-note" role="status">{atmosphereStorageError}</p>}</> : undefined} /></div>
      <Music lockIn={lockIn} activation={musicActivation} />
      <FocusSetup />
      {lockIn && <aside className="lock-in-panel" aria-label="Lock In Mode">
        <div><p className="eyebrow">LOCKED IN</p><strong>Nothing else, for now.</strong></div>
        <button onClick={exitLockIn}>Exit Lock In Mode</button>
      </aside>}
      {new URL(window.location.href).searchParams.has('room') && !invited && <p role="alert" className="error">Invalid invite: use exactly six uppercase letters or digits. Nothing was joined.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {party && !room && <details open className="optional-panel party-lobby"><summary>Create or join a party</summary>
        <p className="quiet-note">A shared table, not a shared private notebook. Everyone in the room can operate its clock; you choose whether to join that cycle.</p>
        {invited && <p className="quiet-note">Invite {invited}: enter your name and click Join room. {loopbackInvite() ? 'This loopback link only works on the same device.' : 'Sign-in does not join automatically.'}</p>}
        <form className="party-entry-form" onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault(); }} onSubmit={e => { e.preventDefault(); if (/^[A-Z0-9]{6}$/.test(code)) void send('room:join', { name, code }); else setError('Enter exactly six uppercase letters or digits. The code is never changed automatically.'); }}>
          <label htmlFor={`${uid}-name`}>Your name<input ref={nameInput} id={`${uid}-name`} value={name} onChange={e => setName(e.target.value)} maxLength={32} required autoComplete="off" placeholder="A name for this session" /></label>
          {!invited && <button className="primary" disabled={disabled} type="button" onClick={() => void send('room:create', { name })}>Create room</button>}
          <label htmlFor={`${uid}-code`}>Invite code<input id={`${uid}-code`} value={code} readOnly={!!invited} onChange={e => setCode(e.target.value)} maxLength={6} autoComplete="off" placeholder="6-character code" /></label>
          <button type="submit" disabled={disabled}>Join room</button>
        </form>
        <p className="quiet-note">Enter explicitly joins the entered code. To create instead, choose Create room. Neither starts a timer. Codes are case-sensitive. Private work stays in this tab.</p>
        {invited && error && <button disabled={disabled} onClick={() => void send('room:create', { name })}>Create a different room</button>}
      </details>}
      <div className={`session-grid ${!room ? 'solo-grid' : ''}`}>
        {room && <section className="clock-choice" aria-label="Choose your clock"><p>{clockChoice === null ? 'Choose a clock before using timer controls.' : 'Your personal clock and the room cycle stay separate.'} Switching never resets either clock. A running personal clock continues independently.</p><div><button aria-pressed={clockChoice === 'personal'} onClick={() => setClockChoice('personal')}>Keep personal clock</button><button aria-pressed={clockChoice === 'room'} onClick={() => setClockChoice('room')}>Join room cycle</button></div></section>}
        <section className="focus-surface" aria-labelledby={`${uid}-focus-title`}><div className="focus-top"><h2 id={`${uid}-focus-title`}>{sharedClock ? c('focusTitleShared', 'Shared focus') : c('focusTitlePersonal', 'Personal focus')}</h2><span role="status" aria-live="polite">{running ? c('statusRunning', 'In the flow') : remaining === 0 ? c('statusComplete', 'Session complete') : fresh ? c('statusReady', 'Ready when you are') : c('statusPaused', 'A moment to pause')}</span></div><div className="timer-area"><p className="eyebrow">{running ? c('focusEyebrowRunning', 'JUST THIS, FOR NOW') : c('focusEyebrowIdle', 'A LITTLE TIME, WELL SPENT')}</p><div role="timer" aria-label="Focus time remaining" aria-live="off" className="timer">{clockText}</div><p className="timer-caption">{remaining === 0 ? c('captionComplete', 'Take a breath. You made space for your work.') : sharedClock ? 'A shared rhythm. Your own work.' : c('captionIdle', 'A little space for your own next step.')}</p></div><div className="timer-controls"><div className="duration-field"><label htmlFor={`${uid}-duration`}>{c('durationLabel', 'Focus length')}</label><input id={`${uid}-duration`} type="number" inputMode="numeric" min="1" max="180" step="1" value={minutes} disabled={timerDisabled || !fresh} aria-invalid={durationMinutes === null} aria-describedby={`${uid}-duration-help${durationMinutes === null ? ` ${uid}-duration-error` : ''}`} onChange={e => editMinutes(e.target.value)} /><small id={`${uid}-duration-help`}>Minutes · 1–180. Reset to edit an in-progress cycle. {sharedClock && 'Your preview is private; only Start focus sends the chosen duration to peers.'}</small>{durationMinutes === null && <p id={`${uid}-duration-error`} role="alert" className="duration-error">Enter a whole number from 1 to 180 minutes.</p>}</div><div className="timer-buttons"><button className="primary" data-action={running ? 'pause' : fresh ? 'start' : 'resume'} disabled={timerDisabled || (!running && remaining === 0) || (fresh && durationMinutes === null)} onClick={() => control(running ? 'pause' : 'start')}>{running ? c('pauseFocus', 'Pause focus') : fresh ? c('startFocus', 'Start focus') : c('resumeFocus', 'Resume focus')}</button><button data-action="reset" disabled={timerDisabled} onClick={() => control('reset')}>{c('resetTimer', 'Reset timer')}</button></div></div><p className="quiet-note">{sharedClock ? 'Timer controls affect everyone in this room.' : 'Your own clock. No room required.'}{sharedClock && !connected && ' Display is a last-known estimate until reconnected.'}</p></section>
        {room && <aside className="people-surface" aria-labelledby={`${uid}-people-title`}><p className="eyebrow">GOOD COMPANY, QUIETLY</p><h2 id={`${uid}-people-title`}>At the table <span>({room.participants.length})</span></h2><p className="quiet-note" role="status">{room.locked ? 'Admission locked · existing participants stay.' : 'Admission open.'} {room.participants.length}/{room.maxParticipants ?? 16} seats. {room.hostId ? (room.hostId === selfId ? 'You are the host.' : 'Only the host can lock admission or remove people.') : 'Host offline · no automatic promotion. Everyone still at the table can operate the shared timer.'}</p>{room.hostId === selfId && <button disabled={disabled} onClick={() => void send('room:lock', { locked: !room.locked })}>{room.locked ? 'Unlock admission' : 'Lock admission'}</button>}<ul className="people">{room.participants.map(p => <li key={p.id}><span className="avatar" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span><div><strong>{p.name}</strong>{p.id === selfId && <small> · you</small>}<p>{p.intention ?? 'Here to focus'}</p>{p.id === room.hostId && <small>Host</small>}{room.hostId === selfId && p.id !== selfId && <button disabled={disabled} aria-label={`Remove ${p.name}`} onClick={() => void send('room:remove', { participantId: p.id })}>Remove</button>}</div></li>)}</ul><p className="quiet-note">Presence reflects the last server update; disconnected people are removed when the server detects the loss. Rejoining creates a new presence; sharing is never restored automatically. A lock blocks new connections, including guests rejoining after disconnect. Removal is not a ban; lock admission to prevent re-entry. {auth?.config?.required ? 'Host ownership belongs to the verified creator account, including after reconnect; it is never transferred automatically.' : 'Local demo: host permissions belong only to the original anonymous socket. Disconnecting or leaving loses those controls, with no promotion; create a new room if needed.'}</p></aside>}
        <section className="intention-surface" aria-labelledby={`${uid}-intention-title`}><div><p className="eyebrow">{c('intentionEyebrow', 'ONE SMALL COMMITMENT')}</p><h2 id={`${uid}-intention-title`}>{c('intentionTitle', 'What are you making space for?')}</h2><p id={`${uid}-privacy-help`}>Your draft stays in this tab, not on the server. Only “Share with room” sends it to others. Editing a shared draft doesn’t update its shared version.</p></div><div><label htmlFor={`${uid}-intention`}>{c('intentionLabel', 'Your session intention')}</label><textarea id={`${uid}-intention`} aria-describedby={`${uid}-privacy-help ${uid}-intention-help${intentionError ? ` ${uid}-intention-error` : ''}`} aria-invalid={!!intentionError} maxLength={240} rows={3} value={draft} onChange={e => { setDraft(e.target.value); setIntentionError(''); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !composing.current && e.keyCode !== 229) { e.preventDefault(); planSession(); } }} placeholder={c('intentionPlaceholder', 'For this session, I’ll…')} /><p className="quiet-note" id={`${uid}-intention-help`}>Enter to open optional planning help · Shift+Enter for a new line. Focus starts only with Start focus.</p>{intentionError && <p className="error" role="alert" id={`${uid}-intention-error`}>{intentionError}</p>}<button onClick={planSession}>{c('planSession', 'Plan session')}</button><div className="intention-actions"><span className="sharing-state">{shared ? c('sharedState', 'A version is shared with the room') : c('privateState', 'Private · only in this tab')}</span>{room && <button disabled={disabled || !draft.trim()} onClick={() => void send('intention:share', { text: draft })}>{shared ? c('updateIntention', 'Update shared intention') : c('shareIntention', 'Share with room')}</button>}{shared && <button disabled={disabled} onClick={() => void send('intention:withdraw', {})}>{c('withdrawIntention', 'Withdraw sharing')}</button>}</div><p className="quiet-note">Withdrawal removes your shared version, not anyone else’s. It cannot erase what others have already seen.</p></div></section>
      </div>
      <GoalNotes commitment={draft} onChoose={setDraft}><SessionIntention submitted={submitted} availableMinutes={fresh ? durationMinutes : timer.durationMs / 60000} onDismiss={() => setSubmitted(null)} /></GoalNotes>
      <section className="chime-controls" aria-label="Focus chime controls">
        <label className="storage-option"><input type="checkbox" checked={chimeEnabled} onChange={e => { soundGeneration.current++; chimeAllowed.current = e.target.checked; setChimeEnabled(e.target.checked); if (!e.target.checked) chime.current?.cancel(); }} />{c('chimeEnable', 'Enable focus chime')}</label>
        <button disabled={!chimeEnabled} onClick={() => { soundGeneration.current++; setSoundMessage(''); void chime.current?.prepare(); void chime.current?.play(lockIn ? 'locked' : 'normal'); }}>Preview chime</button>
        <button onClick={() => { soundGeneration.current++; chime.current?.cancel(); }}>Stop chime</button>
        <p className="quiet-note">Quiet local cue on your own fresh Start only. Resume is silent. Fades to silence, not into Spotify; music uses its own manual Play control.</p>
        {soundMessage && <p role="status" className="quiet-note">{soundMessage}</p>}
      </section>
      <PrivateReview commitment={draft} onFinish={() => setPersonal(previous => ({ ...previous, remainingMs: previous.endsAt === null ? previous.remainingMs : Math.max(0, previous.endsAt - performance.now()), endsAt: null }))} onNew={() => setPersonal(previous => ({ ...previous, remainingMs: previous.durationMs, endsAt: null }))} />
      {party && !connected && <button className="reconnect" onClick={() => socket.current?.connect()}>Retry party connection</button>}
    </main><footer>{auth?.config?.required ? 'Signed-in StudyRoom. ' : 'Local demo. '}Your own work, with room for company. Optional Spotify playback contacts Spotify.</footer>
  </div><SessionComplete open={!!completion} record={completion} locked={lockIn} firstVisit={completionFirst} storageError={storageError} onClose={() => setCompletion(null)} /></div></CopyContext.Provider>;
}
