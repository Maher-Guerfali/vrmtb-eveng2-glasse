/** Send a finished G2 microphone recording to the user's private proxy. */
export async function transcribePcm(
  endpoint: string,
  pcm: Uint8Array,
): Promise<string> {
  // Copy into a plain ArrayBuffer because the DOM fetch type rejects the
  // SDK's Uint8Array<ArrayBufferLike> generic directly.
  const body = new Uint8Array(pcm.length);
  body.set(pcm);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: body.buffer as ArrayBuffer,
  });
  const payload = await response.json() as { text?: string; error?: string };
  if (!response.ok || !payload.text) throw new Error(payload.error ?? 'Transcription failed.');
  return payload.text.trim();
}
