# VR-MTB Glance — Even G2 companion app for the virtual Multidisciplinary Tumor Board

Part of the **VR-MTB** project (Deggendorf Institute of Technology): a virtual
breast-cancer tumor board where clinicians from different disciplines meet
remotely, onsite, or hybrid — talk to each other, review patient data, annotate
3D DICOM volumes, take notes, chat, and ask AI.

This repository adds a **fourth client** to the VR-MTB ecosystem: a companion
app for the **Even Realities G2** smart glasses.

| Client | Device | Role in the board |
|---|---|---|
| [vrmtb-unity](https://github.com/Maher-Guerfali/vrmtb-unity) | Quest 3 / Vision Pro | Immersive station: 3D volume viewer, embedded dashboard |
| [vr-mtb-web](https://github.com/Maher-Guerfali/vr-mtb-web) | Browser / embedded WebView | Dashboard: agenda, patient data, AI, notes, chat |
| [vrmtb-kotlin-glass](https://github.com/Maher-Guerfali/vrmtb-kotlin-glass) | Rokid AI glasses | Voice participant (mic + camera, RAM-constrained) |
| **this repo** | **Even G2** | **Silent, glanceable HUD: agenda, patient snapshot, voice-dictated notes, decisions** |

## Why the G2 fits this project

The G2 has **no camera and no speaker** — in a hospital meeting room that is a
feature, not a limitation. It is a private, silent second screen (576×288
monochrome HUD per lens, 4-mic array, touchpad + optional R1 ring) worn by the
doctor **in the room or on the move** — the person who will never wear a Quest
during a board. The app itself is a plain **TypeScript web app** running in the
Even phone app's WebView, which means it can join the **same LiveKit room**
(`voice + data channels`) that the Unity client, the dashboard, and the Rokid
app already share. The glasses become a live participant with almost no new
backend.

## Documents

| Doc | What's in it |
|---|---|
| [docs/STRATEGY.md](docs/STRATEGY.md) | Product strategy: personas, the "Glance card" concept, feature phases, risks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and how the G2 app plugs into the existing LiveKit/dashboard contract |
| [docs/G2-PLATFORM-NOTES.md](docs/G2-PLATFORM-NOTES.md) | Verified hardware + Even Hub SDK facts (API surface of `@evenrealities/even_hub_sdk` 0.0.12) |
| [docs/COMPLIANCE.md](docs/COMPLIANCE.md) | GDPR / MDR posture for patient data on a wearable HUD |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases P0–P3 with acceptance criteria |
| [docs/presentation/](docs/presentation/vrmtb-glance-deck.html) | Point-by-point slide deck: problem, device, every shipped feature with real screenshots, architecture, compliance, roadmap |

## App scaffold (`glass-app/`)

A buildable Even Hub plugin (Vite + TypeScript + `@evenrealities/even_hub_sdk`):

```
cd glass-app
npm install
npm run dev        # browser preview with a simulated 576×288 HUD + scripted mock board
npm run build      # type-checks and bundles for sideloading / Even Hub dev portal
```

- **In the browser** (no glasses needed): a mock bridge renders the HUD pages
  into a green-on-black preview canvas. Arrow keys = touchpad swipes, Enter =
  tap, Backspace = double-tap. The mock also simulates a granted microphone
  (silent placeholder audio) so the full dictation flow — including the real
  network call to the transcription server — is testable with no hardware.
- **On device**: the same code detects the real Even App bridge and renders to
  the glasses. Sideload via QR from the [Even Hub dev portal](https://hub.evenrealities.com/).
- **Navigation** is menu-driven, not a single swipe-through deck — the **Menu**
  card (home) opens **Board** (read-only meeting overview), **Patient list**
  (swipe to browse, tap to open — browsing never changes what's on anyone
  else's screen until you commit with a tap), **Patient** (diagnosis, flagged
  labs, allergies; swipe for a second page of conditions + the board's
  question), and **Notes** (session voice notes). Double-tap from almost
  anywhere returns to the menu.
- **Voice notes**: from the Patient card, tap once to start recording (glasses
  mic), tap again to stop and transcribe — see "Voice notes" below.
- **Voice control (hands-free)**: toggle from the Menu card. One continuous
  on-device listener parses commands — *"open board"*, *"open patient list"*,
  *"open patient"*, *"open notes"*, *"next patient"* / *"previous patient"*
  (broadcast room-wide exactly like the dashboard's own voice commands),
  *"take a note"* (then dictate; *"stop"* saves), *"note 〈text〉"*,
  *"decision 〈text〉"* (saved as a starred, case-tagged note),
  *"read notes"* (spoken back via the phone), and *"stop"* to end the mode.
  Unknown speech is deliberately ignored — ambient meeting talk must never
  trigger anything. If the phone's engine dies (silence timeout), listening
  restarts itself; readback pauses listening so the mic never hears its own
  TTS.
- **Live board awareness**: when someone else moves the board to another
  case, the footer flashes the new case label; the Board card's status row
  carries a per-case elapsed clock (resets only on a real case switch).
- **Captions**: Menu → Captions (or say *"start captions"* /
  *"starte die Untertitel"*) shows a rolling, word-wrapped live transcript
  of everything the voice-control stream hears — session-only, cleared on
  exit like notes.
- **Talk (live voice, `?sync=livekit` only)**: Menu → Talk (LiveKit) → tap to
  publish the phone's mic into the real LiveKit room, so other participants
  hear the G2 wearer speak live — this is genuine two-way WebRTC audio,
  distinct from dictation/captions (which only ever move finished text).
  Tap again to mute. Only one mic-using stream runs at a time: starting Talk
  stops dictation/hands-free voice control and vice versa. Not available
  against the mock/demo board (shows why on the card). See ARCHITECTURE.md §7
  for why this publishes the **phone's** mic, not the glasses' own PCM.
- **Live sync**: `src/sync/liveKitSync.ts` talks to the **real** vr-mtb-web
  backend directly — `POST /api/rooms/join`, `GET /api/session`, and the same
  LiveKit `activePatient`/`command` data-channel topics the dashboard's own
  voice commands and MCP server use. No changes to vr-mtb-web are needed;
  selecting a patient on the glasses even broadcasts back to every connected
  dashboard via the same path the dashboard's own UI uses (see ARCHITECTURE.md
  §2-3). Enable with `?sync=livekit&backend=http://host:8787&room=MTB-DEV`.
  Until then the app runs on the static mock board (see URL params below).

### URL params (no rebuild needed)

| Param | Effect |
|---|---|
| `?bridge=mock` | Force the browser HUD preview even inside the Even App (phone-screen debugging) |
| `?mirror=1` | Render to the glasses **and** the phone screen at once — see "Recording a demo" |
| `?step=<seconds>` | Auto-advance the mock board's active case every N seconds (off by default — the board stays still until you navigate it) |
| `?privacy=1` | Enable wear-state PHI blanking (off by default during dev/demo — see COMPLIANCE.md) |
| `?lang=<bcp47>` | Speech language for dictation, voice control, and readback (e.g. `?lang=de-DE`); defaults to the phone's UI language. Voice commands themselves are understood in **English and German** in any engine language |
| `?stt=proxy` | Force dictation through the local OpenAI proxy (glasses mic → PC server). Default is the phone's own speech engine — no PC, no key |
| `?transcribe_url=<url>` | Point proxy dictation at a server other than the default `http://192.168.178.65:8788/api/transcribe` |
| `?tts=0` | Disable the spoken note readback (on by default; plays on the **phone** — the G2 has no speaker) |
| `?tts=proxy` | Force readback through the proxy's OpenAI TTS instead of the phone's built-in speech synthesis |
| `?tts_url=<url>` | Point proxy readback at a TTS endpoint other than `<transcribe server>/api/tts` |
| `?sync=livekit&backend=<url>&room=<code>&identity=<id>&name=<display>` | Use the real vr-mtb-web backend/room instead of mock data — also unlocks the Talk (LiveKit) live-voice card |

## Installing on the glasses (QR sideload)

1. **Phone (once):** in the Even Realities App, enable developer/Prototype
   mode: Even Hub → top-right icon → *My plugin* → tap your name → enable
   *Prototype mode*. Same account as [hub.evenrealities.com](https://hub.evenrealities.com/).
2. **PC:** `cd glass-app && npm install && npm run dev` — the server binds to
   your LAN, note the `Network:` URL Vite prints (e.g. `http://192.168.178.x:5190`).
   Phone and PC must be on the same Wi-Fi.
3. **QR:** encode that URL as a QR code — Even Hub CLI
   (`evenhub qr --url "http://192.168.178.x:5190"`, see the
   [CLI docs](https://hub.evenrealities.com/docs/reference/cli)) or any QR
   generator; the QR simply contains the URL.
4. **Sideload:** Even App → *Developer Center* → built-in scanner → scan.
   The plugin syncs to the G2 and appears in the glasses menu, with hot reload
   on every save — this is the fast loop for iterating on the app yourself.

### Installing on the glasses (import package — for sharing with teammates)

QR sideload needs *your* PC running and reachable on the *same Wi-Fi* as the
phone — fine for you, awkward for handing the app to a colleague. For that,
build a standalone `.ehpk` package instead: no dev server, no shared network,
just a file.

1. `cd glass-app && npm run pack` — builds and produces `vrmtb-glance.ehpk`
   (uses [`@evenrealities/evenhub-cli`](https://www.npmjs.com/package/@evenrealities/evenhub-cli)
   `pack`, reading `app.json` — see [CLI docs](https://hub.evenrealities.com/docs/reference/cli)).
2. On [hub.evenrealities.com](https://hub.evenrealities.com/), open **Import
   package** and upload `vrmtb-glance.ehpk`.
3. Your teammate's Even App installs it from their account like any other
   Even Hub app — no QR, no shared Wi-Fi needed afterward.

Note: a packaged install launches with no URL query params, so it always runs
on the static mock board (see below) rather than live LiveKit sync. Dictation
and readback still work from a packaged install — by default they run on the
phone's own speech engines, so no PC, no API key, and no server are needed at
all (see "Voice notes" below).

The app ships with **static demo data** (three invented breast-cancer cases in
`src/sync/mockSync.ts`) and needs no backend for navigation: ideal for screen
recordings. `?step=25` auto-advances the board case every 25 s if you want a
hands-off demo; `?bridge=mock` forces the browser preview even inside the Even
App.

## Voice notes (dictation)

Tap once on the Patient card to start dictating, tap again to save the note.
Two engines, chosen automatically:

- **On-device (default, standalone):** the phone's own Web Speech engine
  transcribes as you talk — recognized phrases appear live in the Notes
  draft. **No PC, no API key, no server of ours.** This is what a packaged
  `.ehpk` install uses in the field. (Heads-up: the phone OS's speech
  engine may itself call its vendor's speech service — see COMPLIANCE.md §3
  before real patient audio.) If the Even App's WebView doesn't expose
  speech recognition, the app falls back to the proxy path automatically.
- **OpenAI proxy (`?stt=proxy`, higher accuracy):** the glasses-mic
  recording is sent to a small **private, local transcription server**
  (`glass-app/tools/transcription-server.mjs`), which forwards it to
  OpenAI's `gpt-4o-transcribe` and returns the text. The proxy exists so
  the glasses' JS bundle never touches the API key directly — the key
  stays server-side, on your PC only.

After the note is saved it is read back aloud — **through the phone
speaker**, since the G2 has no speaker of its own. Readback also runs
on-device by default (the phone's built-in speech synthesis, zero network);
`?tts=proxy` forces the server's `/api/tts` endpoint (OpenAI
`gpt-4o-mini-tts`, same key) for nicer voices. Readback is on by default;
add `?tts=0` to keep the phone silent (e.g. in an actual meeting room), and
mind that spoken readback of patient notes is audible to everyone nearby —
see COMPLIANCE.md before using it around real patient data.

**Start the proxy server** (only needed for `?stt=proxy` / `?tts=proxy`;
needs an OpenAI API key — see "Do I need a ChatGPT/OpenAI API key?" below):

```
cd glass-app
npm run transcribe-server
```

This launches `tools/start-transcription-server.ps1`, which prompts for the
key with hidden input (`Read-Host -AsSecureString`) and never writes it to
disk — the key only exists in that PowerShell process's memory for as long as
the server runs. This is deliberately **interactive-only**: no script or agent
reads a stored key from disk to start it, by design. If you'd rather manage
the key as a file for repeated local runs, put `OPENAI_API_KEY=sk-...` in
`glass-app/.env` (gitignored, never `.env.txt` — plain `.env` only) and run
`npm run transcribe-server:raw` instead, which reads `process.env` directly
without prompting.

The server listens on port 8788 on your LAN IP (matching the default
`?transcribe_url`), and CORS-allows any origin so the Even App's WebView can
reach it. Without it running, dictation fails gracefully — "Mic blocked" if
`setMic` itself fails, or "Server unreachable" after recording if the POST
can't connect — never a crash.

### Do I need a ChatGPT/OpenAI API key?

**Not anymore for the default setup** — on-device dictation and readback use
the phone's built-in speech engines, no key and no server. You only need a
key for the higher-accuracy proxy path (`?stt=proxy` / `?tts=proxy`): the
transcription server calls OpenAI's `gpt-4o-transcribe` model (and
`gpt-4o-mini-tts` for the spoken readback), which needs an `OPENAI_API_KEY`
from [platform.openai.com](https://platform.openai.com/). One key covers
both. That key is **never** part of the glasses bundle; it lives only in the
transcription server's process environment on your PC (see above). This is a demo-stage choice for
speed — COMPLIANCE.md's original recommendation for real patient audio was a
self-hosted model (no cloud vendor, no per-key cost); revisit that decision
before pointing this at a real board (see COMPLIANCE.md §3, updated).

### Recording a demo

The G2 has no HUD screen-capture (the display is a waveguide, filmable only
through the lens), so three options, best first:

1. **Phone mirror** — sideload with `?mirror=1`: the app renders to the
   glasses *and* to the phone screen simultaneously; record the phone with its
   OS screen recorder while wearing the glasses. What you capture is exactly
   what the HUD shows, live, including touchpad interaction.
2. **Browser preview** — `npm run dev`, open `http://localhost:5190/?step=25`,
   record with any screen recorder. Same pixels, no hardware needed.
3. **Through-the-lens** — film the lens with a phone camera for a "this is
   real" shot: dim room, camera close to the lens at eye level, focus locked
   past the lens. Use it for a few hero seconds, mirror/preview for the rest.

## Status

- [x] Platform research (hardware, SDK 0.0.12 API surface verified from package types)
- [x] Strategy, architecture, compliance, roadmap docs
- [x] App scaffold: menu-driven navigation (Board / Patient list / Patient / Notes)
- [x] Manual patient control: browse-then-commit selection, independent of any auto-advancing timer
- [x] Voice dictation: mic capture → private local transcription proxy → OpenAI → note, verified end to end
- [x] Spoken note readback (TTS): saved note → same proxy `/api/tts` → OpenAI `gpt-4o-mini-tts` → phone speaker (`?tts=0` disables; not yet hand-tested on device)
- [x] Standalone mode: on-device dictation + readback via the phone's Web Speech engines is now the **default** — a packaged install needs no PC, key, or backend (`?stt=proxy`/`?tts=proxy` re-enable the OpenAI path; not yet hand-tested on device)
- [x] Hands-free voice commands wired in (Menu → Voice control): navigation, next/previous patient with room-wide broadcast, spoken notes, decisions, note readback — verified headless against the mock bridge; not yet hand-tested on device
- [x] Board awareness: footer cue when another client switches the active case + per-case elapsed clock on the Board card
- [ ] Broadcast dictated notes/decisions to the dashboard — needs a notes write API (or command vocabulary entry) in vr-mtb-web first; decisions are stored locally as starred case-tagged notes until then
- [x] On-device validation with a physical G2 (found and fixed the real root cause of unresponsive touch input — see ARCHITECTURE.md §5)
- [x] `.ehpk` packaging for teammate distribution (`npm run pack`, Even Hub portal import)
- [x] LiveKit sync client speaking vr-mtb-web's **real** backend protocol
      directly (verified against its actual source — no dashboard changes
      needed; two-way, not just a mirror — see ARCHITECTURE.md §2-3)
- [x] Talk (LiveKit): live two-way voice publish so the room actually hears the
      G2 wearer — `room.localParticipant.setMicrophoneEnabled`, the same API
      the dashboard itself uses; mic-ownership guarded against dictation and
      hands-free voice control (one stream at a time); verified in the
      browser preview against the mock board's graceful "not available"
      fallback — not yet hand-tested against a live backend
- [ ] Hand-tested against a running vr-mtb-web backend + LiveKit server (built and reviewed against source, not yet run live)
- [ ] STT provider decision for real patient audio (phone Web Speech / OpenAI cloud both involve vendor services; self-hosted recommended before real use — see COMPLIANCE.md §3)
- [ ] 17 unit tests passing (`npm test`); no test coverage yet for app.ts's orchestration itself (mic-ownership guards, card wiring) — covered by manual/browser verification only
