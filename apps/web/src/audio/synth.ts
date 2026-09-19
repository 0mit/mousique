// A small plucked-string voice. The point is pitch and rhythm reference, not realism: pitch comes in
// as an exact frequency, so koron and sori need no detune tricks here.

/** How long stopping takes: the fade out, after which new sounds may start. */
export const STOP_FADE_S = 0.025;

export class Synth {
  readonly ctx: AudioContext;
  private master: GainNode;
  /** Everything passes through this, so stopping can fade out instead of cutting a waveform mid-swing. */
  private duck: GainNode;
  private live = new Set<AudioScheduledSourceNode>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.duck = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.duck).connect(comp).connect(this.ctx.destination);
  }

  setVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /**
   * A gain node that is silent until its automation says otherwise. A new GainNode starts at 1, and a source
   * starting between two samples is rendered from the sample before its start, ahead of a setValueAtTime(0)
   * there — one full-level sample, heard as a tick.
   */
  envelope(): GainNode {
    const env = this.ctx.createGain();
    env.gain.value = 0;
    return env;
  }

  /** Pluck at `hz` from context time `t0`, releasing after `dur` seconds. */
  pluck(hz: number, t0: number, dur: number, velocity = 1): void {
    const ctx = this.ctx;
    const env = this.envelope();
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
    const env = this.envelope();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(accent ? 0.18 : 0.11, t0 + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    osc.connect(env).connect(this.master);
    this.track(osc, t0, t0 + 0.05);
  }

  /**
   * Silence everything already scheduled, e.g. on seek or pause: fade the whole output out over a few
   * milliseconds, stop the sources once it is silent, and open it again for what is scheduled next (which
   * never starts sooner than STOP_FADE_S from now).
   */
  stopAll(): void {
    const now = this.ctx.currentTime;
    const g = this.duck.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0, now, STOP_FADE_S / 5);
    g.setValueAtTime(1, now + STOP_FADE_S);
    for (const n of this.live) {
      try {
        n.stop(now + STOP_FADE_S * 0.9);
      } catch {
        // Already stopped.
      }
    }
    this.live.clear();
  }

  /** Where other voices (speech) join the mix, so they share the volume and the compressor. */
  get output(): AudioNode {
    return this.master;
  }

  /** Stop this node, too, when everything scheduled is silenced (seek, pause, stop). */
  adopt(node: AudioScheduledSourceNode): void {
    this.live.add(node);
    node.addEventListener('ended', () => this.live.delete(node));
  }

  private track(node: AudioScheduledSourceNode, start: number, stop: number): void {
    node.start(start);
    node.stop(stop);
    this.live.add(node);
    node.onended = () => this.live.delete(node);
  }
}
