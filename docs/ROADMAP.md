# Roadmap

## P0 — Prove the pipeline (repo scaffold → device demo) — DONE

**Goal:** the app runs in the browser preview *and* on the physical G2, and
the wearer actually controls it.

- [x] Repo, strategy/architecture/compliance docs
- [x] `glass-app` scaffold: card engine, HUD composer (8-object budget), input router
- [x] Mock bridge + browser HUD preview + mock board (static by default, `?step=N` to auto-advance)
- [x] Sideload on the physical G2 (QR from dev portal), verified: page create,
      rebuild on card switch, `textContainerUpgrade` footer updates, touchpad events
- [x] **Found and fixed the real blocker**: touch input was silently discarded
      because no container had `isEventCapture` set — see ARCHITECTURE.md §5.
      Symptom looked like "the app runs itself" (only the mock timer was
      visibly changing anything); root cause was 100% missing input capture,
      not a data/timer problem.
- [x] Manual control: patient list is browse-then-commit (swipe never changes
      the active patient, only tap does), replacing the earlier auto-advancing
      timer as the primary interaction model
- [x] `.ehpk` packaging (`npm run pack`) for distributing to teammates without a dev server
- [ ] Measure: BLE render latency, text legibility of the patient card template (worth revisiting, not blocking)

**Exit gate:** a colleague wears the G2 and follows a fake 3-case board without
touching a phone. *This is the "team likes it" demo.* ✅ — navigation is
fully manual now (see above); confirm with an actual colleague test.

## P1 — Live board (real data plumbing)

**Goal:** the glasses mirror the real dashboard during a test board.

- [x] **Plan corrected after reading vr-mtb-web's actual source**: no new
      `vrmtb.hud` topic/dashboard PR needed — the real backend already
      exposes everything (`POST /api/rooms/join`, `GET /api/session`, the
      `activePatient`/`command` LiveKit data-channel topics also used by the
      dashboard's own voice commands and MCP server). See ARCHITECTURE.md §2-3.
- [x] `liveKitSync.ts` rewritten to speak that real protocol directly:
      joins via the real room registry, fetches+curates `/api/session`,
      reacts to `activePatient`/`selectPatient`/`nextPatient`/`previousPatient`
      messages, and **broadcasts back** (`PATCH /api/session/active-patient`)
      when the wearer selects a patient on the glasses — a two-way
      participant, not a read-only mirror
      (`?sync=livekit&backend=...&room=...` — see README)
- [ ] Test against a real running vr-mtb-web backend + LiveKit server (built
      and reviewed against the source, not yet hand-tested live end to end)
- [ ] Stale-data marker + reconnect behavior verified by pulling Wi-Fi
- [ ] `wearGuard` on-device verification (blank on take-off / in-case)
- [ ] `vrmtb.annotation` notifications — deferred; separate producer/consumer
      set from the room's own command channel, not blocking this phase

**Exit gate:** hybrid test board where a G2 wearer, a Quest wearer, and a
desktop user all track the same case switch within ~1 s.

## P2 — Voice in (mic features)

**Goal:** captions + dictation, provider chosen with the DPO.

- [x] Push-to-talk dictation: mic → local transcription proxy → OpenAI → Notes
      card, verified end to end on-device (demo-speed provider choice — see
      COMPLIANCE.md §3, **not yet DPO-approved for real patient audio**)
- [x] `.env`-based local key handling with an interactive-only launcher
      (`tools/start-transcription-server.ps1`) so no script/agent ever reads
      a stored key from disk — see README "Voice notes"
- [ ] Measure `audioEvent` PCM format precisely on device (rate/depth/channels
      currently assumed 16kHz/16-bit mono; transcripts have been coherent,
      which is reasonable evidence but not a real measurement)
- [ ] Swap to a DPO-approved provider before real patient audio: self-hosted
      Whisper first choice, EU-region cloud + DPA second (COMPLIANCE.md §3)
- [ ] Attribution: tag notes with the wearer's identity once LiveKit room
      identity flows into the glass app (depends on P1)
- [ ] Dashboard-side notes integration: today notes live only in the glass
      app's in-memory Notes card, not the shared notes store
- [ ] Captions card: rolling live transcript via `textContainerUpgrade`
      (streaming `SttProvider`/`webSpeech.ts` already scaffolded, not wired)
- [ ] Optional DE↔EN caption translation toggle

**Exit gate:** a dictated note appears in the dashboard notes panel during a
test board; captions readable at conversational pace. *(Dictation itself
works end-to-end today; the "lands in the dashboard" and "captions" halves of
this exit gate are still open.)*

## P3 — Board actions & experiments

- [ ] Hands-free voice commands: `voice/commands.ts` (phrase parser) and
      `stt/webSpeech.ts` (Web Speech provider) are scaffolded but not wired
      into `app.ts` — would let a wearer say "open notes" / "write a note
      that…" instead of tap navigation
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
