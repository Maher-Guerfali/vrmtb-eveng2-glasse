import type { GlassBridge } from './bridge/types';
import { PatientListCard } from './cards/patientListCard';
import { PatientCard } from './cards/patientCard';
import { NotesCard } from './cards/notesCard';
import { MenuCard } from './cards/menuCard';
import { BoardCard } from './cards/boardCard';
import type { Card } from './cards/types';
import { composePage } from './hud/composer';
import { ID_FOOTER, NAME_FOOTER } from './hud/layout';
import { routeInput } from './input/router';
import { watchWearState } from './privacy/wearGuard';
import type { BoardStore, BoardSync } from './sync/boardSync';
import { transcribePcm } from './stt/openAiProxy';

const NOTIFICATION_MS = 4_000;
const TIMER_REFRESH_MS = 30_000;

export class GlanceApp {
  private patientListCard = new PatientListCard();
  private patientCard = new PatientCard();
  private notesCard = new NotesCard();
  private menuCard = new MenuCard();
  private boardCard = new BoardCard();
  private cards: Card[] = [this.patientListCard, this.patientCard, this.notesCard, this.menuCard, this.boardCard];
  // The menu is the app's home screen; no patient opens until selected.
  private cardIndex = 3;
  private static readonly BOARD_INDEX = 4;

  private firstRender = true;
  private foreground = true;
  private lastFooter = '';
  private notifyTimer: ReturnType<typeof setTimeout> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private disposers: Array<() => void> = [];
  private listening = false;
  private dictating = false;
  private audioChunks: Uint8Array[] = [];
  private transcribeUrl = new URLSearchParams(location.search).get('transcribe_url')
    // Default to this development PC's Wi-Fi address. Override it without a
    // rebuild with ?transcribe_url=http://<server-ip>:8788/api/transcribe.
    ?? 'http://192.168.178.65:8788/api/transcribe';

  constructor(
    private bridge: GlassBridge,
    private store: BoardStore,
    private sync: BoardSync,
    private privacyGuard = false,
  ) {}

  async start(): Promise<void> {
    this.disposers.push(
      routeInput(this.bridge, {
        nextCard: () => this.navigate(+1),
        prevCard: () => this.navigate(-1),
        tap: () => this.handleTap(),
        home: () => this.goBack(),
        setForeground: (entered) => { this.foreground = entered; if (entered) void this.render(); },
        exit: () => void this.dispose(),
      }),
      this.store.onChange(() => void this.render()),
      this.store.onNotify((n) => this.flashFooter(`◦ ${n.text}`)),
    );

    // The G2 host can report "not wearing" during a live on-face test. Keep
    // this disabled for the demo; deployments that require PHI blanking can
    // opt in through ?privacy=1.
    if (this.privacyGuard) {
      this.disposers.push(watchWearState(this.bridge, (blanked) => {
        this.patientCard.privacyBlanked = blanked;
        void this.render();
      }));
    }

    this.disposers.push(this.bridge.onAudioPcm((chunk) => {
      if (this.listening) this.audioChunks.push(chunk.slice());
    }));

    // Elapsed-time / staleness refresh: full re-render is fine on this cadence
    // (30 s), and cheaper paths (textContainerUpgrade) exist if BLE profiling
    // in P0 says otherwise.
    this.tickTimer = setInterval(() => void this.render(), TIMER_REFRESH_MS);

    await this.render();
    await this.sync.start(this.store);
  }

  private navigate(delta: number): void {
    if (this.cardIndex === 0) {
      this.patientListCard.move(this.store, delta);
      void this.render();
      return;
    }
    if (this.cardIndex === 3) {
      this.menuCard.move(delta);
      void this.render();
      return;
    }
    if (this.cardIndex === 1) {
      // While inside a patient, swipe only changes that patient's detail page.
      this.patientCard.nextDetail(delta);
      void this.render();
    }
  }

  private handleTap(): void {
    if (this.cardIndex === 0) {
      const caseId = this.patientListCard.selected(this.store);
      if (caseId) {
        this.store.selectActiveCase(caseId);
        // Broadcasts to every other connected client (dashboard, other
        // glasses, MCP-driven assistants) via the same 'selectPatient'
        // command the dashboard's own UI/voice commands use - a no-op on
        // MockSync, which has nothing to broadcast to.
        void this.sync.sendCommand?.('selectPatient', { patientId: caseId });
      }
      this.patientCard.resetDetail();
      this.showCard(1);
      return;
    }
    if (this.cardIndex === 3) {
      switch (this.menuCard.choice()) {
        case 'Board': this.showCard(GlanceApp.BOARD_INDEX); break;
        case 'Patient list': this.showCard(0); break;
        case 'Back to patient': this.patientCard.resetDetail(); this.showCard(1); break;
        case 'Forward details': this.patientCard.nextDetail(1); this.showCard(1); break;
        case 'Notes': this.showCard(2); break;
      }
      return;
    }
    void this.toggleVoice();
  }

  private openMenu(): void { this.showCard(3); }

  private goBack(): void {
    if (this.cardIndex === 1) this.showCard(0); // patient -> patient list
    else this.openMenu(); // list, notes, board, menu -> menu
  }

  private showCard(index: number): void {
    if (index === this.cardIndex) return;
    this.cardIndex = index;
    void this.render();
  }

  private async render(): Promise<void> {
    if (!this.foreground) return;
    const card = this.cards[this.cardIndex];
    const content = card.render(this.store);
    const page = composePage(content, {
      cardIndex: 0,
      cardCount: 1,
      // A static demo intentionally receives no further messages, so stale
      // must not be presented as a glasses/device offline condition.
      offline: false,
    });
    this.lastFooter = content.footer ?? '';
    await this.bridge.renderPage(page, this.firstRender);
    this.firstRender = false;
  }

  private async toggleVoice(): Promise<void> {
    if (this.listening) {
      await this.finishDictation();
      return;
    }
    // The page is created before a touch can call this, as required by the SDK.
    if (!await this.bridge.setMic(true, 'glasses')) {
      this.flashFooter('Mic blocked: grant G2 mic permission');
      return;
    }
    try {
      this.listening = true;
      this.dictating = true;
      this.audioChunks = [];
      this.notesCard.setDraft('');
      this.showCard(2);
      this.flashFooter('Recording. Tap again to transcribe.');
    } catch (error) {
      await this.bridge.setMic(false, 'glasses');
      this.flashFooter('Microphone unavailable');
      console.warn('[dictation] unable to start', error);
    }
  }

  private async finishDictation(): Promise<void> {
    this.listening = false;
    this.dictating = false;
    await this.bridge.setMic(false, 'glasses');
    const pcm = this.joinAudio();
    if (!pcm.length) {
      this.flashFooter('No audio received');
      return;
    }
    this.notesCard.setDraft('Transcribing…');
    void this.render();
    try {
      const text = await transcribePcm(this.transcribeUrl, pcm);
      this.notesCard.add(text);
      this.notesCard.setDraft('');
      this.flashFooter('Note saved');
      void this.render();
    } catch (error) {
      this.notesCard.setDraft('');
      const message = error instanceof Error ? error.message : 'Transcription failed';
      this.flashFooter(message === 'Failed to fetch' ? 'Server unreachable' : message.slice(0, 44));
      void this.render();
      console.warn('[dictation] transcription failed', error);
    }
  }

  private async stopVoice(): Promise<void> {
    this.listening = false;
    this.dictating = false;
    await this.bridge.setMic(false, 'glasses');
  }

  private joinAudio(): Uint8Array {
    const length = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    this.audioChunks = [];
    return joined;
  }


  /** Ambient notification: borrow the footer for a few seconds, then restore. */
  private flashFooter(text: string): void {
    if (!this.foreground) return;
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    void this.bridge.updateText(ID_FOOTER, NAME_FOOTER, text);
    this.notifyTimer = setTimeout(
      () => void this.bridge.updateText(ID_FOOTER, NAME_FOOTER, this.lastFooter),
      NOTIFICATION_MS,
    );
  }

  async dispose(): Promise<void> {
    this.disposers.forEach((d) => d());
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    await this.stopVoice();
    this.notesCard.clear();
    await this.sync.stop();
    this.store.clear(); // PHI evaporates with the session
    await this.bridge.shutdown();
  }
}
