import type { SttProvider, SttSegment } from './provider';

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
};
type RecognitionErrorEvent = { error: string };
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionConstructor = new () => Recognition;

/** Uses Web Speech where the Even App WebView exposes it; no cloud key needed. */
export class WebSpeechSttProvider implements SttProvider {
  readonly label = 'web speech';
  private recognition?: Recognition;

  /** lang: BCP-47 tag (e.g. "de-DE"); defaults to the phone's UI language. */
  constructor(private lang?: string) {}

  async start(onSegment: (seg: SttSegment) => void, onEnd?: () => void): Promise<void> {
    const browser = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const ctor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!ctor) throw new Error('Speech recognition is unavailable in this Even App version.');
    const recognition = new ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = this.lang ?? (navigator.language || 'en-US');
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = Array.from(result).map((part) => part.transcript).join(' ').trim();
        if (text) onSegment({ text, isFinal: result.isFinal !== false });
      }
    };
    recognition.onerror = (event) => console.warn('[stt]', event.error);
    // Spontaneous end (silence timeout, engine hiccup) - not a stop() we
    // asked for; stop() below replaces this handler before stopping.
    recognition.onend = () => {
      if (this.recognition === recognition) {
        this.recognition = undefined;
        onEnd?.();
      }
    };
    this.recognition = recognition;
    recognition.start();
  }

  pushPcm(): void { /* A future PCM provider can consume G2 audio here. */ }

  async stop(): Promise<void> {
    const recognition = this.recognition;
    this.recognition = undefined;
    if (!recognition) return;
    // The engine can flush one last final result between stop() and onend,
    // so wait (bounded) before the caller reads the collected segments.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_500);
      recognition.onend = () => { clearTimeout(timer); resolve(); };
      recognition.stop();
    });
  }
}
