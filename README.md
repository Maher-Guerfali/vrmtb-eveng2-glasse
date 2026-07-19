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
| **this repo** | **Even G2** | **Silent, glanceable HUD: agenda, patient snapshot, captions, dictation, decisions** |

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
  into a green-on-black preview canvas and a scripted mock tumor board drives
  card updates. Arrow keys = touchpad swipes, Enter = tap, Backspace = double-tap.
- **On device**: the same code detects the real Even App bridge and renders to
  the glasses. Sideload via QR from the [Even Hub dev portal](https://hub.evenrealities.com/).
- **Live sync**: `src/sync/liveKitSync.ts` connects to the existing VR-MTB
  LiveKit room (token service from `vrmtb-infra`) — enable it with URL params
  once the dashboard publishes the `vrmtb.hud` topic (see ARCHITECTURE.md).

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
in **mock-data mode** (see below) — exactly what you want for a demo/recording
to send around. `app.json` currently declares zero permissions (no network) to
match that; add the `network` permission there once `?sync=livekit` mode is
promoted out of dev-only use (see ARCHITECTURE.md §3).

The app ships with **static demo data** (three invented breast-cancer cases in
`src/sync/mockSync.ts`) and needs no backend: ideal for screen recordings.
`?step=25` slows the scripted board to 25 s per advance; `?bridge=mock` forces
the browser preview even inside the Even App.

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
- [x] App scaffold: card engine, HUD composer, mock bridge + browser preview, mock board sync
- [x] LiveKit sync client (behind config, needs `vrmtb.hud` publisher in the dashboard)
- [ ] STT captions/dictation (interface stubbed — provider decision pending, see COMPLIANCE.md)
- [ ] On-device validation with a physical G2
- [ ] Dashboard-side `vrmtb.hud` publisher (small change in vr-mtb-web)
