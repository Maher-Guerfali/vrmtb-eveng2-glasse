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

## Status

- [x] Platform research (hardware, SDK 0.0.12 API surface verified from package types)
- [x] Strategy, architecture, compliance, roadmap docs
- [x] App scaffold: card engine, HUD composer, mock bridge + browser preview, mock board sync
- [x] LiveKit sync client (behind config, needs `vrmtb.hud` publisher in the dashboard)
- [ ] STT captions/dictation (interface stubbed — provider decision pending, see COMPLIANCE.md)
- [ ] On-device validation with a physical G2
- [ ] Dashboard-side `vrmtb.hud` publisher (small change in vr-mtb-web)
