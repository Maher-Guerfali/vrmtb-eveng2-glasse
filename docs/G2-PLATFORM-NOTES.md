# Even G2 platform notes (verified July 2026)

Facts below are split into **verified from the SDK package itself**
(`@evenrealities/even_hub_sdk` 0.0.12 — we inspected the shipped `index.d.ts`)
and **reported** (official marketing / community docs; re-verify on device).

## Hardware (reported)

- Dual monochrome **green micro-LED waveguide HUD**, ~**576×288 px per lens**,
  60 Hz (up from 20 Hz on G1), 1200 nits, display area +75 % vs G1.
- **4-microphone array** ("Hey Even" assistant), temple **touchpads** left+right.
- Optional **Even R1 ring** (touch/scroll input).
- **No camera. No speaker.** 35 g, magnesium/titanium frame. $599 (+$249 R1).
- Companion: **Even App** (phone). Apps ("plugins") install/run through it.

## Even Hub app model (verified from SDK + official docs)

- Apps are **standard web apps** (any framework; Vite/React/vanilla) using the
  TypeScript SDK. They run in a WebView inside the Even App
  (flutter_inappwebview); the SDK bridges to the host via `callHandler`, the
  host relays to the glasses over BLE.
- Dev loop: local dev server → **evenhub-simulator** for preview → **sideload
  via QR** on device → private build upload to the dev portal
  (hub.evenrealities.com).
- Launch sources: from the phone app menu or the glasses menu
  (`LaunchSource = 'appMenu' | 'glassesMenu'`).

## SDK 0.0.12 API surface (verified from `index.d.ts`)

Entry point: `waitForEvenAppBridge(): Promise<EvenAppBridge>` /
`EvenAppBridge.getInstance()`.

### Display

- `createStartUpPageContainer(CreateStartUpPageContainer)` — build a page.
  Budgets (protobuf-enforced): **containerTotalNum 1–12, ≤8 text objects,
  ≤4 image objects**.
- `rebuildPageContainer(RebuildPageContainer)` — replace the page.
- `textContainerUpgrade(TextContainerUpgrade)` — update one text container
  in place (cheap partial update).
- `updateImageRawData(ImageRawDataUpdate)` — raw (1-bit) image bytes;
  `ImageContainerProperty` width 20–288, height 20–144.
- Containers: `TextContainerProperty`, `ListContainerProperty` (+
  `ListItemContainerProperty` — native selectable list with item events),
  `ImageContainerProperty`. Coordinates: origin top-left, x → right, y → down.
  Z-order via `zOrderIndex` (validator exported by the SDK).
- `shutDownPageContainer(exitMode)` — 0 = exit now, 1 = user-confirmed exit.

### Input & events — `onEvenHubEvent(cb)`

- `listEvent` (`List_ItemEvent`): selected item name/index + event type.
- `textEvent` (`Text_ItemEvent`): container-level events.
- `sysEvent` (`Sys_ItemEvent`): `eventType` ∈ `OsEventTypeList` — `CLICK_EVENT`,
  `DOUBLE_CLICK_EVENT`, `SCROLL_TOP_EVENT`, `SCROLL_BOTTOM_EVENT`,
  `FOREGROUND_ENTER/EXIT`, `ABNORMAL_EXIT`, `SYSTEM_EXIT`, `IMU_DATA_REPORT`;
  `eventSource` ∈ {glasses right temple, glasses left temple, **R1 ring**};
  `imuData {x,y,z}`.
- `audioEvent` (`AudioEvent`): **raw PCM chunks** (`audioPcm: Uint8Array`) —
  see Audio below.

### Audio (the strategic one)

- `audioControl(isOpen, source)` with `AudioInputSource.Glasses | Phone` opens
  the mic and streams **PCM bytes into the web app** as `audioEvent`s.
- ⚠️ Sample rate / bit depth / channel count are **not documented in the
  types** — measure on device before wiring an STT vendor (community reports
  suggest 16 kHz mono 16-bit; verify).
- There is **no on-device/system STT API** — bring your own STT (Deepgram /
  Soniox / AssemblyAI / self-hosted Whisper). No speaker: audio out is
  impossible; design voice features as *input-only*.

### Device & system

- `onDeviceStatusChanged(cb)` → `DeviceStatus`: `connectType`, **`isWearing`**,
  `batteryLevel`, `isCharging`, **`isInCase`** — basis of our PHI auto-blank.
- `getDeviceInfo()` (glasses + ring model/firmware), `getUserInfo()`
  (Even account — usable for participant identity mapping).
- `imuControl(isOpen, reportFrq 100–1000 ms)` — head-motion reports.
- `setLocalStorage/getLocalStorage` — host-side KV (we do **not** store PHI here).
- App location APIs, pick/capture image from the **phone** (not glasses — the
  glasses have no camera).

## Design consequences for VR-MTB Glance

1. **Text-first UI**, hard budget of 8 text objects/page → the composer
   enforces a 7-object card template (header + 5 body + footer).
2. **Partial updates** via `textContainerUpgrade` for timers/captions — never
   rebuild the page per second over BLE.
3. **Mic = input only** → captions, dictation, AI queries. No calls.
4. **`isWearing`/`isInCase` are privacy sensors** → auto-blank PHI.
5. The web runtime means **livekit-client runs as-is** — the G2 app is a full
   member of the existing VR-MTB room (data channels for sure; audio publish
   is an experiment, not a promise).

## Sources

- Even Hub docs: https://hub.evenrealities.com/docs (overview, getting started)
- SDK: https://www.npmjs.com/package/@evenrealities/even_hub_sdk (0.0.12, types inspected directly)
- Product: https://www.evenrealities.com/smart-glasses
- Press: [TechCrunch on the camera-free bet](https://techcrunch.com/2026/07/11/smart-glasses-without-a-camera-even-realities-bets-productivity-beats-recording-everyone/), [Forbes G2 AI upgrade](https://www.forbes.com/sites/davidphelan/2026/03/26/even-g2-the-subtle-smart-glasses-just-got-a-major-ai-upgrade/)
- Community: [awesome-even-realities-g2](https://github.com/pangoleen/awesome-even-realities-g2) (display 576×288, LVGL v9, STT ecosystem, appsbridge)
