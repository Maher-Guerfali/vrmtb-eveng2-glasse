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

    // Exactly 5 body lines: identity, staging, receptors, history, question.
    // History collapses to one line; the question wins the last slot because
    // it is what the board actually needs from the wearer.
    return {
      title: `Patient · ${p.pseudonym}`,
      lines: [
        p.ageLine,
        p.stagingLine,
        p.receptorLine,
        p.historyLines.join(' · '),
        p.boardQuestion ? `? ${p.boardQuestion}` : '',
      ],
      footer: '‹ › cards · ⨯⨯ = board',
    };
  }
}
