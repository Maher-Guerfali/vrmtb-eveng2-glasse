import { describe, expect, it } from 'vitest';

import { parseVoiceCommand } from './commands';

describe('parseVoiceCommand (English)', () => {
  it('parses stop, including engine-added punctuation', () => {
    expect(parseVoiceCommand('stop').kind).toBe('stop');
    expect(parseVoiceCommand('Stop.').kind).toBe('stop');
    expect(parseVoiceCommand('stop listening').kind).toBe('stop');
  });

  it('parses note start vs inline note', () => {
    expect(parseVoiceCommand('take a note').kind).toBe('startNote');
    expect(parseVoiceCommand('write note')).toEqual({ kind: 'startNote' });
    expect(parseVoiceCommand('take a note that patient is stable'))
      .toEqual({ kind: 'note', text: 'patient is stable' });
  });

  it('parses navigation with the dashboard vocabulary', () => {
    expect(parseVoiceCommand('next patient')).toEqual({ kind: 'nav', delta: 1 });
    expect(parseVoiceCommand('Previous case.')).toEqual({ kind: 'nav', delta: -1 });
  });

  it('parses open targets, list before single patient', () => {
    expect(parseVoiceCommand('open the board')).toEqual({ kind: 'open', target: 'board' });
    expect(parseVoiceCommand('show the patient list')).toEqual({ kind: 'open', target: 'patients' });
    expect(parseVoiceCommand('go to the patient')).toEqual({ kind: 'open', target: 'patient' });
    expect(parseVoiceCommand('open notes')).toEqual({ kind: 'open', target: 'notes' });
  });

  it('parses decisions and note readback', () => {
    expect(parseVoiceCommand('decision that surgery is scheduled'))
      .toEqual({ kind: 'decision', text: 'surgery is scheduled' });
    expect(parseVoiceCommand('record a decision is neoadjuvant chemo'))
      .toEqual({ kind: 'decision', text: 'neoadjuvant chemo' });
    expect(parseVoiceCommand('read the notes back').kind).toBe('readNotes');
  });

  it('ignores ambient meeting talk', () => {
    expect(parseVoiceCommand('the margins look clear to me').kind).toBe('unknown');
    expect(parseVoiceCommand('could you zoom in on that slide').kind).toBe('unknown');
    expect(parseVoiceCommand('').kind).toBe('unknown');
  });
});

describe('parseVoiceCommand (German)', () => {
  it('parses stop and note start', () => {
    expect(parseVoiceCommand('Stopp.').kind).toBe('stop');
    expect(parseVoiceCommand('neue Notiz').kind).toBe('startNote');
    expect(parseVoiceCommand('schreibe eine Notiz').kind).toBe('startNote');
  });

  it('parses inline notes and decisions', () => {
    expect(parseVoiceCommand('Notiz dass der Befund unauffällig ist'))
      .toEqual({ kind: 'note', text: 'der Befund unauffällig ist' });
    expect(parseVoiceCommand('Entscheidung ist OP nächste Woche'))
      .toEqual({ kind: 'decision', text: 'OP nächste Woche' });
  });

  it('parses navigation and open targets', () => {
    expect(parseVoiceCommand('nächster Patient')).toEqual({ kind: 'nav', delta: 1 });
    expect(parseVoiceCommand('vorheriger Fall')).toEqual({ kind: 'nav', delta: -1 });
    expect(parseVoiceCommand('öffne das Board')).toEqual({ kind: 'open', target: 'board' });
    expect(parseVoiceCommand('zeige die Patientenliste')).toEqual({ kind: 'open', target: 'patients' });
    expect(parseVoiceCommand('öffne die Notizen')).toEqual({ kind: 'open', target: 'notes' });
    expect(parseVoiceCommand('lies die Notizen vor').kind).toBe('readNotes');
  });

  it('ignores ambient German meeting talk', () => {
    expect(parseVoiceCommand('die Patientin hat gut auf die Therapie angesprochen').kind).toBe('unknown');
  });
});
