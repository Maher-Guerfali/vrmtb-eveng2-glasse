export type VoiceCommand =
  | { kind: 'open'; target: 'board' | 'patient' | 'patients' | 'notes' }
  // Same next/previous vocabulary the dashboard's voice commands use, so a
  // wearer saying "next patient" matches what the rest of the room expects.
  | { kind: 'nav'; delta: 1 | -1 }
  | { kind: 'startNote' }
  | { kind: 'note'; text: string }
  | { kind: 'decision'; text: string }
  | { kind: 'readNotes' }
  | { kind: 'stop' }
  | { kind: 'unknown' };

export function parseVoiceCommand(transcript: string): VoiceCommand {
  const text = transcript.trim().replace(/\s+/g, ' ');
  const normalized = text.toLowerCase().replace(/[.,!?]+$/, '');
  if (/^(stop|stop listening|cancel)$/.test(normalized)) return { kind: 'stop' };
  if (/^(write|take|create|add) (a )?note$/.test(normalized)) return { kind: 'startNote' };
  if (/^(next|forward) (patient|case)$/.test(normalized)) return { kind: 'nav', delta: 1 };
  if (/^(previous|prev|last) (patient|case)$/.test(normalized)) return { kind: 'nav', delta: -1 };
  if (/^(open |show |go to )(the )?(board|agenda)$/.test(normalized)) return { kind: 'open', target: 'board' };
  if (/^(open |show |go to )(the )?(patient list|patients|list)$/.test(normalized)) return { kind: 'open', target: 'patients' };
  if (/^(open |show |go to )(the )?(patient|case|active patient)$/.test(normalized)) return { kind: 'open', target: 'patient' };
  if (/^(open |show |go to )(the )?notes?$/.test(normalized)) return { kind: 'open', target: 'notes' };
  if (/^read (the )?(last )?notes?( back)?$/.test(normalized)) return { kind: 'readNotes' };
  const decision = text.match(/^(?:add |record |take |write )?(?:a |the )?decision(?: is| that)?\s+(.+)$/i);
  if (decision) return { kind: 'decision', text: decision[1] };
  const note = text.match(/^(?:write |take |create |add )(?:a )?note(?: that)?\s+(.+)$/i);
  if (note) return { kind: 'note', text: note[1] };

  // German command set - the project's home board speaks German.
  if (/^(stopp|abbrechen|beenden)$/.test(normalized)) return { kind: 'stop' };
  if (/^(schreibe |erstelle |mache )?(eine |neue )?notiz( aufnehmen)?$/.test(normalized)) return { kind: 'startNote' };
  if (/^(nächster|naechster) (patient|fall)$/.test(normalized)) return { kind: 'nav', delta: 1 };
  if (/^(vorheriger|letzter) (patient|fall)$/.test(normalized)) return { kind: 'nav', delta: -1 };
  if (/^(öffne|oeffne|zeige) (das |die |den )?(board|tafel|agenda)$/.test(normalized)) return { kind: 'open', target: 'board' };
  if (/^(öffne|oeffne|zeige) (die )?(patientenliste|liste)$/.test(normalized)) return { kind: 'open', target: 'patients' };
  if (/^(öffne|oeffne|zeige) (den |das )?(patienten?|fall)$/.test(normalized)) return { kind: 'open', target: 'patient' };
  if (/^(öffne|oeffne|zeige) (die )?notizen$/.test(normalized)) return { kind: 'open', target: 'notes' };
  if (/^(lies|lese) (die )?notizen( vor)?$/.test(normalized)) return { kind: 'readNotes' };
  const decisionDe = text.match(/^(?:entscheidung|beschluss)(?: ist| dass)?\s+(.+)$/i);
  if (decisionDe) return { kind: 'decision', text: decisionDe[1] };
  const noteDe = text.match(/^(?:schreibe |notiere )?(?:eine )?notiz(?: dass)?\s+(.+)$/i);
  if (noteDe) return { kind: 'note', text: noteDe[1] };

  return { kind: 'unknown' };
}
