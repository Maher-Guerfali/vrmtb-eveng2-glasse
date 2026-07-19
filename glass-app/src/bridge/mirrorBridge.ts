import type { GlassBridge, HudPage } from './types';

// Composite bridge for demo recordings (?mirror=1 on device): every page and
// text update goes to the real glasses AND to the DOM preview on the phone
// screen, so the phone's OS screen recorder captures exactly what the wearer
// sees on the HUD - the G2 itself has no framebuffer export. Input and wear
// state come from the real device only; the DOM copy is display-only.
export function createMirrorBridge(real: GlassBridge, preview: GlassBridge): GlassBridge {
  return {
    kind: real.kind,

    async renderPage(page: HudPage, fresh: boolean): Promise<void> {
      await Promise.all([real.renderPage(page, fresh), preview.renderPage(page, fresh)]);
    },

    async updateText(id: number, name: string, content: string): Promise<void> {
      await Promise.all([
        real.updateText(id, name, content),
        preview.updateText(id, name, content),
      ]);
    },

    onInput: (cb) => real.onInput(cb),
    onWearState: (cb) => real.onWearState(cb),
    onAudioPcm: (cb) => real.onAudioPcm(cb),
    setMic: (open, source) => real.setMic(open, source),

    async shutdown(): Promise<void> {
      await Promise.all([real.shutdown(), preview.shutdown()]);
    },
  };
}
