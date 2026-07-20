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
                     │       vr-mtb-web/backend (Express + TS)           │
                     │  rooms/join · session · MCP server                │
                     └──┬────────────────┬───────────────────┬──────────┘
                        │                │                   │
                  vr-mtb-web         livekit-server    vrmtb-unity /
                  (dashboard)      (self-hosted SFU)  vrmtb-kotlin-glass
```

(There is no separate "vrmtb-infra" repo — that name in older Unity code
comments refers to this same backend, which lives inside vr-mtb-web/backend
and is what both Unity's legacy `/api/voice/token` calls and this app's real
integration below actually hit, confirmed by matching port 8787 and endpoint
path. Corrected here after actually reading vr-mtb-web's source — see §2.)

## 2. Reuse of the existing contract (verified against vr-mtb-web's real source, not assumed)

**Revision note:** this section originally proposed a new `vrmtb.hud` LiveKit
topic that vr-mtb-web would need to implement. After actually reading that
repo (cloned locally, `backend/` + `app/src/realtime|commands|domain`), that
topic turned out to be unnecessary — everything a HUD needs already exists.
The section below describes the real system as found, and §3 explains why
the glass app targets it directly instead.

vr-mtb-web is a React + Vite dashboard with its own Express backend
(`backend/`), **not** the simpler fixed-single-room design earlier drafts of
this doc assumed:

- **Room join**: `POST /api/rooms/join {roomCode, identity, displayName}` →
  `{url, token, roomId, isHost}`. Idempotent — creates the room on first
  join, that caller becomes host. (The `GET /api/voice/token` endpoint still
  exists but is explicitly legacy/dev-only — no room registry, no host
  detection.)
- **Session/patient data**: `GET /api/session` returns the full session +
  patient list (Zod schema, `app/src/domain/schema.ts`) — **including PHI**
  (`patient.name`, `patient.dob`). `PATCH /api/session/active-patient
  {patientId, roomId?}` sets it server-side and, if `roomId` is given,
  broadcasts the change live.
- **Room data channel**: two topics, `RoomDataMessage` in
  `app/src/realtime/types.ts` — `{topic:'activePatient', patientId}` and the
  generic `{topic:'command', command, args?}` envelope. `command` is how the
  dashboard's own Web Speech voice commands (`app/src/commands/registry.ts`:
  `selectPatient`, `nextPatient`, `previousPatient`, `switchPanel`, …) and an
  MCP server (`backend/src/mcp/server.ts`, `send_command` tool) already
  control every connected dashboard identically — "a doctor said 'mute'"
  and "an LLM told the room to mute" are indistinguishable to a receiver.
- **No fixed dev room, no separate token-service key pair** — each `roomCode`
  is created on demand by whoever joins it first.

## 3. The G2 app is a fifth client, speaking this protocol directly

No changes to vr-mtb-web were made or are needed. `glass-app/src/sync/liveKitSync.ts`:

1. Calls `POST /api/rooms/join` itself (same call the dashboard makes).
2. Fetches `GET /api/session` once connected, and **immediately narrows it**
   to `HudPatientSummary` (`protocol.ts`) — this mapping function is the one
   place in glass-app allowed to see `name`/`dob`, and must never let them
   reach the store. This is a stricter promise than the dashboard's own (a
   personal wearable has a different loss/glance-over-shoulder risk than a
   locked workstation) — see COMPLIANCE.md §2.
3. Subscribes to the room data channel and reacts to `activePatient` and
   `command` (`selectPatient`/`nextPatient`/`previousPatient`) messages —
   the exact same messages a doctor's spoken command or the dashboard UI
   already produces.
4. **Writes back**: when the wearer taps to select a patient on the glasses,
   `sendCommand('selectPatient', {patientId})` calls the same
   `PATCH /api/session/active-patient` the dashboard would, so the choice is
   server-authoritative and reaches every client, not just currently-open
   ones. The G2 is a full participant, not a read-only mirror.

`protocol.ts`'s `HudPatientSummary` was also generalized to match
vr-mtb-web's actual (disease-agnostic) patient schema — `dx` / `conditions` /
`labs` / `allergies` — rather than the breast-cancer-specific TNM/receptor
fields this doc originally invented before the real schema was available to
read. `MockSync`'s demo data uses the identical shape, so there is exactly
one patient-summary model whether driven by the scripted demo or the real
backend.

`vrmtb.annotation` (Unity's 3D-annotation topic) is a separate concern with a
different producer/consumer set and isn't part of this integration; revisit
only if a future card wants to surface "annotation added by…" notifications.

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
    menuCard.ts          home screen: Board / Patient list / Back to patient / Forward details /
                          Notes / Captions / Voice control / Talk (LiveKit) - the last two show
                          a live (on)/(off)/(live) suffix reflecting app.ts's actual state
    boardCard.ts         read-only meeting overview: agenda, presenter, elapsed + per-case clock,
                          recording status
    patientListCard.ts   browse-then-commit patient picker: swipe moves a local cursor only,
                          tap commits the selection — browsing never changes what is "active"
    patientCard.ts       pseudonymized patient snapshot (2 pages: summary, history+board question)
    notesCard.ts         session voice notes (dictation + hands-free "note"/"decision" results);
                          never persisted on-device
    captionsCard.ts      rolling word-wrapped transcript of everything the voice-control stream
                          hears; session-only, cleared with notes on exit
    talkCard.ts           status-only view of live LiveKit voice (see §7) - app.ts owns the
                          actual publish/mute call since it must coordinate with dictation and
                          voice-control mic ownership, which span more than one card
  input/
    router.ts           touchpad/ring events → app-level tap/swipe/doubleTap/foreground/exit
  sync/
    protocol.ts         HudBoardState/HudPatientSummary/HudNotification types - populated by
                         either MockSync's scripted demo or LiveKitSync against the real backend
    boardSync.ts        BoardSync interface (+ TalkStatus type) and BoardStore (current state +
                         listeners); setBoard/setPatient/notify/selectActiveCase are direct calls,
                         not a parsed wire envelope - there's nothing generic to decode
    mockSync.ts         static-by-default fake tumor board (?step=N to auto-advance)
    liveKitSync.ts       real client: vr-mtb-web's actual REST + LiveKit protocol (§2-3), plus
                          live mic publish/status for the Talk card (§7)
  stt/
    provider.ts          streaming SttProvider interface (segment-by-segment; both dictation
                          engines and hands-free voice control implement it)
    webSpeech.ts          Web Speech (SpeechRecognition) implementation - the on-device, standalone,
                          default engine for both dictation and hands-free voice control
    openAiProxy.ts       transcribePcm(): posts a finished glasses-mic PCM recording to the local
                          transcription server's /api/transcribe - the higher-accuracy fallback
                          path (?stt=proxy), used when the WebView lacks SpeechRecognition
  tts/
    webSpeech.ts          on-device readback via the phone's speechSynthesis - default engine
    openAiProxy.ts       speakText(): posts to the local server's /api/tts (OpenAI
                          gpt-4o-mini-tts) - the higher-quality fallback path (?tts=proxy)
  voice/
    commands.ts          parses spoken phrases (English + German) into app commands - wired into
                          app.ts's hands-free "Voice control" mode; unit-tested (commands.test.ts)
  privacy/
    wearGuard.ts         blanks patient card AND kills any active voice-control listening when
                          isWearing=false / glasses in case (opt-in, see §8 below - off by default
                          during dev/demo, ?privacy=1 to enable)
tools/
  transcription-server.mjs        private LAN proxy: /api/transcribe (PCM → WAV → OpenAI
                                   transcription) and /api/tts (text → OpenAI TTS → audio).
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

## 6. Speech: dictation, hands-free control, captions, and readback (all implemented)

Two independent axes, easy to conflate but genuinely separate:

**Engine (where speech-to-text/text-to-speech actually runs):**
- **On-device (default, standalone)**: the phone's own `SpeechRecognition` /
  `speechSynthesis` — zero network, zero key, works out of a packaged
  `.ehpk` install with nothing else running. `stt/webSpeech.ts` /
  `tts/webSpeech.ts`.
- **OpenAI proxy (`?stt=proxy` / `?tts=proxy`, higher accuracy)**: audio goes
  to the local `transcription-server.mjs` (`/api/transcribe`, `/api/tts`),
  which calls OpenAI. Same key-never-in-the-bundle reasoning as before — the
  key is typed interactively into `start-transcription-server.ps1`
  (`Read-Host -AsSecureString`), never read from a plaintext file by any
  script or agent. `stt/openAiProxy.ts` / `tts/openAiProxy.ts`.
  Auto-fallback: if the WebView lacks `SpeechRecognition`, dictation drops to
  the proxy path automatically even without `?stt=proxy`.

**Mode (what the transcribed text is used for) — all implemented in `app.ts`:**
- **Tap-driven dictation**: tap the Patient card to start, tap again to
  save — one finished note per session.
- **Hands-free voice control** (Menu → Voice control): one continuous
  recognition stream parses commands via `voice/commands.ts`
  (`parseVoiceCommand`, English + German, unit-tested) — *"open board"*,
  *"next/previous patient"* (broadcasts room-wide exactly like a dashboard
  voice command), *"take a note"* / *"note 〈text〉"*, *"decision 〈text〉"*
  (a starred, case-tagged note — local-only until vr-mtb-web grows a write
  API), *"read notes"*, *"stop"*. Unknown speech is silently ignored on
  purpose — ambient meeting conversation must never trigger anything.
  Auto-restarts on the engine's spontaneous silence-timeout end, with a
  flap-guard (3 rapid restarts = give up, not loop forever); readback pauses
  listening first so the mic never transcribes its own TTS.
- **Captions** (Menu → Captions): every segment the voice-control stream
  hears — commands and ambient dictation both — is pushed into
  `captionsCard.ts` as a rolling, word-wrapped transcript. Session-only,
  cleared with notes on exit (PHI-adjacent, same evaporation rule as
  COMPLIANCE.md §2).
- **Readback**: after a note/decision saves, it's spoken back — through the
  **phone's** speaker, since the G2 has none. `?tts=0` disables it.

**PCM format for the proxy path is still unverified** (SDK 0.0.12 doesn't
document sample rate/depth for `audioEvent`); `transcription-server.mjs`
assumes 16 kHz mono 16-bit and has produced coherent transcripts in on-device
testing — reasonable if indirect confirmation, revisit if transcripts come
back sped-up, slowed-down, or garbled.

Vendor choice for real patient audio is unchanged from COMPLIANCE.md's
original guidance and still needs DPO sign-off before real use, regardless of
engine: the phone's own OS speech recognizer may itself call a vendor speech
service, and the OpenAI proxy path is explicitly a demo-speed choice, not the
recommended production default (self-hosted Whisper is).

## 7. Live voice ("Talk") — genuine two-way WebRTC audio, not STT/TTS

Menu → Talk (LiveKit) publishes the wearer's live microphone into the room so
**other participants actually hear them talk in real time** — this is a
different thing from everything in §6, which only ever moves finished text.
`liveKitSync.ts`'s `setMicPublished()` calls
`room.localParticipant.setMicrophoneEnabled()` — the exact API vr-mtb-web's
own `livekitChannel.ts` uses for the dashboard's mic button, so the G2
behaves as an ordinary room participant, not a special case.

**This publishes the phone's microphone, not the glasses'.** `setMicrophoneEnabled`
captures via the WebView's standard `getUserMedia`, a browser API - the G2's
own mic only ever streams out through the SDK's separate custom PCM/
`audioControl` channel (used for dictation in §6), which is not a standard
Web Audio input device and so isn't what WebRTC captures from inside this
WebView. Bridging the glasses' own PCM into a published track would need a
Web Audio bridge (`AudioContext` + `MediaStreamAudioDestinationNode`) feeding
a synthetic `MediaStreamTrack` - not implemented; a real candidate follow-up
once phone-mic publish itself is verified working on device, since it
answers the ROADMAP P3 question ("can the G2 replace the Rokid for
speak-only participants?") more directly.

**Mic ownership is exclusive across three features** (Talk, tap-dictation's
on-device path, and hands-free voice control) because all three can end up
wanting the same phone microphone hardware. `app.ts` enforces one-stream-at-
a-time in both directions: starting Talk stops dictation/voice-control
first (`toggleTalk()`), and starting on-device dictation drops a live Talk
publish first (`dropTalkForMic()`, called from `startDeviceDictation()`'s
call site and from `toggleVoiceControl()`). The proxy dictation path is
exempt from this — it streams the glasses' own separate PCM channel, not
`getUserMedia`, so it can't actually contend with Talk regardless.

Not available against `MockSync` (`getTalkStatus`/`setMicPublished` are
optional on `BoardSync`) - the Talk card shows why rather than a dead button.
Not yet hand-tested against a live vr-mtb-web backend + LiveKit server (built
and verified in the browser mock preview only, where the fallback path is
what's actually exercised).

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Wi-Fi/LiveKit drop | Card shows stale-data marker after 30 s without messages; auto-reconnect (LiveKit SDK) then full state arrives on next publish |
| BLE drop / glasses in case | Even App owns reconnect; `wearGuard` blanks PHI and kills active voice-control listening meanwhile |
| vr-mtb-web backend unreachable | App stays functional on mock/demo data; sync source is a boot-time flag (`?sync=livekit` vs. default) |
| Transcription/TTS proxy unreachable | Dictation/readback fail gracefully with a footer message ("Server unreachable" / "Readback unavailable"), never a crash; on-device engines are unaffected since they don't need the proxy |
| Talk mic permission denied | `setMicPublished` returns false, footer shows "Mic permission denied", card stays in the off state |
