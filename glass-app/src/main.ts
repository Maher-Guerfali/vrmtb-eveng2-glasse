import { GlanceApp } from './app';
import { connectEvenBridge } from './bridge/evenBridge';
import { createMirrorBridge } from './bridge/mirrorBridge';
import { createMockBridge } from './bridge/mockBridge';
import { BoardStore, type BoardSync } from './sync/boardSync';
import { MockSync } from './sync/mockSync';

// Sync source selection (boot-time, URL-driven so no rebuild is needed):
//   default -> scripted mock board (browser demo + first device tests)
//   ?sync=livekit&backend=http://host:8787&room=MTB-DEV&identity=g2-maher&name=Dr.%20Maher
//           -> the REAL vr-mtb-web backend/room (see sync/liveKitSync.ts) -
//           speaks that repo's actual REST + LiveKit data-channel protocol,
//           not a glasses-specific topic; no changes needed in vr-mtb-web.
// livekit-client is ~170 kB gzipped, so it is only loaded when actually used.
async function pickSync(params: URLSearchParams): Promise<BoardSync> {
  if (params.get('sync') === 'livekit') {
    const { LiveKitSync } = await import('./sync/liveKitSync');
    const identity = params.get('identity') ?? `g2-${Math.random().toString(36).slice(2, 8)}`;
    return new LiveKitSync({
      backendUrl: params.get('backend') ?? 'http://192.168.178.65:8787',
      roomCode: params.get('room') ?? 'MTB-DEV',
      identity,
      displayName: params.get('name') ?? identity,
    });
  }
  // ?step=25 slows the scripted board to one advance per 25 s - handy when
  // screen-recording a demo for the team.
  const stepSec = Number(params.get('step'));
  return new MockSync(stepSec > 0 ? stepSec * 1000 : undefined);
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);

  // Inside the Even App the native handler exists and the real bridge is
  // used; in a plain browser we fall back to the DOM mock. ?bridge=mock
  // forces the mock even on-device (useful for phone-screen debugging), and
  // ?mirror=1 renders to the glasses AND the phone screen simultaneously so
  // the phone's screen recorder can capture what the wearer sees.
  const mount = document.getElementById('app') ?? document.body;
  const real = params.get('bridge') === 'mock' ? null : await connectEvenBridge();
  const bridge = real
    ? params.get('mirror') === '1'
      ? createMirrorBridge(real, createMockBridge(mount))
      : real
    : createMockBridge(mount);

  const store = new BoardStore();
  const sync = await pickSync(params);
  console.info(`[glance] bridge=${bridge.kind} sync=${sync.label}`);

  const app = new GlanceApp(bridge, store, sync, params.get('privacy') === '1');
  await app.start();
}

void boot();
