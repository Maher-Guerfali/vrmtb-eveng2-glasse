# Compliance posture — patient data on a wearable HUD

This is a university research project in Germany handling breast-cancer case
data. Two regimes matter: **GDPR** (data protection) and **MDR** (EU Medical
Device Regulation). This document states the posture the architecture is built
around — review it with the university's data-protection officer (DPO) and the
project's clinical leads **before the first pilot with real case data**.

## 1. MDR: stay an organizational aid, by design

Intended use (draft): *"VR-MTB Glance displays meeting organization
information, pseudonymized case summary text, live transcription, and note
dictation for participants of a multidisciplinary tumor board. It does not
display diagnostic images, does not compute or recommend diagnoses or
therapies, and is not intended to inform individual treatment decisions."*

Architectural guarantees backing that sentence:

- **No diagnostic imaging on the HUD** — enforced by product decision and by
  hardware (576×288 monochrome).
- **No clinical scoring/recommendation logic in the app** — the Decide card
  (P3) *transports* a human-authored recommendation for confirmation; it
  computes nothing. The AI card relays the existing dashboard AI and must
  carry the same "not for diagnostic use" framing that AI already has.
- Keep this scoped as **research software within the study protocol** (ethics
  vote / Ethikkommission covers the pilot). If it ever moves toward clinical
  routine, do a formal MDR qualification check then — not now.

## 2. GDPR: minimize, pseudonymize, evaporate

**What the glasses may show** (`HudPatientSummary`): case pseudonym
(e.g. `MTB-2026-014` + initials), age, sex, menopausal status, cTNM/pTNM,
grading, ER/PR/HER2, Ki-67, ≤3 history lines, the question to the board.
**Never**: full name, birth date, address, IDs, images.

- **Minimization at the publisher.** The dashboard curates the `vrmtb.hud`
  payload; the wearable never receives more than it renders. The glass app is
  not trusted with filtering.
- **No persistence.** No PHI in `localStorage`, no logs containing payloads,
  nothing cached beyond the in-memory store of the current meeting.
- **Evaporation.** `wearGuard` blanks patient content when `isWearing=false`
  or `isInCase=true`; meeting end (`SYSTEM_EXIT` / room disconnect) clears the
  store and the HUD.
- **Transport.** WSS/HTTPS only; short-lived room tokens from the existing
  voice-token service; per-doctor identity in the token (audit trail of who
  was in the room, already the LiveKit model).
- **Phone as processor.** The web app runs inside the Even App on the doctor's
  phone. Prefer **institution-managed devices** for the pilot; document the
  Even App as a local runtime (content is rendered, not uploaded to Even —
  verify against Even's privacy terms and record the assessment).

## 3. Microphone features — the sensitive part

**Current implementation status (this is now real code, not a plan):**
push-to-talk voice notes are implemented and working — mic audio is sent to
OpenAI's `gpt-4o-transcribe` via a private local proxy
(`glass-app/tools/transcription-server.mjs`, see ARCHITECTURE.md §6). This is
a **demo/dev-speed choice made in code**, not the outcome of the decision
matrix below — **do not point it at a real board's audio until the matrix is
actually resolved with the DPO.** Today's implementation:

- ✅ Push-to-talk (mic open only between two explicit taps, never continuous)
- ✅ API key never in the glasses bundle (server-side only, entered interactively — never read from a plaintext file — see README "Voice notes")
- ✅ Transcript held in memory only, cleared on session end, no on-device persistence
- ❌ Not yet: EU-region guarantee, a signed DPA with OpenAI, or DPO sign-off
- ❌ Not yet: a visible "transcribing" indicator on the *dashboard* side (today it's visible only to the wearer, on the HUD itself)

Decision matrix to resolve **with the DPO** before any real patient audio:

| Option | Residency | Effort | Notes |
|---|---|---|---|
| Self-hosted Whisper (uni server) | Best — data never leaves the institution | Ops + GPU | Originally recommended default; still the safest choice for a real pilot |
| EU-region cloud STT + DPA (Deepgram/Soniox) | Good with contract | Low | Needs vendor DPA (Auftragsverarbeitung) signed by the university |
| **OpenAI `gpt-4o-transcribe` (current implementation)** | US-based, standard API terms | Already built | Fast to stand up; **swap before real patient audio** unless the university separately approves an OpenAI DPA |
| Dev only: cloud STT on synthetic/demo audio | n/a | — | Fine today (all current test data is invented); never point at real board audio |

Additional rules regardless of provider: visible "transcribing" state so
**all participants know** (transparency, §26 BDSG territory for staff, consent
handling via the board's existing recording workflow) — dashboard-side
indicator is still a gap, see above; push-to-talk for dictation (mic open only
between explicit taps, already implemented); transcripts should land in the
same access-controlled notes store as typed notes once the dashboard side
exists (today they live only in the glass app's in-memory Notes card).

## 4. Checklist before pilot with real data

- [ ] DPO review of this document + data-flow diagram (ARCHITECTURE.md §3)
- [ ] Ethics/protocol amendment covering the wearable modality
- [ ] Verify Even App's data handling (no cloud mirroring of HUD content) and record it
- [ ] STT provider swapped from the demo OpenAI proxy to a DPO-approved option (self-hosted Whisper or an EU-region vendor with a signed DPA) — see §3
- [ ] Participant information sheet updated (glasses have no camera — say it explicitly, it helps acceptance)
- [ ] Pen-test pass over token service exposure for the new client type
