import type { Beat, PlayNote } from '@mousique/core';
import { Synth } from './synth.ts';

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
/** How far before its principal each grace note sounds. */
const GRACE_LEAD_S = 0.075;
/** Scheduling window for grace notes beyond the normal lookahead; covers up to four before a note. */
const GRACE_WINDOW_S = 0.35;

export interface PlayerOptions {
  bpm: number;
  speed: number;
  metronome: boolean;
  countIn: boolean;
  synth: boolean;
}

/**
 * Plays the score from the AudioContext clock with a lookahead scheduler. With no recording attached
 * this clock is the master: the cursor reads `q()`.
 */
export class Player {
  readonly synth = new Synth();
  private notes: PlayNote[] = [];
  private beats: Beat[] = [];
  private totalQ = 0;
  private meterAt: (q: number) => { beats: number; beatQ: number } = () => ({ beats: 4, beatQ: 1 });
  private opts: PlayerOptions = { bpm: 72, speed: 1, metronome: false, countIn: false, synth: true };

  private playing = false;
  /** Context time at which the score is at `anchorQ`. */
  private anchorT = 0;
  private anchorQ = 0;
  private scheduledQ = 0;
  /** Grace notes sound before their onset, so they are scheduled further ahead on their own pointer. */
  private graceScheduledQ = 0;
  private timer: number | undefined;
  private onEnd: (() => void) | undefined;

  setMaterial(
    notes: PlayNote[],
    beats: Beat[],
    totalQ: number,
    meterAt: (q: number) => { beats: number; beatQ: number },
  ): void {
    this.meterAt = meterAt;
    this.notes = notes;
    this.beats = beats;
    this.totalQ = totalQ;
    if (this.playing) this.restartAt(this.q());
  }

  setOptions(patch: Partial<PlayerOptions>): void {
    const tempoChanged =
      (patch.bpm !== undefined && patch.bpm !== this.opts.bpm) ||
      (patch.speed !== undefined && patch.speed !== this.opts.speed);
    const q = this.q();
    this.opts = { ...this.opts, ...patch };
    if (this.playing && tempoChanged) this.restartAt(q);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Quarter notes per second at the current tempo and practice speed. */
  private qps(): number {
    return (this.opts.bpm * this.opts.speed) / 60;
  }

  /** Current score position. Negative during a count-in. */
  q(): number {
    if (!this.playing) return this.anchorQ;
    return this.anchorQ + (this.synth.ctx.currentTime - this.anchorT) * this.qps();
  }

  private timeOf(q: number): number {
    return this.anchorT + (q - this.anchorQ) / this.qps();
  }

  async play(fromQ = this.anchorQ, onEnd?: () => void): Promise<void> {
    await this.synth.resume();
    this.onEnd = onEnd;
    if (fromQ >= this.totalQ - 1e-9) fromQ = 0;
    const now = this.synth.ctx.currentTime + 0.05;
    let lead = 0;
    if (this.opts.countIn) {
      // One bar of the meter in force where playback starts.
      const { beats, beatQ } = this.meterAt(fromQ);
      lead = (beats * beatQ) / this.qps();
      for (let i = 0; i < beats; i++) this.synth.click(now + (i * beatQ) / this.qps(), i === 0);
    }
    this.anchorQ = fromQ;
    this.anchorT = now + lead;
    this.scheduledQ = fromQ;
    this.graceScheduledQ = fromQ;
    this.playing = true;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  pause(): void {
    if (!this.playing) return;
    const q = this.q();
    this.stopClock();
    this.anchorQ = Math.max(0, Math.min(q, this.totalQ));
  }

  /** Move to q. Keeps playing if it was playing. */
  seek(q: number): void {
    q = Math.max(0, Math.min(q, this.totalQ));
    if (this.playing) this.restartAt(q);
    else this.anchorQ = q;
  }

  stop(): void {
    this.stopClock();
    this.anchorQ = 0;
  }

  private stopClock(): void {
    this.playing = false;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.synth.stopAll();
  }

  private restartAt(q: number): void {
    this.synth.stopAll();
    this.anchorQ = q;
    this.anchorT = this.synth.ctx.currentTime + 0.03;
    this.scheduledQ = q;
    this.graceScheduledQ = q;
  }

  private tick(): void {
    if (!this.playing) return;
    const ctx = this.synth.ctx;
    const horizonQ = this.anchorQ + (ctx.currentTime + LOOKAHEAD_S - this.anchorT) * this.qps();
    const from = this.scheduledQ;
    const to = Math.min(horizonQ, this.totalQ + 1e-9);
    if (to > from) {
      this.schedule(from, to);
      this.scheduledQ = to;
    }
    const graceTo = Math.min(horizonQ + GRACE_WINDOW_S * this.qps(), this.totalQ + 1e-9);
    if (graceTo > this.graceScheduledQ) {
      this.scheduleGraces(this.graceScheduledQ, graceTo);
      this.graceScheduledQ = graceTo;
    }
    if (this.q() >= this.totalQ) {
      const end = this.onEnd;
      this.stop();
      end?.();
    }
  }

  /** Schedule every note and click with onset in [fromQ, toQ). */
  private schedule(fromQ: number, toQ: number): void {
    const spq = 1 / this.qps();
    if (this.opts.synth) {
      for (const n of this.notes) {
        if (n.q < fromQ - 1e-9 || n.q >= toQ - 1e-9) continue;
        // A note starting exactly at the seek point belongs to this pass; one before it does not.
        if (n.q < this.anchorQ - 1e-9) continue;
        if (n.graceRank > 0) continue;
        const t = this.timeOf(n.q);
        const dur = n.dq * spq;
        if (n.tremoloQ > 0) {
          const step = n.tremoloQ * spq;
          for (let s = 0; s < dur - 1e-6; s += step) this.synth.pluck(n.hz, t + s, step * 0.95, s === 0 ? 1 : 0.8);
        } else {
          this.synth.pluck(n.hz, t, dur * 0.97, n.legato ? 0.55 : 1);
        }
      }
    }
    if (this.opts.metronome) {
      for (const b of this.beats) {
        if (b.q >= fromQ - 1e-9 && b.q < toQ - 1e-9 && b.q >= this.anchorQ - 1e-9) {
          this.synth.click(this.timeOf(b.q), b.downbeat);
        }
      }
    }
  }

  private scheduleGraces(fromQ: number, toQ: number): void {
    if (!this.opts.synth) return;
    const now = this.synth.ctx.currentTime;
    for (const n of this.notes) {
      if (n.graceRank === 0 || n.q < fromQ - 1e-9 || n.q >= toQ - 1e-9 || n.q < this.anchorQ - 1e-9) continue;
      const t = this.timeOf(n.q) - n.graceRank * GRACE_LEAD_S;
      if (t >= now) this.synth.pluck(n.hz, t, GRACE_LEAD_S * 0.9, 0.8);
    }
  }

  /** A fixed test of the tuning: natural, koron, natural, sori, each half a second. */
  async tuningCheck(hz: { natural: number; koron: number; sori: number }): Promise<void> {
    await this.synth.resume();
    const t = this.synth.ctx.currentTime + 0.05;
    const seq = [hz.natural, hz.koron, hz.natural, hz.sori, hz.natural];
    seq.forEach((f, i) => this.synth.pluck(f, t + i * 0.6, 0.55));
  }
}
