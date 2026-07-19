// Internal HUD state shape, populated from TWO possible sources:
//   - MockSync: a scripted local demo, invented data (mockSync.ts)
//   - LiveKitSync: the REAL vr-mtb-web backend and room (liveKitSync.ts)
//
// This file used to define a speculative "vrmtb.hud" LiveKit topic that
// vr-mtb-web would need to newly implement. It doesn't need to: the real
// backend already exposes everything a HUD needs -
//   GET  /api/session                       -> full session + patient data
//   PATCH /api/session/active-patient        -> set + broadcast active patient
//   LiveKit data channel topics 'activePatient' / 'command'
//     (see vr-mtb-web/app/src/realtime/types.ts RoomDataMessage, and
//     app/src/commands/registry.ts for the command vocabulary) -
// already used by the dashboard, its Web Speech voice commands, and its MCP
// server. liveKitSync.ts speaks that real contract directly; there is no
// glasses-specific topic to add to vr-mtb-web.
//
// IMPORTANT: GET /api/session returns FULL patient records, including
// `name` and `dob` - fields vr-mtb-web's own schema explicitly marks as PHI
// that must never cross a bridge/presence/data-channel message. The glasses
// are a personal wearable with a different loss/glance-over-shoulder risk
// profile than a locked-down clinical workstation, so this app keeps a
// stricter promise than the dashboard's own minimum: liveKitSync.ts's
// mapping from the real schema to HudPatientSummary below is the ONLY place
// allowed to see `name`/`dob`, and it must never copy them into a
// HudPatientSummary field. See COMPLIANCE.md §2.

export interface HudCaseRef {
  caseId: string;
  /** Opaque ID-based label for the list row - never a name (see above). */
  label: string;
  status: 'pending' | 'active' | 'done';
}

export interface HudBoardState {
  meetingTitle: string;
  startedAtIso?: string;
  /** Not part of the real vr-mtb-web session schema - stays undefined when driven by LiveKitSync. */
  presenter?: string;
  /** Not part of the real vr-mtb-web session schema - stays undefined when driven by LiveKitSync. */
  recording?: boolean;
  activeCaseId?: string;
  cases: HudCaseRef[];
}

/**
 * Curated, PHI-minimized patient fields for the HUD. Generalized to
 * vr-mtb-web's actual (disease-agnostic) patient schema
 * (app/src/domain/schema.ts) rather than the breast-cancer-specific
 * TNM/receptor fields this file originally invented before that schema was
 * available to read - MockSync's demo data uses this same shape now too, so
 * there is exactly one patient-summary model end to end.
 */
export interface HudPatientSummary {
  caseId: string;
  /** Primary diagnosis - the schema's own "hero line", not itself PHI. */
  dxLine: string;
  /** Up to a few "code name (onset)" lines, e.g. "C50.9 Breast ca (2026)". */
  conditionLines: string[];
  /** Only labs with a flag set (HIGH/LOW/POS/DET) - the abnormal ones matter on a glance. */
  abnormalLabLines: string[];
  /** Short, safety-critical - shown when present. */
  allergyLine?: string;
  /** Local-only convenience field; not part of the real schema. */
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
