import { GlanceApp } from './app';
import { connectEvenBridge } from './bridge/evenBridge';
import { createMockBridge } from './bridge/mockBridge';
import { BoardStore, type BoardSync } from './sync/boardSync';
import { MockSync } from './sync/mockSync';

// Sync source selection (boot-time, URL-driven so no rebuild is needed):
//   default                -> scripted mock board (browser demo + first device tests)
//   ?sync=livekit&token_url=<voice-token-url>&room=tb-dev&identity=g2-maher
//                          -> live board via the existing VR-MTB LiveKit room
// livekit-client is ~170 kB gzipped, so it is only loaded when actually used.
async function pickSync(params: URLSearchParams): Promise<BoardSync> {
  if (params.get('sync') === 'livekit') {
    const { LiveKitSync } = await import('./sync/liveKitSync');
    return new LiveKitSync({
      tokenUrl: params.get('token_url') ?? 'http://192.168.178.65:8787/api/voice/token',
      room: params.get('room') ?? 'tb-dev',
      identity: params.get('identity') ?? `g2-${Math.random().toString(36).slice(2, 8)}`,
    });
  }
  return new MockSync();
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);

  // Inside the Even App the native handler exists and the real bridge is
  // used; in a plain browser we fall back to the DOM mock. ?bridge=mock
  // forces the mock even on-device (useful for phone-screen debugging).
  const bridge =
    (params.get('bridge') === 'mock' ? null : await connectEvenBridge()) ??
    createMockBridge(document.getElementById('app') ?? document.body);

  const store = new BoardStore();
  const sync = await pickSync(params);
  console.info(`[glance] bridge=${bridge.kind} sync=${sync.label}`);

  const app = new GlanceApp(bridge, store, sync);
  await app.start();
}

void boot();
