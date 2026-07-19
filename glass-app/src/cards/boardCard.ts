import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';
import type { Card } from './types';

function elapsed(startedAtIso?: string): string {
  if (!startedAtIso) return '';
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(startedAtIso)) / 60_000));
  return `${min} min`;
}

const MARKER = { active: '▶', done: '✓', pending: '·' } as const;

export class BoardCard implements Card {
  readonly id = 'board';

  render(store: BoardStore): CardContent {
    const b = store.board;
    if (!b) {
      return {
        title: 'Board',
        lines: ['Waiting for board data…'],
        footer: '‹ › switch card',
      };
    }

    // 5-line budget: up to 4 case rows + 1 status row. Boards with more cases
    // show a window centered on the active case.
    const activeIdx = Math.max(0, b.cases.findIndex((c) => c.caseId === b.activeCaseId));
    const windowStart = Math.max(0, Math.min(activeIdx - 1, b.cases.length - 4));
    const rows = b.cases
      .slice(windowStart, windowStart + 4)
      .map((c) => `${MARKER[c.status]} ${c.label}`);

    // Boards chronically overrun; a silent per-case clock is discipline
    // nobody else in the room notices.
    const caseMin = store.activeCaseChangedAt
      ? Math.floor((Date.now() - store.activeCaseChangedAt) / 60_000)
      : 0;
    const status = [
      b.presenter ? `Presenting: ${b.presenter}` : '',
      elapsed(b.startedAtIso),
      store.activeCaseChangedAt ? `case ${caseMin}m` : '',
      b.recording ? '⏺ rec' : '',
      store.isStale() ? '⚠ stale' : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      title: b.meetingTitle,
      lines: [...rows, status],
      footer: 'dbltap=menu',
    };
  }
}
