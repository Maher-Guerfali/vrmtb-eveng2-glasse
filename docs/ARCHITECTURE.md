# Architecture — how the G2 app joins the VR-MTB ecosystem

## 1. Where the code runs

An Even Hub app is a **web app running in a WebView inside the Even phone app**
(flutter_inappwebview host). The glasses are a BLE peripheral exposing:
display containers (text/list/image), input events (touchpad L/R, R1 ring,
IMU), microphone PCM, and device status. The WebView has normal network access,
so `fetch`, WebSocket, and the **LiveKit JS SDK** all work.

```
┌─ Even G2 glasses ─────────────┐        ┌─ Phone: Even App ──────────────────┐
│ 576×288 HUD  · touchpads      │  BLE   │  WebView: glass-app (this repo)    │
│ 4-mic array  · IMU            │◄──────►│  @evenrealities/even_hub_sdk       │
│ (no camera, no speaker)       │        │  livekit-client · fetch/WS         │
└───────────────────────────────┘        └───────────────┬────────────────────┘
                                                         │ WSS / HTTPS
                     ┌───────────────────────────────────┴───────────────┐
                     │                vrmtb-infra                        │
                     │  LiveKit server · voice-token service · AI · API  │
                     └──┬────────────────┬───────────────────┬──────────┘
                        │                │                   │
                  vr-mtb-web        vrmtb-unity        vrmtb-kotlin-glass
                  (dashboard)      (Quest 3 / AVP)         (Rokid)
```

## 2. Reuse of the existing contract

The ecosystem already shares one LiveKit room (dev room `tb-dev`) with:

- **Voice**: Unity `VoiceManager`, Rokid app, and dashboard publish/subscribe audio.
- **Data**: topic `vrmtb.annotation` syncs 3D annotation add/remove/clear
  (`AnnotationSyncService` in Unity rides on `VoiceManager`'s data channel).
- **Tokens**: Node `voice-token` service (`vrmtb-infra/services/voice-token`,
  dev: `http://<host>:8787/api/voice/token`) — same key pair for every client.
- **Dashboard bridge contract** (`src/bridge/unityBridge.ts` in vr-mtb-web):
  events like `ActivePatientChanged`, `OpenStudyRequested`, `DecisionRequested`,
  `RecordActionRequested`; panels Agenda / Patient / AI / Record / Text.

The G2 app becomes the **fourth LiveKit client**: fetch a token, join the room,
subscribe to data topics. No new transport, no new auth path.

## 3. One new topic: `vrmtb.hud`

The glasses need a *curated, tiny* projection of board state — not the raw
dashboard events. We introduce one data-channel topic, published by the
dashboard (small addition to vr-mtb-web, which already owns agenda + active
patient state):

```jsonc
// topic "vrmtb.hud" — every message is one envelope, ≤ a few hundred bytes
{ "v": 1, "type": "board",   "payload": { /* HudBoardState */ } }
{ "v": 1, "type": "patient", "payload": { /* HudPatientSummary */ } }
{ "v": 1, "type": "notify",  "payload": { /* HudNotification */ } }
{ "v": 1, "type": "decision","payload": { /* HudDecisionPrompt */ } }
```

TypeScript definitions live in `glass-app/src/sync/protocol.ts` and are written
to be copy-shareable with vr-mtb-web (same field names as the dashboard's
existing bridge events where they overlap). Design rules:

- **Publisher curates, HUD renders.** The dashboard decides *what* the glasses
  may see (pseudonymized snapshot fields only); the glass app only fits it into
  576×288. PHI minimization happens at the publisher, not the wearable.
- **Full-state messages, not diffs.** Each `board`/`patient` message is the
  complete current state so a glass client that joins late (or reconnects after
  BLE/Wi-Fi drop) is correct after one message. The dashboard re-publishes
  state on participant join.
- **Versioned envelope** (`v: 1`) so the dashboard and glasses can evolve
  independently.

Why not reuse `vrmtb.annotation`? Different producer, different consumer set,
different privacy profile — a topic is free, mixing concerns is not. The G2 app
does additionally *subscribe* to `vrmtb.annotation` in P1 purely to surface
"annotation added by <identity>" notifications.

## 4. Inside `glass-app/`

```
src/
  main.ts               boot: detect real bridge vs browser, pick sync source, start app
  app.ts                GlanceApp: card deck, active card, render loop, notification overlay
  bridge/
    types.ts            GlassBridge interface — the ONLY seam that knows about the SDK
    evenBridge.ts       real implementation over @evenrealities/even_hub_sdk
    mockBridge.ts       browser implementation: renders containers into a DOM "HUD"
  hud/
    layout.ts           display constants: 576×288, container budgets, row grid
    composer.ts         builds SDK page containers from card content; enforces
                        ≤8 text objects, truncation, header/footer convention
  cards/
    types.ts            Card interface: id, title, render() → CardContent
    boardCard.ts        live agenda card
    patientCard.ts      pseudonymized patient snapshot card
  input/
    router.ts           touchpad/ring events → next/prev card, tap, double-tap
  sync/
    protocol.ts         vrmtb.hud envelope + payload types (shared with dashboard)
    boardSync.ts        BoardSync interface + BoardStore (current state + listeners)
    mockSync.ts         scripted fake tumor board for the browser preview
    liveKitSync.ts      real client: token fetch → room join → vrmtb.hud + vrmtb.annotation
  stt/
    provider.ts         SttProvider interface + NullSttProvider (P2: Deepgram/Soniox/Whisper impls)
  privacy/
    wearGuard.ts        blanks patient card when isWearing=false / glasses in case
```

Principles (mirroring what already worked in vrmtb-unity):

- **One file touches each external API.** `evenBridge.ts` is the only file that
  imports the Even SDK (like `DashboardBridge` is the only Vuplex file, and
  `VoiceManager` the only LiveKit file in Unity). SDK churn at v0.0.12 stays
  contained.
- **Cards are pure.** A card turns state into ≤7 lines of text; the composer
  turns lines into SDK containers. Cards are unit-testable without any device.
- **Mock-first.** Everything runs in a plain browser with the mock bridge and
  scripted board, so the team can iterate on card design without glasses and
  demo over screen share.

## 5. Render strategy on the glasses

- First render of a card: `createStartUpPageContainer` (fresh page,
  ≤12 containers, ≤8 text, ≤4 image).
- Card switch: `rebuildPageContainer` (full-page swap).
- In-place value updates (timer tick, caption lines): `textContainerUpgrade`
  on the changed container only — cheap over BLE, no page rebuild.
- Lifecycle: `FOREGROUND_EXIT` pauses sync rendering; `SYSTEM_EXIT` /
  `shutDownPageContainer` on meeting end.

## 6. Speech-to-text (P2) — abstracted now, decided later

`SttProvider` is an interface: `start(source) → stream of {text, isFinal}`,
fed by `audioControl(true, Glasses|Phone)` PCM events. Three candidate
implementations, chosen with the DPO before the pilot (see COMPLIANCE.md):

1. **Cloud streaming** (Deepgram/Soniox, EU region + DPA) — best latency/quality, fastest to build.
2. **Self-hosted Whisper** (faster-whisper on the university server) — best data residency, more ops.
3. **Phone-side fallback** — if BLE PCM proves unreliable, `AudioInputSource.Phone` uses the phone mic with zero code change elsewhere.

## 7. Failure modes

| Failure | Behavior |
|---|---|
| Wi-Fi/LiveKit drop | Card shows stale-data marker after 30 s without messages; auto-reconnect (LiveKit SDK) then full state arrives on next publish |
| BLE drop / glasses in case | Even App owns reconnect; `wearGuard` blanks PHI meanwhile |
| Dashboard not publishing `vrmtb.hud` yet | App stays functional on mock/demo data; sync source is a boot-time flag |
| Token service unreachable | Retry with backoff, HUD shows "offline" chip on Board card, no crash |
