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
import { WebSpeechSttProvider } from './stt/webSpeech';
import { speakText } from './tts/openAiProxy';
import { canSpeakOnDevice, speakOnDevice } from './tts/webSpeech';
import { parseVoiceCommand } from './voice/commands';

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
  // Note readback lives on the same proxy; ?tts_url= overrides it separately.
  private ttsUrl = new URLSearchParams(location.search).get('tts_url')
    ?? this.transcribeUrl.replace('/api/transcribe', '/api/tts');
  // Readback plays on the PHONE (the G2 has no speaker); ?tts=0 keeps it silent.
  private ttsEnabled = new URLSearchParams(location.search).get('tts') !== '0';
  // Standalone by default: dictation and readback use the phone's own speech
  // engines (no PC, no key). ?stt=proxy / ?tts=proxy force the OpenAI proxy
  // path instead — better accuracy, but needs the transcription server.
  private sttForcedProxy = new URLSearchParams(location.search).get('stt') === 'proxy';
  private ttsForcedProxy = new URLSearchParams(location.search).get('tts') === 'proxy';
  // ?lang=de-DE overrides both recognition and readback; the command grammar
  // itself accepts English and German regardless of engine language.
  private speechLang = new URLSearchParams(location.search).get('lang')
    ?? (navigator.language || 'en-US');
  private webStt: WebSpeechSttProvider | undefined;
  private sttSegments: string[] = [];
  private dictationEngine: 'device' | 'proxy' = 'proxy';
  // Hands-free mode: one continuous recognition stream parses commands
  // ("open board", "next patient", "take a note", …) until told to stop.
  private voiceControl = false;
  private voiceCmd: WebSpeechSttProvider | undefined;
  private voiceNoteActive = false;
  private voiceNoteKind: 'note' | 'decision' = 'note';
  private voiceRestartCount = 0;
  private voiceStartedAt = 0;
  private ttsSpeaking = false;

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
      this.store.onChange(() => {
        this.cueActiveCaseChange();
        void this.render();
      }),
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

  /** Someone else moved the board on: surface it wherever the wearer is looking. */
  private lastActiveCaseId: string | undefined;
  private cueActiveCaseChange(): void {
    const board = this.store.board;
    const activeId = board?.activeCaseId;
    if (!activeId || activeId === this.lastActiveCaseId) return;
    const first = this.lastActiveCaseId === undefined; // initial sync, not a switch
    this.lastActiveCaseId = activeId;
    if (first) return;
    const label = board.cases.find((c) => c.caseId === activeId)?.label ?? activeId;
    this.flashFooter(`▶ Now: ${label}`);
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
        this.lastActiveCaseId = caseId; // own action - no "board moved" cue
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
        case 'Voice control': void this.toggleVoiceControl(); break;
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

  // ── Hands-free voice control ────────────────────────────────────────────

  private async toggleVoiceControl(): Promise<void> {
    if (this.voiceControl) {
      await this.disableVoiceControl('Voice control off');
      return;
    }
    if (this.listening) await this.finishDictation(); // one stream at a time
    if (!await this.startVoiceCmdProvider()) {
      this.flashFooter('Voice control unavailable here');
      return;
    }
    this.voiceControl = true;
    this.menuCard.voiceControlOn = true;
    this.voiceRestartCount = 0;
    this.flashFooter('Voice on - try "open board", "take a note"');
    void this.render();
  }

  private async disableVoiceControl(message?: string): Promise<void> {
    this.voiceControl = false;
    this.voiceNoteActive = false;
    this.menuCard.voiceControlOn = false;
    const provider = this.voiceCmd;
    this.voiceCmd = undefined;
    await provider?.stop();
    if (message) this.flashFooter(message);
    void this.render();
  }

  private async startVoiceCmdProvider(): Promise<boolean> {
    const provider = new WebSpeechSttProvider(this.speechLang);
    try {
      await provider.start(
        (seg) => { if (seg.isFinal && this.voiceCmd === provider) this.handleVoiceSegment(seg.text); },
        () => {
          // Spontaneous engine end (silence timeout on most phones) - restart
          // so "always listening" holds, unless the engine is flapping.
          if (this.voiceCmd !== provider || !this.voiceControl) return;
          this.voiceCmd = undefined;
          this.restartVoiceControl();
        },
      );
    } catch (error) {
      console.warn('[voice] recognition unavailable', error);
      return false;
    }
    this.voiceStartedAt = Date.now();
    this.voiceCmd = provider;
    return true;
  }

  private restartVoiceControl(): void {
    if (this.ttsSpeaking) return; // speakNote() resumes us after readback ends
    if (Date.now() - this.voiceStartedAt < 1_000) {
      this.voiceRestartCount += 1;
      if (this.voiceRestartCount >= 3) {
        void this.disableVoiceControl('Voice control gave up (mic?)');
        return;
      }
    } else {
      this.voiceRestartCount = 0;
    }
    setTimeout(() => {
      if (!this.voiceControl || this.voiceCmd) return;
      void this.startVoiceCmdProvider().then((ok) => {
        if (!ok) void this.disableVoiceControl('Voice control lost');
      });
    }, 250);
  }

  private handleVoiceSegment(transcript: string): void {
    if (this.voiceNoteActive) {
      if (parseVoiceCommand(transcript).kind === 'stop') {
        void this.finishVoiceNote();
        return;
      }
      this.sttSegments.push(transcript.trim());
      this.notesCard.setDraft(this.sttSegments.join(' '));
      void this.render();
      return;
    }
    const cmd = parseVoiceCommand(transcript);
    switch (cmd.kind) {
      case 'open':
        if (cmd.target === 'board') this.showCard(GlanceApp.BOARD_INDEX);
        else if (cmd.target === 'patients') this.showCard(0);
        else if (cmd.target === 'patient') { this.patientCard.resetDetail(); this.showCard(1); }
        else this.showCard(2);
        break;
      case 'nav': this.voiceNav(cmd.delta); break;
      case 'startNote': this.beginVoiceNote('note'); break;
      case 'note': this.saveSpokenNote(cmd.text, 'note'); break;
      case 'decision': this.saveSpokenNote(cmd.text, 'decision'); break;
      case 'readNotes': void this.readNotesBack(); break;
      case 'stop': void this.disableVoiceControl('Voice control off'); break;
      default: break; // ambient meeting talk - never react to unknowns
    }
  }

  /** "next/previous patient" - same room-wide effect as the dashboard's own
   *  voice commands: local switch plus the server-authoritative broadcast. */
  private voiceNav(delta: 1 | -1): void {
    const board = this.store.board;
    if (!board?.cases.length) return;
    const current = Math.max(0, board.cases.findIndex((c) => c.caseId === board.activeCaseId));
    const next = board.cases[(current + delta + board.cases.length) % board.cases.length];
    if (!next) return;
    this.lastActiveCaseId = next.caseId; // own action - no "board moved" cue
    this.store.selectActiveCase(next.caseId);
    void this.sync.sendCommand?.('selectPatient', { patientId: next.caseId });
    this.patientCard.resetDetail();
    this.showCard(1);
  }

  private beginVoiceNote(kind: 'note' | 'decision'): void {
    this.voiceNoteActive = true;
    this.voiceNoteKind = kind;
    this.sttSegments = [];
    this.notesCard.setDraft('');
    this.showCard(2);
    this.flashFooter('Dictating. Say "stop" to save.');
  }

  private async finishVoiceNote(): Promise<void> {
    this.voiceNoteActive = false;
    const text = this.sttSegments.join(' ').trim();
    this.sttSegments = [];
    this.notesCard.setDraft('');
    if (!text) {
      this.flashFooter('Nothing heard');
      void this.render();
      return;
    }
    this.saveSpokenNote(text, this.voiceNoteKind);
  }

  /** Decisions are notes with weight: marked, case-tagged, read back for
   *  confirmation. Local-only until vr-mtb-web grows a write API for them. */
  private saveSpokenNote(text: string, kind: 'note' | 'decision'): void {
    const caseId = this.store.board?.activeCaseId;
    const stored = kind === 'decision'
      ? `★ Decision${caseId ? ` [${caseId}]` : ''}: ${text}`
      : text;
    this.notesCard.add(stored);
    this.flashFooter(kind === 'decision' ? 'Decision recorded' : 'Note saved');
    void this.render();
    if (this.ttsEnabled) void this.speakNote(stored);
  }

  private async readNotesBack(): Promise<void> {
    const notes = this.notesCard.recent(3);
    if (!notes.length) {
      this.flashFooter('No notes yet');
      return;
    }
    this.showCard(2);
    await this.speakNote(notes.join('. Next note: '));
  }

  // ── Tap-driven dictation ────────────────────────────────────────────────

  private async toggleVoice(): Promise<void> {
    if (this.voiceControl) {
      // One shared recognition stream - a tap starts/saves a spoken note in it.
      if (this.voiceNoteActive) await this.finishVoiceNote();
      else this.beginVoiceNote('note');
      return;
    }
    if (this.listening) {
      await this.finishDictation();
      return;
    }
    if (!this.sttForcedProxy && await this.startDeviceDictation()) return;
    // The page is created before a touch can call this, as required by the SDK.
    if (!await this.bridge.setMic(true, 'glasses')) {
      this.flashFooter('Mic blocked: grant G2 mic permission');
      return;
    }
    try {
      this.dictationEngine = 'proxy';
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

  /** Standalone dictation on the phone's speech engine. False = engine missing,
   *  so the caller falls back to the glasses-mic -> proxy recording path. */
  private async startDeviceDictation(): Promise<boolean> {
    const provider = new WebSpeechSttProvider(this.speechLang);
    this.sttSegments = [];
    try {
      await provider.start((seg) => {
        // Keep collecting through stop()'s grace period (trailing finals),
        // but ignore events from a provider that was already replaced.
        if (!seg.isFinal || this.webStt !== provider) return;
        this.sttSegments.push(seg.text);
        this.notesCard.setDraft(this.sttSegments.join(' '));
        void this.render();
      });
    } catch (error) {
      console.warn('[dictation] web speech unavailable, falling back to proxy', error);
      return false;
    }
    this.webStt = provider;
    this.dictationEngine = 'device';
    this.listening = true;
    this.dictating = true;
    this.notesCard.setDraft('');
    this.showCard(2);
    this.flashFooter('Listening (on-device). Tap again to save.');
    return true;
  }

  private async finishDictation(): Promise<void> {
    this.listening = false;
    this.dictating = false;
    if (this.dictationEngine === 'device') {
      await this.webStt?.stop(); // waits for the engine's trailing final result
      this.webStt = undefined;
      const text = this.sttSegments.join(' ').trim();
      this.sttSegments = [];
      this.notesCard.setDraft('');
      if (!text) {
        this.flashFooter('No speech recognized');
        void this.render();
        return;
      }
      this.saveSpokenNote(text, 'note');
      return;
    }
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
      this.notesCard.setDraft('');
      this.saveSpokenNote(text, 'note');
    } catch (error) {
      this.notesCard.setDraft('');
      const message = error instanceof Error ? error.message : 'Transcription failed';
      this.flashFooter(message === 'Failed to fetch' ? 'Server unreachable' : message.slice(0, 44));
      void this.render();
      console.warn('[dictation] transcription failed', error);
    }
  }

  /** Read the saved note back through the phone speaker (the G2 itself is silent). */
  private async speakNote(text: string): Promise<void> {
    // Feedback guard: while the phone talks, our own recognition stream would
    // transcribe the readback. Pause it and resume once the speech ends.
    const resumeVoice = this.voiceControl && this.voiceCmd !== undefined;
    if (resumeVoice) {
      this.ttsSpeaking = true;
      const provider = this.voiceCmd;
      this.voiceCmd = undefined;
      await provider?.stop();
    }
    try {
      if (!this.ttsForcedProxy && canSpeakOnDevice()) {
        try {
          await speakOnDevice(text, this.speechLang);
          return;
        } catch (error) {
          console.warn('[tts] on-device readback failed, trying proxy', error);
        }
      }
      try {
        await speakText(this.ttsUrl, text);
      } catch (error) {
        console.warn('[tts] readback failed', error);
        this.flashFooter('Readback unavailable');
      }
    } finally {
      if (resumeVoice) {
        this.ttsSpeaking = false;
        if (this.voiceControl && !this.voiceCmd) {
          void this.startVoiceCmdProvider().then((ok) => {
            if (!ok) void this.disableVoiceControl('Voice control lost');
          });
        }
      }
    }
  }

  private async stopVoice(): Promise<void> {
    this.listening = false;
    this.dictating = false;
    this.voiceControl = false;
    this.voiceNoteActive = false;
    this.menuCard.voiceControlOn = false;
    await this.voiceCmd?.stop();
    this.voiceCmd = undefined;
    await this.webStt?.stop();
    this.webStt = undefined;
    this.sttSegments = [];
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
