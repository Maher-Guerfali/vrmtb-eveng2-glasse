import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';
import type { Card } from './types';

export type MenuChoice = 'Board' | 'Patient list' | 'Back to patient' | 'Forward details' | 'Notes';
const choices: MenuChoice[] = ['Board', 'Patient list', 'Back to patient', 'Forward details', 'Notes'];

export class MenuCard implements Card {
  readonly id = 'menu';
  private selected = 0;

  move(delta: number): void {
    this.selected = (this.selected + delta + choices.length) % choices.length;
  }

  choice(): MenuChoice { return choices[this.selected]; }

  render(_store: BoardStore): CardContent {
    return {
      title: 'Navigation',
      lines: choices.map((choice, index) => `${index === this.selected ? '▶' : '·'} ${choice}`),
      footer: 'swipe = select · tap = open',
    };
  }
}
