import { MAX_LINE_CHARS } from '../hud/layout';
import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';
import type { Card } from './types';

/** Rolling live transcript of the voice-control stream (P2 captions).
 *  Session-only like notes: nothing is ever persisted. */
export class CaptionsCard implements Card {
  readonly id = 'captions';
  private lines: string[] = [];
  /** Mirrors the app's voice-control state for the idle hint. */
  listening = false;

  push(text: string): void {
    for (const word of text.trim().split(/\s+/)) {
      if (!word) continue;
      const last = this.lines[this.lines.length - 1];
      if (last !== undefined && last.length + 1 + word.length <= MAX_LINE_CHARS) {
        this.lines[this.lines.length - 1] = `${last} ${word}`;
      } else {
        this.lines.push(word);
      }
    }
    // Scrollback is pointless on a 5-line HUD; keep just enough to re-render.
    if (this.lines.length > 30) this.lines = this.lines.slice(-30);
  }

  render(_store: BoardStore): CardContent {
    return {
      title: 'Captions',
      lines: this.lines.length
        ? this.lines.slice(-5)
        : [this.listening ? 'Listening…' : 'Turn on Voice control (menu) to caption.'],
      footer: this.listening ? '● live · dbltap=menu' : 'captions idle · dbltap=menu',
    };
  }

  clear(): void { this.lines = []; }
}
