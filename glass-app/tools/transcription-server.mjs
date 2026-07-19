// Private LAN proxy for G2 dictation and note readback. Keep OPENAI_API_KEY
// here, never in the glasses bundle. Later, add a database write after the
// transcription result.
import http from 'node:http';

const port = Number(process.env.PORT ?? 8788);
const maxBytes = 10 * 1024 * 1024;

function wavFromPcm(pcm, sampleRate = 16_000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function reply(res, status, payload) {
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

async function transcribe(res, pcm) {
  const form = new FormData();
  form.append('model', 'gpt-4o-transcribe');
  form.append('file', new Blob([wavFromPcm(pcm)], { type: 'audio/wav' }), 'g2-note.wav');
  const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const payload = await upstream.json();
  if (!upstream.ok) return reply(res, upstream.status, { error: payload?.error?.message ?? 'OpenAI transcription failed.' });
  return reply(res, 200, { text: payload.text });
}

async function speak(res, body) {
  let text = '';
  let voice = 'alloy';
  try {
    const parsed = JSON.parse(body.toString('utf8'));
    if (typeof parsed.text === 'string') text = parsed.text.trim();
    if (typeof parsed.voice === 'string') voice = parsed.voice;
  } catch {
    return reply(res, 400, { error: 'TTS body must be JSON: {"text":"..."}' });
  }
  if (!text) return reply(res, 400, { error: 'No text to speak.' });

  const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3' }),
  });
  if (!upstream.ok) {
    const payload = await upstream.json().catch(() => null);
    return reply(res, upstream.status, { error: payload?.error?.message ?? 'OpenAI speech synthesis failed.' });
  }
  const audio = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(200, {
    'access-control-allow-origin': '*',
    'content-type': 'audio/mpeg',
    'content-length': audio.length,
  });
  return res.end(audio);
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return reply(res, 204, {});
  if (req.method !== 'POST' || (req.url !== '/api/transcribe' && req.url !== '/api/tts')) {
    return reply(res, 404, { error: 'Not found' });
  }
  if (!process.env.OPENAI_API_KEY) return reply(res, 500, { error: 'OPENAI_API_KEY is not configured on the transcription server.' });

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) return reply(res, 413, { error: 'Recording is too long.' });
      chunks.push(chunk);
    }
    if (!size) return reply(res, 400, { error: req.url === '/api/tts' ? 'No text received.' : 'No microphone audio received.' });

    if (req.url === '/api/tts') return await speak(res, Buffer.concat(chunks));
    return await transcribe(res, Buffer.concat(chunks));
  } catch (error) {
    console.error('[transcription]', error);
    return reply(res, 500, { error: 'Transcription server error.' });
  }
}).listen(port, '0.0.0.0', () => console.log(`G2 transcription server listening on http://0.0.0.0:${port}`));
