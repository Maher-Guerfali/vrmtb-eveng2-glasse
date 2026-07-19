import type { CardContent } from '../hud/composer';
import type { Card } from './types';
import type { BoardStore } from '../sync/boardSync';

/** Session-only voice notes. They are deliberately never persisted on-device. */
export class NotesCard implements Card {
  readonly id = 'notes';
  private notes: string[] = [];
  private draft = '';

  add(text: string): void {
    const note = text.trim();
    if (note) this.notes.unshift(note);
  }

  setDraft(text: string): void { this.draft = text.trim(); }

  /** Newest-first, for spoken readback ("read notes"). */
  recent(count = 3): string[] { return this.notes.slice(0, count); }

  render(_store: BoardStore): CardContent {
    return {
      title: 'Notes',
      lines: this.draft
        ? [`Dictating: ${this.draft}`, ...this.notes].slice(0, 5)
        : this.notes.length ? this.notes.slice(0, 5) : ['No session notes yet.', 'Tap once and start talking.'],
      footer: this.draft ? 'tap = stop / transcribe' : 'tap = start dictation',
    };
  }

  clear(): void { this.notes = []; this.draft = ''; }
}
