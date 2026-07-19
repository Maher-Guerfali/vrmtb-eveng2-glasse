import { describe, expect, it } from 'vitest';

import { BoardStore } from '../sync/boardSync';
import { MAX_LINE_CHARS } from '../hud/layout';
import { CaptionsCard } from './captionsCard';

const store = new BoardStore();

describe('CaptionsCard', () => {
  it('hints at voice control when idle and empty', () => {
    const card = new CaptionsCard();
    expect(card.render(store).lines[0]).toContain('Voice control');
    card.listening = true;
    expect(card.render(store).lines[0]).toBe('Listening…');
  });

  it('wraps words into HUD-width lines and shows the newest five', () => {
    const card = new CaptionsCard();
    card.push('the tumor board reviewed the imaging and pathology results for the second case and agreed to proceed with neoadjuvant chemotherapy before surgery');
    const { lines } = card.render(store);
    expect(lines.length).toBeLessThanOrEqual(5);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
    expect(lines[lines.length - 1]).toContain('surgery');
  });

  it('continues the last line across pushes instead of starting a new row per segment', () => {
    const card = new CaptionsCard();
    card.push('short');
    card.push('addition');
    expect(card.render(store).lines).toEqual(['short addition']);
  });

  it('clears everything with the session', () => {
    const card = new CaptionsCard();
    card.push('sensitive transcript');
    card.clear();
    card.listening = true;
    expect(card.render(store).lines).toEqual(['Listening…']);
  });
});
