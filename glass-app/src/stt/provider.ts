// Speech-to-text abstraction (P2). The provider decision - self-hosted
// Whisper vs. EU-cloud STT - is deliberately open until reviewed with the
// data-protection officer (COMPLIANCE.md §3), so everything upstream codes
// against this interface only.
//
// Feeding it: bridge.setMic(true, 'glasses') opens the mic and PCM chunks
// arrive via bridge.onAudioPcm(). Sample rate/depth are undocumented in SDK
// 0.0.12 - measure on device before implementing a real provider.

export interface SttSegment {
  text: string;
  isFinal: boolean;
}

export interface SttProvider {
  readonly label: string;
  start(onSegment: (seg: SttSegment) => void): Promise<void>;
  pushPcm(chunk: Uint8Array): void;
  stop(): Promise<void>;
}

/** Placeholder wired into the app until P2 picks a real provider. */
export class NullSttProvider implements SttProvider {
  readonly label = 'stt disabled';
  async start(): Promise<void> {}
  pushPcm(): void {}
  async stop(): Promise<void> {}
}
