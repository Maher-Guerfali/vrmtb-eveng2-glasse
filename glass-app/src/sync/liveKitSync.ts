// Production sync source: joins the same LiveKit room the Unity client,
// dashboard, and Rokid app already share, and consumes the vrmtb.hud topic
// (plus vrmtb.annotation for ambient notifications).
//
// Token flow mirrors vrmtb-unity's VoiceManager: fetch from the existing
// voice-token service (vrmtb-infra/services/voice-token). Adjust
// tokenResponse parsing there and here together if the response shape ever
// changes - this client tolerates the common key spellings.

import { Room, RoomEvent } from 'livekit-client';

import type { BoardStore, BoardSync } from './boardSync';
import { ANNOTATION_TOPIC, HUD_TOPIC, parseHudEnvelope } from './protocol';

export interface LiveKitSyncConfig {
  /** e.g. http://<host>:8787/api/voice/token - same service every client uses */
  tokenUrl: string;
  room: string;      // e.g. "tb-dev"
  identity: string;  // e.g. "g2-<doctor>"
}

export class LiveKitSync implements BoardSync {
  readonly label: string;
  private room?: Room;
  private decoder = new TextDecoder();

  constructor(private config: LiveKitSyncConfig) {
    this.label = `LiveKit · ${config.room}`;
  }

  async start(store: BoardStore): Promise<void> {
    const { tokenUrl, room: roomName, identity } = this.config;
    const url = new URL(tokenUrl);
    url.searchParams.set('room', roomName);
    url.searchParams.set('identity', identity);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`voice-token service: HTTP ${res.status}`);
    const body: Record<string, unknown> = await res.json();
    const token = (body.token ?? body.accessToken) as string | undefined;
    const serverUrl = (body.url ?? body.serverUrl ?? body.wsUrl) as string | undefined;
    if (!token || !serverUrl) {
      throw new Error('voice-token response missing token/url - align parsing with vrmtb-infra');
    }

    this.room = new Room();

    this.room.on(
      RoomEvent.DataReceived,
      (payload: Uint8Array, _participant?: unknown, _kind?: unknown, topic?: string) => {
        if (topic === HUD_TOPIC) {
          try {
            const envelope = parseHudEnvelope(JSON.parse(this.decoder.decode(payload)));
            if (envelope) store.apply(envelope);
          } catch {
            // Malformed payloads are dropped; the next full-state message heals us.
          }
        } else if (topic === ANNOTATION_TOPIC) {
          // Existing Unity/dashboard topic - surfaced only as ambient info.
          store.apply({ v: 1, type: 'notify', payload: { text: '3D annotation updated' } });
        }
      },
    );

    this.room.on(RoomEvent.Disconnected, () => {
      store.apply({ v: 1, type: 'notify', payload: { text: 'sync disconnected' } });
    });

    // autoSubscribe:false - the G2 has no speaker, so subscribing to the
    // room's audio tracks would only play meeting audio out of the doctor's
    // phone. Data channels work regardless of subscription.
    await this.room.connect(serverUrl, token, { autoSubscribe: false });
  }

  async stop(): Promise<void> {
    await this.room?.disconnect();
    this.room = undefined;
  }
}
