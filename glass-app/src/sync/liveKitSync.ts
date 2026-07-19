// Production sync source: speaks vr-mtb-web's REAL backend/room protocol
// directly (see backend/README.md and app/src/realtime/ in that repo) -
// there is no glasses-specific topic to add there. This file is the one
// place in glass-app allowed to see the full /api/session response
// (including PHI fields `name`/`dob`); toHudPatient() below is the
// minimization boundary - see protocol.ts's top comment for why that line
// is drawn here rather than trusting the backend to curate for wearables.

import { ConnectionState, Room, RoomEvent } from 'livekit-client';

import type { BoardStore, BoardSync } from './boardSync';
import type { HudBoardState, HudPatientSummary } from './protocol';

export interface LiveKitSyncConfig {
  /** e.g. http://192.168.178.65:8787 - the vr-mtb-web backend, not LiveKit itself */
  backendUrl: string;
  /** e.g. "MTB-DEV" - POST /api/rooms/join creates it on first join */
  roomCode: string;
  /** Opaque ID, letters/digits/dash/underscore only (backend's OpaqueId schema) */
  identity: string;
  displayName: string;
}

// Mirrors vr-mtb-web's RoomDataMessage (app/src/realtime/types.ts) - kept as
// a local copy since the two repos deploy independently.
type RoomDataMessage =
  | { topic: 'activePatient'; patientId: string }
  | { topic: 'command'; command: string; args?: Record<string, unknown> };

/**
 * Minimal slice of GET /api/session's response this file reads. The real
 * shape (vr-mtb-web's app/src/domain/schema.ts) has far more fields -
 * crucially `name` and `dob` on each patient, which are PHI. Deliberately
 * NOT typed/destructured here so it stays obvious which fields this file
 * touches; toHudPatient() below must never read `name`/`dob` into anything
 * that reaches HudPatientSummary or the store.
 */
interface RemoteSession {
  session: {
    phase: string;
    activePatientId: string;
    completedPatientIds: string[];
  };
  patients: Array<{
    id: string;
    dx: string;
    conditions: Array<{ code: string; name: string; onset: string }>;
    labs: Array<{ label: string; value: string; unit: string; flag: string | null }>;
    allergies: Array<{ name: string; sev: string }>;
  }>;
}

function toHudPatient(p: RemoteSession['patients'][number]): HudPatientSummary {
  return {
    caseId: p.id,
    dxLine: p.dx,
    conditionLines: p.conditions.slice(0, 3).map((c) => `${c.code} ${c.name} (${c.onset})`),
    abnormalLabLines: p.labs
      .filter((l) => l.flag)
      .slice(0, 3)
      .map((l) => `${l.label} ${l.value}${l.unit} ${l.flag}`),
    allergyLine: p.allergies[0] ? `${p.allergies[0].name} (${p.allergies[0].sev})` : undefined,
  };
}

function toHudBoard(s: RemoteSession['session'], patientIds: string[]): HudBoardState {
  return {
    // The real session schema has no meeting-title/presenter/recording
    // concept - those fields stay undefined; BoardCard already renders them
    // as optional (falsy-safe .filter(Boolean) status line).
    meetingTitle: `Tumor board · ${s.phase}`,
    activeCaseId: s.activePatientId,
    cases: patientIds.map((id) => ({
      caseId: id,
      // Opaque ID only, matching vr-mtb-web's own bridge rule ("IDs only -
      // names are PHI", see app/src/bridge/unityBridge.ts).
      label: id,
      status: id === s.activePatientId ? 'active' : s.completedPatientIds.includes(id) ? 'done' : 'pending',
    })),
  };
}

export class LiveKitSync implements BoardSync {
  readonly label: string;
  private room?: Room;
  private decoder = new TextDecoder();
  private roomId = '';

  constructor(private config: LiveKitSyncConfig) {
    this.label = `vr-mtb-web · ${config.roomCode}`;
  }

  async start(store: BoardStore): Promise<void> {
    const { backendUrl, roomCode, identity, displayName } = this.config;

    // 1. Join the real room - POST /api/rooms/join (backend/src/routes/rooms.ts).
    //    Idempotent: creates the room on first join, this identity becomes host.
    const joinRes = await fetch(`${backendUrl}/api/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, identity, displayName }),
    });
    if (!joinRes.ok) throw new Error(`rooms/join: HTTP ${joinRes.status}`);
    const joined = (await joinRes.json()) as { url: string; token: string; roomId: string };
    this.roomId = joined.roomId;

    // 2. Full-state fetch of session/patient data, curated down immediately.
    await this.refreshSession(store);

    // 3. Join the LiveKit room itself for live updates.
    const room = new Room();
    this.room = room;

    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
      try {
        const parsed = JSON.parse(this.decoder.decode(payload));
        this.handleMessage(store, { topic, ...parsed } as RoomDataMessage);
      } catch {
        // Malformed payload - dropped; the next message (or a future
        // refreshSession) heals us. Never throw out of a data-channel handler.
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      store.notify({ text: 'sync disconnected' });
    });

    // autoSubscribe:false - the G2 has no speaker, so subscribing to the
    // room's audio tracks would only play meeting audio out of the doctor's
    // phone. Data channels work regardless of subscription.
    await room.connect(joined.url, joined.token, { autoSubscribe: false });
  }

  private handleMessage(store: BoardStore, msg: RoomDataMessage): void {
    if (msg.topic === 'activePatient') {
      store.selectActiveCase(msg.patientId);
      return;
    }
    if (msg.topic !== 'command') return;
    const board = store.board;
    if (!board) return;
    if (msg.command === 'selectPatient') {
      const patientId = msg.args?.patientId;
      if (typeof patientId === 'string') store.selectActiveCase(patientId);
    } else if (msg.command === 'nextPatient' || msg.command === 'previousPatient') {
      // Same command vocabulary the dashboard's own voice commands and the
      // MCP server use (vr-mtb-web's app/src/commands/registry.ts) - a
      // doctor saying "next patient" and a G2 wearer swiping produce the
      // identical effect on every connected client.
      const delta = msg.command === 'nextPatient' ? 1 : -1;
      const cases = board.cases;
      const current = Math.max(0, cases.findIndex((c) => c.caseId === board.activeCaseId));
      const next = cases[(current + delta + cases.length) % cases.length];
      if (next) store.selectActiveCase(next.caseId);
    }
  }

  private async refreshSession(store: BoardStore): Promise<void> {
    const res = await fetch(`${this.config.backendUrl}/api/session`);
    if (!res.ok) throw new Error(`session: HTTP ${res.status}`);
    const data = (await res.json()) as RemoteSession;
    store.setBoard(toHudBoard(data.session, data.patients.map((p) => p.id)));
    for (const p of data.patients) store.setPatient(toHudPatient(p));
  }

  /**
   * Wearer-initiated selection, broadcast back to the room. Routed through
   * the REST PATCH (not a raw LiveKit publish) because it is the
   * server-authoritative path: it updates vr-mtb-web's canonical session
   * state AND broadcasts 'selectPatient' to every connected client in one
   * call (backend/src/routes/session.ts) - a late-joining dashboard sees the
   * glasses' choice too, not just currently-connected ones.
   */
  async sendCommand(command: string, args?: Record<string, unknown>): Promise<void> {
    if (command !== 'selectPatient' || typeof args?.patientId !== 'string') return;
    await fetch(`${this.config.backendUrl}/api/session/active-patient`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: args.patientId, roomId: this.roomId }),
    }).catch((e) => console.warn('[liveKitSync] active-patient broadcast failed', e));
  }

  async stop(): Promise<void> {
    if (this.room && this.room.state !== ConnectionState.Disconnected) await this.room.disconnect();
    this.room = undefined;
  }
}
