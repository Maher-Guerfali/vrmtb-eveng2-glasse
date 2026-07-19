import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardStore } from './boardSync';
import type { HudBoardState } from './protocol';

function board(activeCaseId: string): HudBoardState {
  return {
    meetingTitle: 'Test board',
    activeCaseId,
    cases: [
      { caseId: 'c1', label: 'c1', status: 'active' },
      { caseId: 'c2', label: 'c2', status: 'pending' },
    ],
  };
}

describe('BoardStore per-case timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts the clock on the first board and keeps it across same-case refreshes', () => {
    const store = new BoardStore();
    vi.setSystemTime(1_000);
    store.setBoard(board('c1'));
    expect(store.activeCaseChangedAt).toBe(1_000);

    // A full-state session refresh with the same active case must not reset it.
    vi.setSystemTime(61_000);
    store.setBoard(board('c1'));
    expect(store.activeCaseChangedAt).toBe(1_000);
  });

  it('resets only on a real case switch, from either source', () => {
    const store = new BoardStore();
    vi.setSystemTime(1_000);
    store.setBoard(board('c1'));

    vi.setSystemTime(120_000);
    store.setBoard(board('c2')); // remote refresh switched the case
    expect(store.activeCaseChangedAt).toBe(120_000);

    vi.setSystemTime(180_000);
    store.selectActiveCase('c1'); // local/wearer switch
    expect(store.activeCaseChangedAt).toBe(180_000);

    vi.setSystemTime(240_000);
    store.selectActiveCase('c1'); // re-selecting the same case is a no-op
    expect(store.activeCaseChangedAt).toBe(180_000);
  });

  it('ignores selections of unknown cases', () => {
    const store = new BoardStore();
    vi.setSystemTime(1_000);
    store.setBoard(board('c1'));
    store.selectActiveCase('nope');
    expect(store.board?.activeCaseId).toBe('c1');
    expect(store.activeCaseChangedAt).toBe(1_000);
  });
});
