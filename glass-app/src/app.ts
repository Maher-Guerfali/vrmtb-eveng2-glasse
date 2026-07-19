import type { GlassBridge } from './bridge/types';
import { BoardCard } from './cards/boardCard';
import { PatientCard } from './cards/patientCard';
import type { Card } from './cards/types';
import { composePage } from './hud/composer';
import { ID_FOOTER, NAME_FOOTER } from './hud/layout';
import { routeInput } from './input/router';
import { watchWearState } from './privacy/wearGuard';
import type { BoardStore, BoardSync } from './sync/boardSync';

const NOTIFICATION_MS = 4_000;
const TIMER_REFRESH_MS = 30_000;

export class GlanceApp {
  private boardCard = new BoardCard();
  private patientCard = new PatientCard();
  private cards: Card[] = [this.boardCard, this.patientCard];
  private cardIndex = 0;

  private firstRender = true;
  private foreground = true;
  private lastFooter = '';
  private notifyTimer: ReturnType<typeof setTimeout> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private disposers: Array<() => void> = [];

  constructor(
    private bridge: GlassBridge,
    private store: BoardStore,
    private sync: BoardSync,
  ) {}

  async start(): Promise<void> {
    this.disposers.push(
      routeInput(this.bridge, {
        nextCard: () => this.switchCard(+1),
        prevCard: () => this.switchCard(-1),
        // Tap on the board card jumps straight to the active patient; on the
        // patient card it is reserved for P2/P3 actions (dictate, decide).
        tap: () => { if (this.cardIndex === 0) this.showCard(1); },
        home: () => this.showCard(0),
        setForeground: (entered) => { this.foreground = entered; if (entered) void this.render(); },
        exit: () => void this.dispose(),
      }),
      watchWearState(this.bridge, (blanked) => {
        this.patientCard.privacyBlanked = blanked;
        void this.render();
      }),
      this.store.onChange(() => void this.render()),
      this.store.onNotify((n) => this.flashFooter(`◦ ${n.text}`)),
    );

    // Elapsed-time / staleness refresh: full re-render is fine on this cadence
    // (30 s), and cheaper paths (textContainerUpgrade) exist if BLE profiling
    // in P0 says otherwise.
    this.tickTimer = setInterval(() => void this.render(), TIMER_REFRESH_MS);

    await this.render();
    await this.sync.start(this.store);
  }

  private switchCard(delta: number): void {
    this.showCard((this.cardIndex + delta + this.cards.length) % this.cards.length);
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
      cardIndex: this.cardIndex,
      cardCount: this.cards.length,
      offline: this.store.isStale(),
    });
    this.lastFooter = content.footer ?? '';
    await this.bridge.renderPage(page, this.firstRender);
    this.firstRender = false;
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
    await this.sync.stop();
    this.store.clear(); // PHI evaporates with the session
    await this.bridge.shutdown();
  }
}
