// Scripted fake tumor board for development and demos. All patient data
// below is INVENTED demo content - no real cases, ever, in this file.

import type { BoardStore, BoardSync } from './boardSync';
import type { HudBoardState, HudPatientSummary } from './protocol';

const CASES: { board: HudBoardState['cases'][number]; patient: HudPatientSummary }[] = [
  {
    board: { caseId: 'c1', label: 'p1 · invasive NST', status: 'pending' },
    patient: {
      caseId: 'c1',
      dxLine: 'Invasive breast carcinoma NST, left, cT2 cN1 M0',
      conditionLines: ['C50.9 Invasive carcinoma NST (2026)'],
      abnormalLabLines: ['Ki-67 35% POS'],
      boardQuestion: 'Neoadjuvant chemo vs. primary surgery?',
    },
  },
  {
    board: { caseId: 'c2', label: 'p2 · invasive lobular', status: 'pending' },
    patient: {
      caseId: 'c2',
      dxLine: 'Invasive lobular carcinoma, pT1c pN0 M0',
      conditionLines: ['C50.9 Invasive lobular carcinoma (2026)'],
      abnormalLabLines: [],
      allergyLine: 'Penicillin (SEVERE)',
      boardQuestion: 'Adjuvant endocrine only vs. add chemo?',
    },
  },
  {
    board: { caseId: 'c3', label: 'p3 · TNBC', status: 'pending' },
    patient: {
      caseId: 'c3',
      dxLine: 'Triple-negative breast cancer, cT1c cN0 M0, BRCA1+',
      conditionLines: ['C50.9 TNBC (2026)', 'Z15.01 BRCA1 carrier'],
      abnormalLabLines: ['Ki-67 60% POS'],
      boardQuestion: 'Pembrolizumab per KEYNOTE-522 schema?',
    },
  },
];

const NOTIFICATIONS = [
  'Dr. Weber (radiology) joined',
  'Recording started',
  '3D annotation added by radiology',
  'Note added by Dr. Huber (patho)',
];

/** Advances the fake board every stepMs: case switches, notifications. */
export class MockSync implements BoardSync {
  readonly label = 'mock board (demo data)';
  private timer: ReturnType<typeof setInterval> | undefined;
  private tick = 0;

  constructor(private stepMs?: number) {}

  async start(store: BoardStore): Promise<void> {
    const publish = () => {
      const activeIdx = Math.min(Math.floor(this.tick / 2), CASES.length - 1);
      store.setBoard({
        meetingTitle: 'Breast MTB · demo',
        startedAtIso: new Date(Date.now() - this.tick * (this.stepMs ?? 0)).toISOString(),
        presenter: 'Dr. Weber',
        recording: this.tick >= 1,
        activeCaseId: CASES[activeIdx].board.caseId,
        cases: CASES.map((c, i) => ({
          ...c.board,
          status: i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending',
        })),
      });
      // Full-state semantics: (re)send every patient so late joiners work,
      // exactly like a real reconnect against vr-mtb-web re-fetches /api/session.
      for (const c of CASES) store.setPatient(c.patient);
      const note = NOTIFICATIONS[this.tick % NOTIFICATIONS.length];
      if (this.tick > 0 && note) store.notify({ text: note });
      this.tick += 1;
    };

    publish();
    // Keep the board still by default; auto-advance exists only for an
    // explicit ?step=<seconds> recording/demo session.
    const stepMs = this.stepMs;
    if (stepMs && stepMs > 0) this.timer = setInterval(publish, stepMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }
}
