import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';
import type { Card } from './types';

const FOOTER = 'swipe=details · dbltap=list · tap=dictate';

// Renders ONLY the whitelisted HudPatientSummary fields (COMPLIANCE.md §2).
// If a field isn't in the protocol, it cannot appear on the HUD - that is the
// point of the narrow type, so never widen this card past the protocol.
// The schema is disease-agnostic (dx/conditions/labs/allergies), matching
// vr-mtb-web's real patient schema rather than a breast-cancer-specific one.
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
      const lines = [
        'CONDITIONS',
        ...p.conditionLines,
        p.boardQuestion ? `BOARD Q  ${p.boardQuestion}` : '',
      ].filter(Boolean);
      return {
        title: `Patient · ${p.caseId} · conditions`,
        lines,
        footer: FOOTER,
      };
    }
    const lines = [
      p.dxLine,
      ...p.abnormalLabLines.map((l) => `LAB  ${l}`),
      p.allergyLine ? `ALLERGY  ${p.allergyLine}` : '',
      'Swipe for conditions and board question',
    ].filter(Boolean);
    return {
      title: `Patient · ${p.caseId}`,
      lines,
      footer: FOOTER,
    };
  }
}
