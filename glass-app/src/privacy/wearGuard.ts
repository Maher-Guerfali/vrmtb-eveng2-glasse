import type { GlassBridge } from '../bridge/types';

// PHI evaporation rule (COMPLIANCE.md §2): the moment the glasses are not on
// a face - taken off, or back in the charging case - patient content must
// leave the HUD. The device status stream gives us both signals.
export function watchWearState(
  bridge: GlassBridge,
  onBlankChange: (blanked: boolean) => void,
): () => void {
  let blanked = false;
  return bridge.onWearState((s) => {
    // Do not blank the HUD merely because the host has not yet supplied its
    // first wear reading (common immediately after launching a sideloaded app).
    // A reconnect report can briefly say disconnected while the wearer is
    // still using the glasses. Only explicit "not worn" or "in case" states
    // should blank the HUD.
    const shouldBlank = s.wearing === false || s.inCase;
    if (shouldBlank !== blanked) {
      blanked = shouldBlank;
      onBlankChange(blanked);
    }
  });
}
