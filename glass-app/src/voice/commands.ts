export type VoiceCommand =
  | { kind: 'open'; target: 'board' | 'patient' | 'notes' }
  | { kind: 'startNote' }
  | { kind: 'note'; text: string }
  | { kind: 'stop' }
  | { kind: 'unknown' };

export function parseVoiceCommand(transcript: string): VoiceCommand {
  const text = transcript.trim().replace(/\s+/g, ' ');
  const normalized = text.toLowerCase();
  if (/^(stop|stop listening|cancel)$/.test(normalized)) return { kind: 'stop' };
  if (/^(write|take|create|add) (a )?note$/.test(normalized)) return { kind: 'startNote' };
  if (/^(open |show |go to )(the )?(board|agenda)$/.test(normalized)) return { kind: 'open', target: 'board' };
  if (/^(open |show |go to )(the )?(patient|case|active patient)$/.test(normalized)) return { kind: 'open', target: 'patient' };
  if (/^(open |show |go to )(the )?notes?$/.test(normalized)) return { kind: 'open', target: 'notes' };
  const note = text.match(/^(?:write |take |create |add )(?:a )?note(?: that)?\s+(.+)$/i);
  if (note) return { kind: 'note', text: note[1] };
  return { kind: 'unknown' };
}
