/** On-device note readback via the WebView's speechSynthesis — no key, no
 * server, no PC. Audio still comes out of the PHONE: the G2 has no speaker.
 */
export function canSpeakOnDevice(): boolean {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function speakOnDevice(text: string, lang?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang ?? (navigator.language || 'en-US');
    utterance.onend = () => resolve();
    utterance.onerror = (event) => reject(new Error(`Speech synthesis failed: ${event.error}`));
    // Latest note wins: drop anything still queued from a previous readback.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}
