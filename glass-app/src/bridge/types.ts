// GlassBridge is the seam between the app and whatever renders the HUD:
// the real Even App bridge on device, or the DOM mock in a browser.
// Nothing outside src/bridge/ may import the Even SDK.

export interface HudTextBox {
  id: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  /** One full-screen transparent container captures G2 touchpad/R1 gestures. */
  captureInput?: boolean;
}

export interface HudPage {
  texts: HudTextBox[];
}

export type InputSource = 'glassesRight' | 'glassesLeft' | 'ring' | 'unknown';

export type GlassInputEvent =
  | { kind: 'tap'; source: InputSource }
  | { kind: 'doubleTap'; source: InputSource }
  | { kind: 'swipeForward'; source: InputSource }
  | { kind: 'swipeBack'; source: InputSource }
  | { kind: 'foreground'; entered: boolean }
  | { kind: 'exit' };

export interface WearState {
  connected: boolean;
  /** Undefined until the Even host has reported a reliable wear state. */
  wearing?: boolean;
  inCase: boolean;
  batteryLevel?: number;
}

export interface GlassBridge {
  readonly kind: 'even' | 'mock';
  /** Push a full page. fresh=true creates the startup page, false rebuilds. */
  renderPage(page: HudPage, fresh: boolean): Promise<void>;
  /** Cheap in-place text update of one container (no page rebuild over BLE). */
  updateText(id: number, name: string, content: string): Promise<void>;
  onInput(cb: (ev: GlassInputEvent) => void): () => void;
  onWearState(cb: (s: WearState) => void): () => void;
  /** Raw PCM chunks from audioControl(); format must be measured on device (P2). */
  onAudioPcm(cb: (chunk: Uint8Array) => void): () => void;
  setMic(open: boolean, source: 'glasses' | 'phone'): Promise<boolean>;
  shutdown(): Promise<void>;
}
