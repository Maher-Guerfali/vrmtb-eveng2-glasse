/** Ask the private proxy to synthesize speech and play it on the phone.
 *
 * The G2 has no speaker, so readback always comes out of the Even App's
 * WebView on the phone — the glasses stay silent. Some WebViews block
 * playback that isn't tied to a user gesture; the dictation flow starts
 * from a tap, but if `play()` is still refused the caller gets a normal
 * rejection to surface, never a crash.
 */
export async function speakText(endpoint: string, text: string): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? 'Speech synthesis failed.');
  }
  const url = URL.createObjectURL(await response.blob());
  const audio = new Audio(url);
  try {
    await audio.play();
    await new Promise<void>((resolve) => {
      audio.addEventListener('ended', () => resolve(), { once: true });
      audio.addEventListener('error', () => resolve(), { once: true });
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
