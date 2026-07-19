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
  app.ts                GlanceApp: menu-driven navigation, dictation orchestration, notification overlay
  bridge/
    types.ts            GlassBridge interface — the ONLY seam that knows about the SDK
    evenBridge.ts       real implementation over @evenrealities/even_hub_sdk
    mockBridge.ts       browser implementation: DOM "HUD" + simulated mic for dictation testing
    mirrorBridge.ts     composite bridge: renders to glasses AND phone screen (?mirror=1, for recordings)
  hud/
    layout.ts           display constants: 576×288, container budgets, row grid
    composer.ts         builds SDK page containers from card content; enforces
                        ≤8 text objects, truncation, header/footer convention,
                        and flags one container to capture touch input (§5)
  cards/
    types.ts            Card interface: id, render() → CardContent
    menuCard.ts          home screen: Board / Patient list / Back to patient / Forward details / Notes
    boardCard.ts         read-only meeting overview: agenda, presenter, elapsed, recording status
    patientListCard.ts   browse-then-commit patient picker: swipe moves a local cursor only,
                          tap commits the selection — browsing never changes what is "active"
    patientCard.ts       pseudonymized patient snapshot (2 pages: summary, history+board question)
    notesCard.ts         session voice notes (dictation results); never persisted on-device
  input/
    router.ts           touchpad/ring events → app-level tap/swipe/doubleTap/foreground/exit
  sync/
    protocol.ts         vrmtb.hud envelope + payload types (shared with dashboard)
    boardSync.ts        BoardSync interface + BoardStore (current state + listeners)
    mockSync.ts         static-by-default fake tumor board (?step=N to auto-advance)
    liveKitSync.ts      real client: token fetch → room join → vrmtb.hud + vrmtb.annotation
  stt/
    provider.ts          streaming SttProvider interface (future live captions, unused today)
    webSpeech.ts          browser Web Speech implementation of SttProvider (scaffolded, not wired)
    openAiProxy.ts       transcribePcm(): posts a finished recording's PCM to the local
                          transcription server, used by the actual dictation flow in app.ts
  voice/
    commands.ts          parses spoken phrases into app commands (scaffolded for hands-free
                          control, not wired into app.ts yet — see ROADMAP P3)
  privacy/
    wearGuard.ts         blanks patient card when isWearing=false / glasses in case (opt-in,
                          see §7 below — off by default during dev/demo, ?privacy=1 to enable)
tools/
  transcription-server.mjs        private LAN proxy: PCM → WAV → OpenAI transcription → JSON.
                                   Keeps OPENAI_API_KEY server-side, off the glasses bundle.
  start-transcription-server.ps1  interactive launcher: prompts for the key with hidden input
                                   (SecureString), never writes it to disk. See README "Voice notes".
```

Principles (mirroring what already worked in vrmtb-unity):

- **One file touches each external API.** `evenBridge.ts` is the only file that
  imports the Even SDK (like `DashboardBridge` is the only Vuplex file, and
  `VoiceManager` the only LiveKit file in Unity). SDK churn at v0.0.12 stays
  contained. Likewise `openAiProxy.ts` is the only client file that knows the
  transcription server's HTTP contract, and `transcription-server.mjs` is the
  only file anywhere that touches the OpenAI API.
- **Cards are pure-ish.** A card turns state into ≤5 lines of text; the
  composer turns lines into SDK containers. `patientListCard`/`patientCard`
  hold small local UI state (cursor position, detail page) that is separate
  from `BoardStore`'s synced state on purpose — browsing/paging must never
  mutate shared state until the wearer explicitly commits with a tap.
- **Mock-first.** Everything runs in a plain browser with the mock bridge and
  a static (by default) board, so the team can iterate on card design without
  glasses and demo over screen share. The mock bridge also simulates a
  granted mic so the dictation flow — including the real network call to the
  transcription server — is exercisable with no hardware.

## 5. Render strategy on the glasses

- First render of a card: `createStartUpPageContainer` (fresh page,
  ≤12 containers, ≤8 text, ≤4 image).
- Card switch: `rebuildPageContainer` (full-page swap).
- In-place value updates (timer tick, footer flashes): `textContainerUpgrade`
  on the changed container only — cheap over BLE, no page rebuild.
- Lifecycle: `FOREGROUND_EXIT` pauses rendering; `SYSTEM_EXIT` /
  `shutDownPageContainer` on meeting end.

**Root cause found on first real-device test: touch input needs a capture
container.** Early on-device testing showed the app rendering correctly but
never responding to any touchpad tap or swipe — the mock board's auto-advance
timer was the only thing that appeared to work, making the whole app *look*
autonomous. The actual cause: `TextContainerProperty.isEventCapture` must be
set on at least one rendered container, or the G2 OS never delivers touch
events to the app at all. `composer.ts` now flags the header container with
`captureInput: true` on every page; `evenBridge.ts` maps that to
`isEventCapture: 1`. Related device quirk also handled there: some Even App
versions deliver a tap as `sysEvent` with `eventType` present as normal, others
send it with `eventType` **undefined** on a `textEvent`/`sysEvent` carrying no
type at all — `evenBridge.ts` treats a source-bearing event with no type as an
implicit tap rather than dropping it.

## 6. Voice notes (implemented) and live captions (future)

**What's built:** push-to-talk dictation, not streaming captions. Tap on the
Patient card calls `bridge.setMic(true, 'glasses')`; while listening,
`onAudioPcm` chunks accumulate in `GlanceApp`. A second tap stops the mic,
joins the chunks, and calls `transcribePcm()` (`stt/openAiProxy.ts`), which
POSTs the raw PCM to a **private local server** (`tools/transcription-server.mjs`,
port 8788 on the dev PC's LAN IP). That server wraps the PCM as a WAV file and
calls OpenAI's `gpt-4o-transcribe`, returning `{ text }`. The result lands on
the Notes card and nowhere else — no persistence (see COMPLIANCE.md §2's
evaporation rule, which now also covers this text).

**Why a local server and not a direct client→OpenAI call:** the OpenAI API key
must never ship inside the glasses' JS bundle (it's a static asset anyone with
the `.ehpk` or dev-server URL could extract). The proxy keeps the key
server-side, in a process environment the key is typed into interactively
(`tools/start-transcription-server.ps1`, `Read-Host -AsSecureString`) — never
read from a plaintext file by a script or agent. This is a deliberate
human-in-the-loop step, not an oversight.

**PCM format is still unverified** (SDK 0.0.12 doesn't document sample
rate/depth for `audioEvent`); `transcription-server.mjs` assumes 16 kHz mono
16-bit and has produced coherent transcripts in on-device testing, which is
reasonable (if indirect) confirmation — revisit if transcripts come back
sped-up, slowed-down, or garbled.

**Live captions remain P2/future work**, using the still-scaffolded streaming
`SttProvider` interface (`stt/provider.ts`, `stt/webSpeech.ts`) instead of this
push-to-talk one-shot path. Vendor choice for real patient audio — self-hosted
vs. cloud — is unchanged from COMPLIANCE.md's original guidance and still
needs DPO sign-off; the OpenAI path above is explicitly a demo-speed choice,
not the recommended production default.

## 7. Failure modes

| Failure | Behavior |
|---|---|
| Wi-Fi/LiveKit drop | Card shows stale-data marker after 30 s without messages; auto-reconnect (LiveKit SDK) then full state arrives on next publish |
| BLE drop / glasses in case | Even App owns reconnect; `wearGuard` blanks PHI meanwhile |
| Dashboard not publishing `vrmtb.hud` yet | App stays functional on mock/demo data; sync source is a boot-time flag |
| Token service unreachable | Retry with backoff, HUD shows "offline" chip on Board card, no crash |
