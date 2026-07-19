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

## 3. Microphone features (P2) — the sensitive part

Captions/dictation stream room audio (which includes patient-related speech)
to an STT engine. Decision matrix to resolve **with the DPO**:

| Option | Residency | Effort | Notes |
|---|---|---|---|
| Self-hosted Whisper (uni server) | Best — data never leaves the institution | Ops + GPU | Recommended default for the pilot if latency acceptable |
| EU-region cloud STT + DPA (Deepgram/Soniox) | Good with contract | Low | Needs vendor DPA (Auftragsverarbeitung) signed by the university |
| Dev only: cloud STT on synthetic audio | n/a | — | Fine today; never point dev keys at real board audio |

Additional rules regardless of provider: visible "transcribing" state on the
dashboard so **all participants know** (transparency, §26 BDSG territory for
staff, consent handling via the board's existing recording workflow);
push-to-talk for dictation (mic open only while held); transcripts land in the
existing notes store with the same access control as typed notes.

## 4. Checklist before pilot with real data

- [ ] DPO review of this document + data-flow diagram (ARCHITECTURE.md §3)
- [ ] Ethics/protocol amendment covering the wearable modality
- [ ] Verify Even App's data handling (no cloud mirroring of HUD content) and record it
- [ ] STT provider decided + DPA or self-hosted deployment done (if P2 enabled)
- [ ] Participant information sheet updated (glasses have no camera — say it explicitly, it helps acceptance)
- [ ] Pen-test pass over token service exposure for the new client type
