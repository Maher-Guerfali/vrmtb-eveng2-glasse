import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';
import type { Card } from './types';

/** A local cursor: browsing the list must not change the open patient. */
export class PatientListCard implements Card {
  readonly id = 'patient-list';
  private selectedCaseId?: string;

  move(store: BoardStore, delta: number): void {
    const cases = store.board?.cases ?? [];
    if (!cases.length) return;
    const current = Math.max(0, cases.findIndex((item) => item.caseId === this.selectedCaseId));
    const next = (current + delta + cases.length) % cases.length;
    this.selectedCaseId = cases[next].caseId;
  }

  selected(store: BoardStore): string | undefined {
    const cases = store.board?.cases ?? [];
    if (!this.selectedCaseId || !cases.some((item) => item.caseId === this.selectedCaseId)) {
      this.selectedCaseId = store.board?.activeCaseId ?? cases[0]?.caseId;
    }
    return this.selectedCaseId;
  }

  render(store: BoardStore): CardContent {
    const cases = store.board?.cases ?? [];
    const selected = this.selected(store);
    return {
      title: 'Patient list',
      lines: cases.length
        ? cases.map((item) => `${item.caseId === selected ? '▶' : '·'} ${item.label}`)
        : ['Waiting for patient data…'],
      footer: 'swipe=select · tap=open · dbltap=menu',
    };
  }
}
