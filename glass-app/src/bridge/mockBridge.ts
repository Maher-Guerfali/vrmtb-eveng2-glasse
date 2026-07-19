// Browser stand-in for the glasses: renders HUD pages into a green-on-black
// panel at the G2's 576x288 logical size, and maps keyboard/buttons to the
// same input events the touchpads/ring produce. Lets the whole team iterate
// on card design (and demo over screen share) without hardware.

import { HUD_HEIGHT, HUD_WIDTH } from '../hud/layout';
import type {
  GlassBridge,
  GlassInputEvent,
  HudPage,
  WearState,
} from './types';

export function createMockBridge(root: HTMLElement): GlassBridge {
  const inputCbs = new Set<(ev: GlassInputEvent) => void>();
  const wearCbs = new Set<(s: WearState) => void>();
  const audioCbs = new Set<(chunk: Uint8Array) => void>();
  let wearing = true;
  let micTimer: ReturnType<typeof setInterval> | undefined;

  root.innerHTML = `
    <h2 style="font-weight:600">VR-MTB Glance — browser preview</h2>
    <p>Simulated Even G2 HUD (${HUD_WIDTH}×${HUD_HEIGHT}, monochrome). No glasses connected.</p>
    <div id="hud" style="position:relative;width:${HUD_WIDTH}px;height:${HUD_HEIGHT}px;
         background:#000;border:1px solid #2c3238;border-radius:6px;overflow:hidden;
         font-family:ui-monospace,Consolas,monospace;color:#41e88d"></div>
    <p style="margin-top:12px">
      <button data-ev="swipeBack">◀ swipe back (←)</button>
      <button data-ev="swipeForward">swipe fwd (→) ▶</button>
      <button data-ev="tap">tap (Enter)</button>
      <button data-ev="doubleTap">double-tap (Backspace)</button>
      <button id="wear">take glasses off</button>
    </p>`;

  const hud = root.querySelector<HTMLDivElement>('#hud')!;

  const emit = (ev: GlassInputEvent) => inputCbs.forEach((cb) => cb(ev));
  const emitWear = () =>
    wearCbs.forEach((cb) =>
      cb({ connected: true, wearing, inCase: false, batteryLevel: 82 }),
    );

  root.querySelectorAll<HTMLButtonElement>('button[data-ev]').forEach((btn) =>
    btn.addEventListener('click', () =>
      emit({ kind: btn.dataset.ev as 'tap' | 'doubleTap' | 'swipeForward' | 'swipeBack', source: 'glassesRight' }),
    ),
  );
  root.querySelector<HTMLButtonElement>('#wear')!.addEventListener('click', (e) => {
    wearing = !wearing;
    (e.target as HTMLButtonElement).textContent = wearing ? 'take glasses off' : 'put glasses on';
    emitWear();
  });

  window.addEventListener('keydown', (e) => {
    const map: Record<string, GlassInputEvent> = {
      ArrowRight: { kind: 'swipeForward', source: 'glassesRight' },
      ArrowDown: { kind: 'swipeForward', source: 'glassesRight' },
      ArrowLeft: { kind: 'swipeBack', source: 'glassesRight' },
      ArrowUp: { kind: 'swipeBack', source: 'glassesRight' },
      Enter: { kind: 'tap', source: 'glassesRight' },
      Backspace: { kind: 'doubleTap', source: 'glassesRight' },
    };
    const ev = map[e.key];
    if (ev) {
      e.preventDefault();
      emit(ev);
    }
  });

  const boxes = new Map<number, HTMLDivElement>();

  return {
    kind: 'mock',

    async renderPage(page: HudPage): Promise<void> {
      hud.innerHTML = '';
      boxes.clear();
      for (const t of page.texts) {
        const div = document.createElement('div');
        div.style.cssText = `position:absolute;left:${t.x}px;top:${t.y}px;width:${t.w}px;
          height:${t.h}px;font-size:17px;line-height:1.2;white-space:pre;overflow:hidden`;
        div.textContent = t.content;
        hud.appendChild(div);
        boxes.set(t.id, div);
      }
    },

    async updateText(id: number, _name: string, content: string): Promise<void> {
      const div = boxes.get(id);
      if (div) div.textContent = content;
    },

    onInput(cb) {
      inputCbs.add(cb);
      return () => inputCbs.delete(cb);
    },

    onWearState(cb) {
      wearCbs.add(cb);
      queueMicrotask(emitWear);
      return () => wearCbs.delete(cb);
    },

    onAudioPcm(cb) {
      audioCbs.add(cb);
      return () => audioCbs.delete(cb);
    },

    // Simulates a granted mic so the record -> transcribe UI flow (including
    // the real fetch to the transcription server) is exercisable in the
    // browser without any G2 hardware. Chunks are silent placeholder bytes -
    // enough to make `pcm.length > 0` so the app proceeds to actually POST to
    // the transcription server (useful to test connectivity/CORS end to end),
    // but not real speech, so expect an empty/garbage transcript back.
    async setMic(open) {
      if (micTimer) { clearInterval(micTimer); micTimer = undefined; }
      if (open) {
        micTimer = setInterval(() => {
          const chunk = new Uint8Array(3200); // ~100ms of silence at 16kHz/16-bit mono
          audioCbs.forEach((cb) => cb(chunk));
        }, 100);
      }
      return true;
    },

    async shutdown() {
      if (micTimer) clearInterval(micTimer);
      hud.innerHTML = '<div style="padding:16px">— app exited —</div>';
    },
  };
}
