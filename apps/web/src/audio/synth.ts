// A small plucked-string voice. The point is pitch and rhythm reference, not realism: pitch comes in
// as an exact frequency, so koron and sori need no detune tricks here.

export class Synth {
  readonly ctx: AudioContext;
  private master: GainNode;
  private live = new Set<AudioScheduledSourceNode>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
  }

  setVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** Pluck at `hz` from context time `t0`, releasing after `dur` seconds. */
  pluck(hz: number, t0: number, dur: number, velocity = 1): void {
    const ctx = this.ctx;
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(hz * 8, 12000), t0);
    filter.frequency.exponentialRampToValueAtTime(Math.min(hz * 2.5, 8000), t0 + 0.25);
    filter.Q.value = 0.7;

    const peak = 0.22 * velocity;
    const end = t0 + Math.max(dur, 0.05);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.004);
    env.gain.setTargetAtTime(peak * 0.35, t0 + 0.004, 0.12); // the pluck fades toward a sustain...
    env.gain.setTargetAtTime(0.0001, end, 0.03); // ...and releases at the written end
    env.connect(filter).connect(this.master);

    const partials: Array<[OscillatorType, number, number]> = [
      ['triangle', 1, 1],
      ['sine', 2, 0.25],
      ['sine', 3, 0.08],
    ];
    for (const [type, mult, gain] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz * mult;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(env);
      this.track(osc, t0, end + 0.25);
    }
  }

  /** A short click; `accent` for the first beat of a bar. */
  click(t0: number, accent: boolean): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1760 : 1175;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(accent ? 0.18 : 0.11, t0 + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    osc.connect(env).connect(this.master);
    this.track(osc, t0, t0 + 0.05);
  }

  /** Silence everything already scheduled, e.g. on seek or pause. */
  stopAll(): void {
    const now = this.ctx.currentTime;
    for (const n of this.live) {
      try {
        n.stop(now);
      } catch {
        // Already stopped.
      }
    }
    this.live.clear();
  }

  private track(node: AudioScheduledSourceNode, start: number, stop: number): void {
    node.start(start);
    node.stop(stop);
    this.live.add(node);
    node.onended = () => this.live.delete(node);
  }
}
