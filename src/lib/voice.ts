/**
 * Local-TTS playback that RESPECTS the user's voice settings: the engine,
 * voice and speed come from the host (reader.voiceConfig — Settings →
 * Voice), never hardcoded. Text is cleaned of markdown decoration (a voice
 * must never read "asterisk"), split into sentence chunks so long texts
 * play whole, and playback is stoppable at any moment. Best-effort: a
 * machine without a voice fails quietly and the text stays on screen.
 */
import { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';
import { tally } from './costs';

const PLUGIN_ID = '@mnemosyne-plugins/pheme';
const sdk = new MnemoCartridgeSDK(PLUGIN_ID);

const TTS_TIMEOUT_MS = 60_000;
/** Per-chunk budget — under the host's cap, cut at sentence boundaries. */
const CHUNK_MAX = 600;

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
/** Bumped on every stop/start — an old playback loop sees it and dies. */
let generation = 0;

interface VoiceConfig { engine: 'piper' | 'xtts' | 'browser'; voice: string; speed: number }
let cachedCfg: VoiceConfig | null = null;

/** The user's configured voice, from the host. Cached for the session. */
async function voiceConfig(): Promise<VoiceConfig> {
  if (cachedCfg) return cachedCfg;
  try {
    const c = await sdk.invoke<Partial<VoiceConfig>>('reader.voiceConfig');
    cachedCfg = {
      engine: c?.engine === 'xtts' || c?.engine === 'browser' ? c.engine : 'piper',
      voice: typeof c?.voice === 'string' ? c.voice : '',
      speed: typeof c?.speed === 'number' && c.speed > 0 ? c.speed : 1,
    };
  } catch { cachedCfg = { engine: 'piper', voice: '', speed: 1 }; }
  return cachedCfg;
}

/** Markdown and decoration OUT — the voice must never read "asterisk". */
export function ttsClean(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[\s>*#•·-]+/gm, '')
    .replace(/[*_#`~|]+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Sentence-boundary chunks, each under CHUNK_MAX. */
function chunkText(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const part of text.split(/(?<=[.!?…:;\n])\s+/)) {
    if (!part) continue;
    if (buf && buf.length + part.length + 1 > CHUNK_MAX) { out.push(buf); buf = part; }
    else buf = buf ? `${buf} ${part}` : part;
    // A single monster sentence still has to fit the host cap.
    while (buf.length > CHUNK_MAX) { out.push(buf.slice(0, CHUNK_MAX)); buf = buf.slice(CHUNK_MAX); }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

export function stopSpeaking(): void {
  generation++;
  try { current?.stop(); } catch { /* already ended */ }
  current = null;
  try { window.speechSynthesis?.cancel(); } catch { /* no system TTS here */ }
}

function decodePcm(base64: string, sampleRate: number): AudioBuffer {
  const raw = atob(base64);
  const samples = raw.length / 2;
  const audioCtx = (ctx ??= new AudioContext());
  const buf = audioCtx.createBuffer(1, samples, sampleRate || 22050);
  const channel = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) {
    const lo = raw.charCodeAt(i * 2);
    const hi = raw.charCodeAt(i * 2 + 1);
    let v = (hi << 8) | lo;
    if (v >= 0x8000) v -= 0x10000;
    channel[i] = v / 0x8000;
  }
  return buf;
}

function playPcm(base64: string, sampleRate: number, gen: number): Promise<void> {
  if (gen !== generation) return Promise.resolve();
  const buf = decodePcm(base64, sampleRate);
  const audioCtx = (ctx ??= new AudioContext());
  return new Promise<void>((resolve) => {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = () => { if (current === src) current = null; resolve(); };
    current = src;
    src.start();
  });
}

/** System-voice path (host says engine "browser"): speechSynthesis. */
async function speakBrowser(chunks: string[], cfg: VoiceConfig, gen: number): Promise<boolean> {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  const voice = synth.getVoices().find(v => v.name === cfg.voice) ?? null;
  let spoke = false;
  for (const chunk of chunks) {
    if (gen !== generation) break;
    const done = await new Promise<boolean>((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
    });
    if (!done) break;
    spoke = true;
  }
  return spoke;
}

/**
 * Speak a whole text in the user's configured voice. Resolves when playback
 * ends or is stopped. Returns false when nothing could be spoken.
 */
export async function speak(text: string): Promise<boolean> {
  stopSpeaking();
  const gen = generation;
  const chunks = chunkText(ttsClean(text));
  if (chunks.length === 0) return false;
  const cfg = await voiceConfig();
  tally('voice', null); // local engines — counted, never billed
  if (cfg.engine === 'browser') return speakBrowser(chunks, cfg, gen);
  let spoke = false;
  for (const chunk of chunks) {
    if (gen !== generation) break;
    try {
      const res = await sdk.invoke<{ success: boolean; pcmBase64?: string; sampleRate?: number }>(
        'reader.ttsSpeak',
        { text: chunk, voice: cfg.voice, speed: cfg.speed, engine: cfg.engine },
        TTS_TIMEOUT_MS,
      );
      if (!res?.success || !res.pcmBase64 || gen !== generation) break;
      await playPcm(res.pcmBase64, res.sampleRate ?? 22050, gen);
      spoke = true;
    } catch { break; }
  }
  return spoke;
}
