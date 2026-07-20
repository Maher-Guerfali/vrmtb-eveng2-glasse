import type { CardContent } from '../hud/composer';
import type { BoardStore, BoardSync } from '../sync/boardSync';
import type { Card } from './types';

/** Live two-way voice over the real LiveKit room - distinct from dictation
 *  (which only ever sends finished text). Status-only card; app.ts owns the
 *  actual publish/unpublish call on tap (needs to coordinate with dictation
 *  and voice-control mic ownership, which live outside any single card). */
export class TalkCard implements Card {
  readonly id = 'talk';

  constructor(private sync: BoardSync) {}

  render(_store: BoardStore): CardContent {
    if (!this.sync.getTalkStatus) {
      return {
        title: 'Talk (LiveKit)',
        lines: [
          'Live talk needs the real backend',
          '(?sync=livekit) - not available',
          'against the mock/demo board.',
        ],
        footer: 'dbltap=menu',
      };
    }
    const status = this.sync.getTalkStatus();
    const lines = [
      status.connected ? 'Connected to room' : 'Not connected',
      status.micPublished
        ? '🎙 LIVE — the room hears you'
        : 'Mic off — tap to join the talk',
      `${status.participantCount} in room`,
      'Publishes the PHONE mic (not glasses PCM)',
    ];
    return {
      title: 'Talk (LiveKit)',
      lines,
      footer: status.micPublished ? 'tap=mute · dbltap=menu' : 'tap=talk · dbltap=menu',
    };
  }
}
