// Pre-generated speech (tools/voice/generate.py): each bank is one MP3 holding every clip at several
// pitch-preserving lengths, with a JSON index. A bank is fetched and decoded once, then reused for every
// playback; nothing is synthesized in the browser.

interface Variant {
  /** Note names: the stretch factor of this rendering. */
  factor?: number;
  /** Rhythm words: the beat length (seconds) this rendering puts its syllables on. */
  beat?: number;
  start: number;
  duration: number;
  /** Seconds from the clip's start to its first vowel onset — the moment that belongs on the grid. */
  lead: number;
}

interface Candidate {
  params: { length: number; noise: number };
  /** How far the take's natural syllable spacing is from the word's note pattern (lower = less warped). */
  cost: number;
  variants: Variant[];
}

interface Clip {
  text: string;
  /** Note names: one rendering at several lengths. */
  variants?: Variant[];
  /** Rhythm words: several candidate takes, each rendered at several beat lengths. */
  units?: number[];
  candidates?: Candidate[];
}

export interface CandidateInfo {
  word: string;
  text: string;
  units: number[];
  candidates: Array<{ params: Candidate['params']; cost: number }>;
}

interface VoiceIndex {
  /** firstSound: where the first clip crosses |x| > 0.02 in the audio as encoded (see measureShift). */
  banks: Record<string, { file: string; clips: Record<string, Clip>; firstSound?: number }>;
}

const BASE = `${import.meta.env.BASE_URL}voice/`;

function allVariants(c: Clip): Variant[] {
  return [...(c.variants ?? []), ...(c.candidates ?? []).flatMap((k) => k.variants)];
}

/** How much the playback rate may move to close the gap between two stored lengths (it shifts pitch). */
const RATE_MIN = 0.87;
const RATE_MAX = 1.18;
/** A spoken clip fills this share of its note, so consecutive notes do not run into each other. */
const FILL = 0.9;

let indexPromise: Promise<VoiceIndex> | undefined;

function loadIndex(): Promise<VoiceIndex> {
  indexPromise ??= fetch(`${BASE}index.json`).then((r) => {
    if (!r.ok) throw new Error(`voice index: ${r.status}`);
    return r.json() as Promise<VoiceIndex>;
  });
  return indexPromise;
}

export class VoiceBank {
  private constructor(
    readonly name: string,
    private readonly clips: Record<string, Clip>,
    private readonly buffer: AudioBuffer,
    /** Seconds the decoded audio runs late of the index (MP3 encoder padding, which decoders treat differently). */
    private readonly shift: number,
  ) {}

  /**
   * Measure the decoder's shift once: find where the first clip's sound actually begins and compare it with
   * where the index says it begins. Every clip in the bank moves by the same amount.
   */
  private static measureShift(buffer: AudioBuffer, clips: Record<string, Clip>, firstSound?: number): number {
    const first = Math.min(...Object.values(clips).flatMap((c) => allVariants(c).map((v) => v.start)));
    // Compare like with like: the generator recorded where the same crossing happens before encoding.
    const reference = firstSound ?? first;
    const data = buffer.getChannelData(0);
    const from = Math.floor(Math.max(0, first - 0.1) * buffer.sampleRate);
    const to = Math.min(data.length, Math.floor((first + 0.5) * buffer.sampleRate));
    for (let i = from; i < to; i++) {
      if (Math.abs(data[i]!) > 0.02) return Math.min(0.12, Math.max(-0.05, i / buffer.sampleRate - reference));
    }
    return 0;
  }

  private static cache = new Map<string, Promise<VoiceBank>>();

  /** Load a bank once per page; later calls get the same decoded audio. */
  static load(ctx: BaseAudioContext, name: string): Promise<VoiceBank> {
    let p = VoiceBank.cache.get(name);
    if (!p) {
      p = (async () => {
        const index = await loadIndex();
        const bank = index.banks[name];
        if (!bank) throw new Error(`no voice bank ${name}`);
        const data = await fetch(`${BASE}${bank.file}`).then((r) => r.arrayBuffer());
        const buffer = await ctx.decodeAudioData(data);
        return new VoiceBank(name, bank.clips, buffer, VoiceBank.measureShift(buffer, bank.clips, bank.firstSound));
      })();
      VoiceBank.cache.set(name, p);
      p.catch(() => VoiceBank.cache.delete(name));
    }
    return p;
  }

  has(key: string): boolean {
    return key in this.clips;
  }

  /** The rhythm words this bank holds and their candidates, for the voice lab. */
  words(): CandidateInfo[] {
    return Object.entries(this.clips)
      .filter(([, c]) => c.candidates)
      .map(([word, c]) => ({ word, text: c.text, units: c.units ?? [], candidates: c.candidates!.map(({ params, cost }) => ({ params, cost })) }));
  }

  /**
   * Speak a note name so that its vowel onset falls on `t0`, fitted to a note `seconds` long: the stored
   * length nearest the target is chosen, the rate nudged toward it, and any overrun faded at the note's end.
   */
  speak(ctx: BaseAudioContext, out: AudioNode, key: string, t0: number, seconds: number, gain = 1): AudioScheduledSourceNode | undefined {
    let clip = this.clips[key];
    if (!clip?.variants || seconds <= 0.02) return undefined;
    const target = seconds * FILL;
    // A name with its accidental ("لا کرن") that cannot fit even at its shortest is said without it ("لا"),
    // rather than cut off mid-word.
    const shortest = Math.min(...clip.variants.map((v) => v.duration)) / RATE_MAX;
    const base = key.split('-')[0]!;
    if (key.includes('-') && shortest > target * 1.25 && this.clips[base]?.variants) clip = this.clips[base]!;
    const variants = clip.variants!;
    let best = variants[0]!;
    for (const v of variants) {
      if (Math.abs(Math.log(v.duration / target)) < Math.abs(Math.log(best.duration / target))) best = v;
    }
    const rate = Math.min(RATE_MAX, Math.max(RATE_MIN, best.duration / target));
    return this.play(ctx, out, best, rate, t0, seconds, gain);
  }

  /**
   * Speak a rhythm word for a beat that starts on `t0` and lasts `beatSeconds`. Each word was rendered with
   * its syllables' vowel onsets exactly on the sixteenths of several beat lengths; the nearest is chosen and
   * its rate adjusted so those onsets fall on this beat's grid, the first one on `t0` itself.
   */
  speakBeat(
    ctx: BaseAudioContext,
    out: AudioNode,
    key: string,
    t0: number,
    beatSeconds: number,
    gain = 1,
    setting: { candidate: number; gainDb: number; nudgeMs: number } = { candidate: 0, gainDb: 0, nudgeMs: 0 },
  ): AudioScheduledSourceNode | undefined {
    const clip = this.clips[key];
    const candidates = clip?.candidates;
    if (!candidates?.length || beatSeconds <= 0.05) return undefined;
    const chosen = candidates[Math.min(Math.max(0, setting.candidate), candidates.length - 1)]!;
    t0 += setting.nudgeMs / 1000;
    gain *= 10 ** (setting.gainDb / 20);
    let best = chosen.variants[0]!;
    for (const v of chosen.variants) {
      if (Math.abs(Math.log(v.beat! / beatSeconds)) < Math.abs(Math.log(best.beat! / beatSeconds))) best = v;
    }
    // The rate that maps this rendering's beat onto the real one; beyond the nudge range, the grid wins.
    const rate = best.beat! / beatSeconds;
    return this.play(ctx, out, best, rate, t0, beatSeconds + best.lead / rate, gain);
  }

  /** Play a stored rendering so that its first vowel onset sounds at `grid`. */
  private play(ctx: BaseAudioContext, out: AudioNode, v: Variant, rate: number, grid: number, maxSeconds: number, gain: number): AudioScheduledSourceNode {
    const heard = v.duration / rate;
    let start = grid - v.lead / rate;
    let offset = Math.max(0, v.start + this.shift);
    // Scheduled too late for the lead-in: skip into the clip, so the vowel still lands on the grid.
    const now = ctx.currentTime + 0.005;
    if (start < now) {
      offset += (now - start) * rate;
      start = now;
    }
    const end = Math.min(grid - v.lead / rate + heard, grid + maxSeconds);
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.006);
    if (end < grid - v.lead / rate + heard) {
      // Still too long: fade out as the note ends rather than spill into the next one.
      env.gain.setValueAtTime(gain, Math.max(start + 0.01, end - 0.04));
      env.gain.linearRampToValueAtTime(0, end);
    }
    src.connect(env).connect(out);
    src.start(start, offset, Math.max(0.01, v.duration - (offset - v.start - this.shift)));
    src.stop(end + 0.01);
    return src;
  }
}
