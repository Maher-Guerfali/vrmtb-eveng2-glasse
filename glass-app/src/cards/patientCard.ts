import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';
import type { Card } from './types';

// Renders ONLY the whitelisted HudPatientSummary fields (COMPLIANCE.md §2).
// If a field isn't in the protocol, it cannot appear on the HUD - that is the
// point of the narrow type, so never widen this card past the protocol.
export class PatientCard implements Card {
  readonly id = 'patient';

  /** Set by wearGuard: blank PHI while the glasses are off / in the case. */
  privacyBlanked = false;
  private detailPage = 0;

  nextDetail(delta: number): boolean {
    const next = Math.max(0, Math.min(1, this.detailPage + delta));
    const changed = next !== this.detailPage;
    this.detailPage = next;
    return changed;
  }

  resetDetail(): void { this.detailPage = 0; }

  render(store: BoardStore): CardContent {
    if (this.privacyBlanked) {
      return { title: 'Patient', lines: ['— HUD paused (glasses off) —'] };
    }

    const p = store.activePatient();
    if (!p) {
      return {
        title: 'Patient',
        lines: ['No active case yet.'],
        footer: '‹ › switch card',
      };
    }

    if (this.detailPage === 1) {
      return {
        title: `Patient · ${p.pseudonym} · history`,
        lines: [
          'HISTORY',
          ...p.historyLines,
          p.boardQuestion ? `BOARD Q  ${p.boardQuestion}` : '',
        ],
        footer: 'swipe=details · dbltap=list · tap=dictate',
      };
    }
    return {
      title: `Patient · ${p.pseudonym}`,
      lines: [
        `DEMOGRAPHICS  ${p.ageLine}`,
        `STAGING       ${p.stagingLine}`,
        `BIOMARKERS    ${p.receptorLine}`,
        '────────────────────────────',
        'Swipe for history and board question',
      ],
      footer: 'swipe = details · double tap = list · tap = dictate',
    };
  }
}
