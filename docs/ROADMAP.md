# Roadmap

## P0 — Prove the pipeline (repo scaffold → device demo)

**Goal:** the deck-of-cards app runs in the browser preview *and* on the
physical G2, showing the mock tumor board.

- [x] Repo, strategy/architecture/compliance docs
- [x] `glass-app` scaffold: card engine, HUD composer (8-object budget), input router
- [x] Mock bridge + browser HUD preview + scripted mock board (`mockSync`)
- [ ] Sideload on the physical G2 (QR from dev portal), verify: page create,
      rebuild on card switch, `textContainerUpgrade` timer tick, touchpad events
- [ ] Measure: BLE render latency, text legibility of the patient card template

**Exit gate:** a colleague wears the G2 and follows a fake 3-case board without
touching a phone. *This is the "team likes it" demo.*

## P1 — Live board (real data plumbing)

**Goal:** the glasses mirror the real dashboard during a test board.

- [ ] vr-mtb-web: publish `vrmtb.hud` (board + patient + notify envelopes,
      full-state, re-publish on join) — small PR against the dashboard
- [ ] Enable `liveKitSync` (token from existing voice-token service)
- [ ] Notifications from `vrmtb.annotation` ("annotation added by …")
- [ ] Stale-data marker + reconnect behavior verified by pulling Wi-Fi
- [ ] `wearGuard` on-device verification (blank on take-off / in-case)

**Exit gate:** hybrid test board where a G2 wearer, a Quest wearer, and a
desktop user all track the same case switch within ~1 s.

## P2 — Voice in (mic features)

**Goal:** captions + dictation, provider chosen with the DPO.

- [ ] Measure `audioEvent` PCM format on device (rate/depth/channels)
- [ ] `SttProvider` implementations: self-hosted Whisper first, cloud second (COMPLIANCE.md §3)
- [ ] Captions card: rolling 3-line transcript via `textContainerUpgrade`
- [ ] Dictate card: push-to-talk (hold tap), transcript → existing notes API, attribution via room identity
- [ ] Optional DE↔EN caption translation toggle

**Exit gate:** a dictated note appears in the dashboard notes panel during a
test board; captions readable at conversational pace.

## P3 — Board actions & experiments

- [ ] Decide card: `DecisionRequested` → confirm/dissent tap → tally on dashboard
- [ ] AI card: voice query → existing AI backend → ≤5-line answer
- [ ] Experiment: publish glasses/phone mic into the LiveKit room (can the G2
      replace the Rokid for speak-only participants?) — measure latency, decide
- [ ] R1 ring support pass (event source already handled by the router)
- [ ] Study instrumentation: card-view analytics (pseudonymous) for the
      four-modality comparison paper

## Standing engineering rules

- Pin `@evenrealities/even_hub_sdk` exactly; SDK churn lands only in `bridge/evenBridge.ts`
- Every card change must pass the browser preview before device testing
- No PHI in logs, storage, or analytics — reviewed at PR time
