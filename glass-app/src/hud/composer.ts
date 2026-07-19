// Turns abstract card content into a HUD page while enforcing the G2's hard
// budgets (8 text objects; we use a 7-object template). Every truncation
// decision lives here so cards stay pure "state -> lines" functions.

import type { HudPage, HudTextBox } from '../bridge/types';
import {
  BODY_Y,
  FOOTER_H,
  FOOTER_Y,
  HEADER_H,
  HEADER_Y,
  HUD_WIDTH,
  ID_BODY_FIRST,
  ID_FOOTER,
  ID_HEADER,
  MAX_BODY_LINES,
  MAX_LINE_CHARS,
  NAME_FOOTER,
  NAME_HEADER,
  PADDING_X,
  ROW_H,
  nameBody,
} from './layout';

export interface CardContent {
  title: string;
  lines: string[];
  footer?: string;
}

export function fitLine(text: string, max = MAX_LINE_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export interface ComposeContext {
  cardIndex: number;
  cardCount: number;
  offline?: boolean;
}

export function composePage(content: CardContent, ctx: ComposeContext): HudPage {
  const texts: HudTextBox[] = [];
  const w = HUD_WIDTH - PADDING_X * 2;

  const deckPos = ctx.cardCount > 1 ? `  ·  ${ctx.cardIndex + 1}/${ctx.cardCount}` : '';
  const offline = ctx.offline ? '  · offline' : '';
  texts.push({
    id: ID_HEADER,
    name: NAME_HEADER,
    x: PADDING_X,
    y: HEADER_Y,
    w,
    h: HEADER_H,
    content: fitLine(`${content.title}${deckPos}${offline}`),
    // G2 click events are delivered reliably only to a rendered text object.
    captureInput: true,
  });

  content.lines.slice(0, MAX_BODY_LINES).forEach((line, row) => {
    texts.push({
      id: ID_BODY_FIRST + row,
      name: nameBody(row),
      x: PADDING_X,
      y: BODY_Y + row * ROW_H,
      w,
      h: ROW_H,
      content: fitLine(line),
    });
  });

  // The footer container is always present (even empty) so notification
  // overlays can target a stable container id with textContainerUpgrade
  // instead of forcing a page rebuild over BLE.
  texts.push({
    id: ID_FOOTER,
    name: NAME_FOOTER,
    x: PADDING_X,
    y: FOOTER_Y,
    w,
    h: FOOTER_H,
    content: fitLine(content.footer ?? ''),
  });

  return { texts };
}
