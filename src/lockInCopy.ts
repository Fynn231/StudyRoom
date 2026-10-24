import { createContext, useContext } from 'react';

export type Copy = (key: string, normal: string) => string;

// Centralized LOCKED IN language. Normal mode always falls back to the caller's
// own string, so existing copy is untouched when the secret mode is off.
const LOCKED: Record<string, string> = {
  brand: 'LOCKED IN',
  heroEyebrow: 'FOCUS PROTOCOL / ACTIVE',
  heroTitle: 'Eliminate distractions.',
  modeSolo: 'Solo',
  modeParty: 'Unit',
  focusTitlePersonal: 'Primary Directive',
  focusTitleShared: 'Shared Directive',
  focusEyebrowRunning: 'PROTOCOL ACTIVE',
  focusEyebrowIdle: 'PROTOCOL STANDBY',
  statusRunning: 'Protocol active',
  statusComplete: 'Mission complete',
  statusReady: 'Awaiting initiation',
  statusPaused: 'Protocol suspended',
  startFocus: 'Initiate Focus',
  pauseFocus: 'Suspend Focus',
  resumeFocus: 'Resume Focus',
  resetTimer: 'Reset Cycle',
  durationLabel: 'Cycle length',
  captionRunning: 'One objective. One session. Finish what you started.',
  captionComplete: 'Mission complete. Record the next directive.',
  captionIdle: 'A single directive, held in view.',
  intentionEyebrow: 'PRIMARY OBJECTIVE',
  intentionTitle: 'Current directive',
  intentionLabel: 'Primary objective',
  intentionPlaceholder: 'For this cycle, I will…',
  planSession: 'Define protocol',
  skip: 'Skip',
  shareIntention: 'Broadcast to unit',
  updateIntention: 'Update broadcast',
  withdrawIntention: 'Withdraw broadcast',
  sharedState: 'A version is broadcast to your unit',
  privateState: 'Private · this terminal only',
  helpSummary: 'Protocol brief',
  goalsSummary: 'Intel / notes',
  plansSummary: 'Archived missions',
  musicSummary: 'Soundtrack',
  appearanceSummary: 'Atmosphere',
  chimeEnable: 'Enable cycle chime',
  chimePreview: 'Preview chime',
  chimeStop: 'Stop chime',
  reflectionTitle: 'Recovery Interval',
  focusSetupSummary: 'Protect your focus',
};

const identity: Copy = (_key, normal) => normal;

export const CopyContext = createContext<Copy>(identity);
export const normalCopy = identity;
export const lockedCopy: Copy = (key, normal) => LOCKED[key] ?? normal;
export function useCopy(): Copy {
  return useContext(CopyContext);
}
