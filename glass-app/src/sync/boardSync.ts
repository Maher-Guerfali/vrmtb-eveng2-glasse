// In-memory store of the current board state (nothing is ever persisted -
// PHI evaporates with the page, see docs/COMPLIANCE.md) plus the interface
// every sync source implements (MockSync's scripted demo, or LiveKitSync
// against the real vr-mtb-web backend/room).

import type {
  HudBoardState,
  HudNotification,
  HudPatientSummary,
} from './protocol';

export class BoardStore {
  board?: HudBoardState;
  private patients = new Map<string, HudPatientSummary>();
  lastMessageAt = 0;
  /** When the active case last changed - drives the per-case elapsed timer. */
  activeCaseChangedAt = 0;

  private changeCbs = new Set<() => void>();
  private notifyCbs = new Set<(n: HudNotification) => void>();

  setBoard(board: HudBoardState): void {
    this.lastMessageAt = Date.now();
    // A full-state refresh with the same active case must not reset the
    // per-case timer; only a real case switch does.
    if (board.activeCaseId !== this.board?.activeCaseId) this.activeCaseChangedAt = Date.now();
    this.board = board;
    this.changeCbs.forEach((cb) => cb());
  }

  setPatient(patient: HudPatientSummary): void {
    this.lastMessageAt = Date.now();
    this.patients.set(patient.caseId, patient);
    this.changeCbs.forEach((cb) => cb());
  }

  notify(n: HudNotification): void {
    this.notifyCbs.forEach((cb) => cb(n));
  }

  activePatient(): HudPatientSummary | undefined {
    const id = this.board?.activeCaseId;
    return id ? this.patients.get(id) : undefined;
  }

  selectActiveCase(caseId: string): void {
    if (!this.board?.cases.some((item) => item.caseId === caseId)) return;
    if (caseId !== this.board.activeCaseId) this.activeCaseChangedAt = Date.now();
    this.board = { ...this.board, activeCaseId: caseId };
    this.changeCbs.forEach((cb) => cb());
  }

  /** True when no sync message arrived for a while - cards show a stale marker. */
  isStale(maxAgeMs = 30_000): boolean {
    return this.lastMessageAt > 0 && Date.now() - this.lastMessageAt > maxAgeMs;
  }

  clear(): void {
    this.board = undefined;
    this.patients.clear();
    this.changeCbs.forEach((cb) => cb());
  }

  onChange(cb: () => void): () => void {
    this.changeCbs.add(cb);
    return () => this.changeCbs.delete(cb);
  }

  onNotify(cb: (n: HudNotification) => void): () => void {
    this.notifyCbs.add(cb);
    return () => this.notifyCbs.delete(cb);
  }
}

/** Live-voice snapshot for the Talk card - distinct from dictation/STT, this
 *  is actual two-way WebRTC audio other room participants can hear. */
export interface TalkStatus {
  connected: boolean;
  micPublished: boolean;
  /** Including the local participant. */
  participantCount: number;
}

export interface BoardSync {
  readonly label: string;
  start(store: BoardStore): Promise<void>;
  stop(): Promise<void>;
  /**
   * Push a wearer-initiated action back out (e.g. selecting a patient on the
   * glasses broadcasts the same 'selectPatient' command the dashboard sends,
   * so every connected client - including this one, echoed back - stays in
   * sync). Optional: MockSync has nothing to broadcast to.
   */
  sendCommand?(command: string, args?: Record<string, unknown>): void | Promise<void>;
  /**
   * Publish/unpublish the local device's live microphone into the room's
   * WebRTC audio, so other participants actually hear the wearer talk in
   * real time - separate from dictation (which only ever sends finished
   * text). Returns the resulting published state (false if it couldn't
   * start, e.g. mic permission denied or not connected). Optional: MockSync
   * has no room to publish into.
   */
  setMicPublished?(enabled: boolean): Promise<boolean>;
  /** Current live-voice snapshot; undefined where setMicPublished isn't supported. */
  getTalkStatus?(): TalkStatus;
}
