import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';
import type { Card } from './types';

export type MenuChoice = 'Board' | 'Patient list' | 'Back to patient' | 'Forward details' | 'Notes' | 'Captions' | 'Voice control';
const choices: MenuChoice[] = ['Board', 'Patient list', 'Back to patient', 'Forward details', 'Notes', 'Captions', 'Voice control'];

export class MenuCard implements Card {
  readonly id = 'menu';
  private selected = 0;
  /** Set by the app so the menu row reflects the live listening state. */
  voiceControlOn = false;

  move(delta: number): void {
    this.selected = (this.selected + delta + choices.length) % choices.length;
  }

  choice(): MenuChoice { return choices[this.selected]; }

  render(_store: BoardStore): CardContent {
    // 5-line body budget: window the list around the selection, like BoardCard.
    const start = Math.max(0, Math.min(this.selected - 2, choices.length - 5));
    return {
      title: 'Navigation',
      lines: choices.slice(start, start + 5).map((choice, offset) => {
        const index = start + offset;
        const label = choice === 'Voice control' ? `Voice control ${this.voiceControlOn ? '(on)' : '(off)'}` : choice;
        return `${index === this.selected ? '▶' : '·'} ${label}`;
      }),
      footer: 'swipe = select · tap = open',
    };
  }
}
