// Scripted fake tumor board for development and demos. All patient data
// below is INVENTED demo content - no real cases, ever, in this file.

import type { BoardStore, BoardSync } from './boardSync';
import type { HudBoardState, HudPatientSummary } from './protocol';

const CASES: { board: HudBoardState['cases'][number]; patient: HudPatientSummary }[] = [
  {
    board: { caseId: 'c1', label: 'MTB-2026-012 · A.M.', status: 'pending' },
    patient: {
      caseId: 'c1',
      pseudonym: 'MTB-2026-012 · A.M.',
      ageLine: '54 y · premenopausal',
      stagingLine: 'cT2 cN1 M0 · G3 · invasive NST',
      receptorLine: 'ER 90% · PR 10% · HER2 neg · Ki-67 35%',
      historyLines: ['Core biopsy 07/26 · left, 28 mm', 'No prior systemic therapy'],
      boardQuestion: 'Neoadjuvant chemo vs. primary surgery?',
    },
  },
  {
    board: { caseId: 'c2', label: 'MTB-2026-013 · R.S.', status: 'pending' },
    patient: {
      caseId: 'c2',
      pseudonym: 'MTB-2026-013 · R.S.',
      ageLine: '67 y · postmenopausal',
      stagingLine: 'pT1c pN0 M0 · G2 · invasive lobular',
      receptorLine: 'ER 100% · PR 80% · HER2 neg · Ki-67 12%',
      historyLines: ['s/p BET + SLNB 06/26', 'Oncotype DX pending'],
      boardQuestion: 'Adjuvant endocrine only vs. add chemo?',
    },
  },
  {
    board: { caseId: 'c3', label: 'MTB-2026-014 · K.B.', status: 'pending' },
    patient: {
      caseId: 'c3',
      pseudonym: 'MTB-2026-014 · K.B.',
      ageLine: '41 y · premenopausal · BRCA1+',
      stagingLine: 'cT1c cN0 M0 · G3 · TNBC',
      receptorLine: 'ER neg · PR neg · HER2 neg · Ki-67 60%',
      historyLines: ['MRI 07/26: unifocal, 14 mm', 'Genetic counseling done'],
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

  constructor(private stepMs = 12_000) {}

  async start(store: BoardStore): Promise<void> {
    const publish = () => {
      const activeIdx = Math.min(Math.floor(this.tick / 2), CASES.length - 1);
      store.apply({
        v: 1,
        type: 'board',
        payload: {
          meetingTitle: 'Breast MTB · demo',
          startedAtIso: new Date(Date.now() - this.tick * this.stepMs).toISOString(),
          presenter: 'Dr. Weber',
          recording: this.tick >= 1,
          activeCaseId: CASES[activeIdx].board.caseId,
          cases: CASES.map((c, i) => ({
            ...c.board,
            status: i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending',
          })),
        },
      });
      // Full-state semantics: (re)send every patient so late joiners work,
      // exactly like the real dashboard publisher will.
      for (const c of CASES) {
        store.apply({ v: 1, type: 'patient', payload: c.patient });
      }
      const note = NOTIFICATIONS[this.tick % NOTIFICATIONS.length];
      if (this.tick > 0 && note) {
        store.apply({ v: 1, type: 'notify', payload: { text: note } });
      }
      this.tick += 1;
    };

    publish();
    this.timer = setInterval(publish, this.stepMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }
}
