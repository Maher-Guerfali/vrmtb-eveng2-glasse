// Physical HUD geometry and the container budget of the Even G2.
// Sources: SDK 0.0.12 protobuf limits (verified from its .d.ts) and the
// community-reported 576x288 logical canvas - re-measure on device (P0).

export const HUD_WIDTH = 576;
export const HUD_HEIGHT = 288;

// Protobuf-enforced page budgets (CreateStartUpPageContainer / RebuildPageContainer).
export const MAX_TEXT_OBJECTS = 8;
export const MAX_CONTAINERS = 12;

// Card template: header + up to 5 body rows + footer = 7 text objects,
// which leaves one object of headroom under the budget of 8.
export const MAX_BODY_LINES = 5;

export const PADDING_X = 8;
export const HEADER_Y = 0;
export const HEADER_H = 36;
export const BODY_Y = 44;
export const ROW_H = 40;
export const FOOTER_Y = HUD_HEIGHT - 36;
export const FOOTER_H = 36;

// Conservative guess for how many characters fit one row at the OS default
// font; the glasses' LVGL renderer wraps/clips, it does not scroll. Tune on
// device and keep every truncation decision behind fitLine().
export const MAX_LINE_CHARS = 44;

// Stable container IDs per slot. Card switches rebuild the page with the SAME
// ids so partial updates (textContainerUpgrade) can always target a slot.
export const ID_HEADER = 1;
export const ID_BODY_FIRST = 2; // body rows occupy 2..6
export const ID_FOOTER = 7;
export const ID_INPUT_CAPTURE = 8;

export const NAME_HEADER = 'hdr';
export const NAME_FOOTER = 'ftr';
export const NAME_INPUT_CAPTURE = 'input-capture';
export const nameBody = (row: number): string => `b${row}`;
