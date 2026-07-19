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
    const shouldBlank = !s.wearing || s.inCase || !s.connected;
    if (shouldBlank !== blanked) {
      blanked = shouldBlank;
      onBlankChange(blanked);
    }
  });
}
