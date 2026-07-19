import type { GlassBridge, GlassInputEvent } from '../bridge/types';

// Deck-level input semantics, shared by touchpads and the R1 ring:
//   swipe fwd/back  -> next/previous card
//   tap             -> card context action (board card: jump to patient)
//   double tap      -> home (board card)
// Lifecycle events (foreground/exit) are routed to the app, not to cards.
export interface DeckActions {
  nextCard(): void;
  prevCard(): void;
  tap(): void;
  home(): void;
  setForeground(entered: boolean): void;
  exit(): void;
}

export function routeInput(bridge: GlassBridge, actions: DeckActions): () => void {
  return bridge.onInput((ev: GlassInputEvent) => {
    switch (ev.kind) {
      case 'swipeForward': actions.nextCard(); break;
      case 'swipeBack': actions.prevCard(); break;
      case 'tap': actions.tap(); break;
      case 'doubleTap': actions.home(); break;
      case 'foreground': actions.setForeground(ev.entered); break;
      case 'exit': actions.exit(); break;
    }
  });
}
