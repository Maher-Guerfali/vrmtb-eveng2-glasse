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
| `?transcribe_url=<url>` | Point dictation at a transcription server other than the default `http://192.168.178.65:8788/api/transcribe` |
| `?tts=0` | Disable the spoken note readback (on by default; plays on the **phone** — the G2 has no speaker) |
| `?tts_url=<url>` | Point readback at a TTS endpoint other than `<transcribe server>/api/tts` |
| `?sync=livekit&token_url=…&room=…&identity=…` | Use the real LiveKit board instead of mock data |

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
still works from a packaged install — it only needs the `network` permission
(already declared in `app.json`) to reach the transcription server, not the
`?sync=livekit` param.

The app ships with **static demo data** (three invented breast-cancer cases in
`src/sync/mockSync.ts`) and needs no backend for navigation: ideal for screen
recordings. `?step=25` auto-advances the board case every 25 s if you want a
hands-off demo; `?bridge=mock` forces the browser preview even inside the Even
App.

## Voice notes (dictation)

Tap once on the Patient card to start recording (glasses mic), tap again to
stop — the recording is sent to a small **private, local transcription
server** (`glass-app/tools/transcription-server.mjs`), which forwards it to
OpenAI's transcription API and returns the text, saved to the Notes card. The
proxy exists so the glasses' JS bundle never touches the API key directly —
the key stays server-side, on your PC only.

After the note is saved, the same server's `/api/tts` endpoint (OpenAI
`gpt-4o-mini-tts`, same key) reads it back aloud — **through the phone
speaker**, since the G2 has no speaker of its own. Readback is on by default;
add `?tts=0` to keep the phone silent (e.g. in an actual meeting room), and
mind that spoken readback of patient notes is audible to everyone nearby —
see COMPLIANCE.md before using it around real patient data.

**Start it** (needs an OpenAI API key — see "Do I need a ChatGPT/OpenAI API
key?" below):

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

Yes, for this specific implementation — the transcription server calls
OpenAI's `gpt-4o-transcribe` model (and `gpt-4o-mini-tts` for the spoken
readback), which needs an `OPENAI_API_KEY` from
[platform.openai.com](https://platform.openai.com/). One key covers both.
That key is **never** part of the glasses bundle; it lives only in the
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
- [x] On-device validation with a physical G2 (found and fixed the real root cause of unresponsive touch input — see ARCHITECTURE.md §5)
- [x] `.ehpk` packaging for teammate distribution (`npm run pack`, Even Hub portal import)
- [x] LiveKit sync client speaking vr-mtb-web's **real** backend protocol
      directly (verified against its actual source — no dashboard changes
      needed; two-way, not just a mirror — see ARCHITECTURE.md §2-3)
- [ ] Hand-tested against a running vr-mtb-web backend + LiveKit server (built and reviewed against source, not yet run live)
- [ ] STT provider decision for real patient audio (currently OpenAI cloud for demo speed; self-hosted recommended before real use — see COMPLIANCE.md §3)
- [ ] Hands-free voice commands (scaffolded in `src/stt/webSpeech.ts` / `src/voice/commands.ts`, not yet wired in)
