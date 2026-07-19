// Wire protocol of the "vrmtb.hud" LiveKit data topic - the curated, tiny
// projection of board state that the dashboard (vr-mtb-web) publishes for
// wearables. Copy-shareable with the dashboard codebase; keep in sync there.
//
// Rules (see docs/ARCHITECTURE.md §3):
// - publisher curates & pseudonymizes; the glasses render only
// - full-state messages, not diffs (late joiners are correct after one message)
// - versioned envelope

export const HUD_TOPIC = 'vrmtb.hud';
export const ANNOTATION_TOPIC = 'vrmtb.annotation'; // existing Unity/dashboard topic

export interface HudCaseRef {
  caseId: string;
  /** Pseudonymized label, e.g. "MTB-2026-014 · B.K." - never a full name. */
  label: string;
  status: 'pending' | 'active' | 'done';
}

export interface HudBoardState {
  meetingTitle: string;
  startedAtIso?: string;
  presenter?: string;
  recording?: boolean;
  activeCaseId?: string;
  cases: HudCaseRef[];
}

/** Snapshot fields only - the whitelist is a compliance boundary (COMPLIANCE.md §2). */
export interface HudPatientSummary {
  caseId: string;
  pseudonym: string;
  /** e.g. "54 y, premenopausal" */
  ageLine: string;
  /** e.g. "cT2 cN1 M0 · G3 · invasive NST" */
  stagingLine: string;
  /** e.g. "ER 90% · PR 10% · HER2 neg · Ki-67 35%" */
  receptorLine: string;
  historyLines: string[];
  boardQuestion?: string;
}

export interface HudNotification {
  text: string;
  tsIso?: string;
}

export interface HudDecisionPrompt {
  caseId: string;
  proposal: string;
}

export type HudEnvelope =
  | { v: 1; type: 'board'; payload: HudBoardState }
  | { v: 1; type: 'patient'; payload: HudPatientSummary }
  | { v: 1; type: 'notify'; payload: HudNotification }
  | { v: 1; type: 'decision'; payload: HudDecisionPrompt };

export function parseHudEnvelope(raw: unknown): HudEnvelope | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1 || typeof obj.type !== 'string' || typeof obj.payload !== 'object') return null;
  if (!['board', 'patient', 'notify', 'decision'].includes(obj.type)) return null;
  return raw as HudEnvelope;
}
