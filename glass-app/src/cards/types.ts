import type { CardContent } from '../hud/composer';
import type { BoardStore } from '../sync/boardSync';

// A card is a pure projection: store state in, ≤5 body lines out.
// No SDK types, no side effects - unit-testable without any device.
export interface Card {
  id: string;
  render(store: BoardStore): CardContent;
}
