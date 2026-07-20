# Presentation

`vrmtb-glance-deck.html` is a self-contained, point-by-point walkthrough of
this app: the problem it solves, the device, every shipped feature (with real
screenshots from the browser preview), the architecture decision to speak
vr-mtb-web's real protocol, compliance posture, and roadmap status.

**View it:** open the file directly in any browser — no server, no
dependencies, images are embedded. Also hosted at
https://claude.ai/code/artifact/4d6bea14-8d18-45cf-81c0-3a1161bc1aee (private
by default; share from that page if needed).

**Update it:** the file is generated, not hand-edited directly — see
`docs/STRATEGY.md`/`ARCHITECTURE.md`/`README.md` for the source of truth on
facts. To regenerate with new screenshots, follow the same pattern used to
build this version: crop fresh browser-preview screenshots to the HUD's
576×288 region, base64-encode them, and substitute into the slide markup.

**Before sharing externally:** the "See it live" slide is a crossfade of
browser-preview screenshots, not on-device footage — swap in a real recording
per README's "Recording a demo" section (phone mirror, browser capture, or
through-the-lens) first.
