// In-memory store of the current board state (nothing is ever persisted -
// PHI evaporates with the page, see docs/COMPLIANCE.md) plus the interface
// every sync source implements (mock script today, LiveKit in production).

import type {
  HudBoardState,
  HudEnvelope,
  HudNotification,
  HudPatientSummary,
} from './protocol';

export class BoardStore {
  board?: HudBoardState;
  private patients = new Map<string, HudPatientSummary>();
  lastMessageAt = 0;

  private changeCbs = new Set<() => void>();
  private notifyCbs = new Set<(n: HudNotification) => void>();

  apply(envelope: HudEnvelope): void {
    this.lastMessageAt = Date.now();
    switch (envelope.type) {
      case 'board':
        this.board = envelope.payload;
        break;
      case 'patient':
        this.patients.set(envelope.payload.caseId, envelope.payload);
        break;
      case 'notify':
        this.notifyCbs.forEach((cb) => cb(envelope.payload));
        return; // notifications are transient, not state
      case 'decision':
        // P3: surface on the Decide card. Stored nowhere yet.
        return;
    }
    this.changeCbs.forEach((cb) => cb());
  }

  activePatient(): HudPatientSummary | undefined {
    const id = this.board?.activeCaseId;
    return id ? this.patients.get(id) : undefined;
  }

  selectActiveCase(caseId: string): void {
    if (!this.board?.cases.some((item) => item.caseId === caseId)) return;
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

export interface BoardSync {
  readonly label: string;
  start(store: BoardStore): Promise<void>;
  stop(): Promise<void>;
}
