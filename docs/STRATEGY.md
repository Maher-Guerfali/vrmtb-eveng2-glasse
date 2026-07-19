# Strategy — VR-MTB Glance on the Even G2

## 1. The gap in the current ecosystem

VR-MTB today serves three postures:

- **Immersive** (Quest 3 / Vision Pro): the radiologist or presenter deep in the
  3D volume. High value, but nobody wears a headset for a whole board, and only
  one or two people per room will ever wear one.
- **Desktop** (dashboard): the standard screen-bound participant.
- **Voice wearable** (Rokid): hands-free talking, tightly RAM-constrained.

The unserved persona is the **doctor in the room** — the surgeon, pathologist,
gynecologist, or oncologist sitting at the table (or walking the ward while
"their" case is still three slots away). They will not wear a headset and often
don't even open the dashboard; they glance at the shared projector and lose all
private context. Hybrid boards make this worse: remote speech is hard to follow,
and there is no discreet way to check "which case are we on, what was the
Ki-67 again?"

The Even G2 is purpose-built for exactly this posture: a 35 g pair of normal-
looking glasses with a private monochrome HUD, four microphones, **no camera
and no speaker**. In a clinical setting the missing camera removes the single
biggest acceptance blocker for wearables (colleague and patient privacy), and
the missing speaker means the room never hears it.

## 2. Product concept: Glance cards

One app, one mental model: **a deck of glanceable cards**, one visible at a
time, flipped with the temple touchpad or R1 ring. Cards are pushed to, never
browsed — the board drives the HUD, the doctor only glances.

| Card | Content | Driven by |
|---|---|---|
| **Board** | Live agenda: current case, presenter, elapsed time, up next | LiveKit data topic `vrmtb.hud` (board state) |
| **Patient** | Snapshot of the active case: age, TNM, grading, ER/PR/HER2, Ki-67, key history, question to the board — pseudonymized | `ActivePatientChanged` equivalent on `vrmtb.hud` |
| **Captions** *(P2)* | Live speech-to-text of the room / remote participants, optional DE↔EN | Glasses mic PCM → streaming STT |
| **Dictate** *(P2)* | Push-to-talk voice note → transcript → posted to case notes on the dashboard | STT + existing notes flow |
| **Decide** *(P3)* | When a decision is called: proposed recommendation on HUD, confirm/dissent with one tap, tallied live on the dashboard | `DecisionRequested` equivalent on `vrmtb.hud` |
| **AI** *(P3)* | Ask the board's existing AI by voice, short answer rendered silently | Same AI backend the dashboard uses |

Plus ambient **notifications** overlaid briefly on any card: "Dr. Weber joined",
"Recording started", "3D annotation added by radiology".

### What we deliberately do NOT do

- **No diagnostic imaging on the HUD.** 576×288 monochrome physically can't
  render DICOM meaningfully, and keeping imaging off the glasses keeps the app
  an organizational/communication aid rather than a diagnostic display
  (see COMPLIANCE.md — this is load-bearing for MDR positioning).
- **No full-duplex voice calls from the glasses in v1.** The G2 has no speaker;
  it cannot be a call endpoint. The mic is for STT (captions, dictation,
  AI queries). Publishing glasses-mic audio into the LiveKit room is a P3
  experiment, not a commitment (BLE audio latency/bandwidth unproven).
- **No standalone patient browser.** The glasses never let you scroll a patient
  database; they mirror the board's active context only. Less UI, less risk,
  less PHI on the device.

## 3. Why the team and the doctors will actually like it

- **Doctors**: zero learning curve (it's a card you glance at), private context
  during the meeting, captions for hybrid/accented/bilingual sessions, and
  dictation that lands directly in the board notes instead of a voice memo
  nobody transcribes.
- **The team**: it's a **TypeScript web app** — the same skills as vr-mtb-web,
  not another Kotlin/Unity codebase. It reuses the LiveKit room, token service,
  and event contract that already exist. The Rokid lessons (voice-first,
  RAM-constrained) carry over conceptually, but there's no on-device RAM
  fight: the app runs on the phone, the glasses are a BLE peripheral.
- **The project (research angle)**: a four-modality study — headset vs desktop
  vs voice-glasses vs HUD-glasses in the same tumor board — is a publishable
  contribution on its own (participation equity, situational awareness,
  meeting-flow interruption metrics).

## 4. Risks and honest unknowns

| Risk | Mitigation |
|---|---|
| SDK is v0.0.12, moving fast, docs partly community-driven | Pin the version, keep an SDK wrapper (`bridge/`) so churn stays in one file; verify on device early (P0 exit gate) |
| BLE audio quality/latency for STT unproven | Phone-mic fallback (`AudioInputSource.Phone`) is one enum away; captions are P2, not P0 |
| Text-only HUD may feel too sparse for some cards | The 8-text-object budget is enforced in one place (`hud/composer.ts`); patient card designed around 7 objects with truncation rules |
| PHI on a personal wearable raises DPO eyebrows | Pseudonymization + auto-blank on `isWearing=false` + nothing persisted; involve the DPO before the pilot, not after (COMPLIANCE.md) |
| Even Hub review/distribution process for a private medical app | Sideload + private builds exist today; store distribution is not on the critical path |
