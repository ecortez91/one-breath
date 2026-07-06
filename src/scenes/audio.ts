/**
 * Synthesized dive soundscape — no audio assets, everything is WebAudio.
 *
 * Design notes:
 * - The ocean ambience is filtered noise; the filter closes as you sink,
 *   so the world literally muffles with depth.
 * - The heartbeat follows the mammalian dive reflex: it SLOWS as you
 *   descend and calms further in stillness. Low O2 makes it loud and urgent.
 */
const MUTE_KEY = 'onebreath_muted';

class DiveAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private lowpass?: BiquadFilterNode;
  private ambienceGain?: GainNode;
  private bpm = 62;
  private hbIntensity = 0.5;
  muted = localStorage.getItem(MUTE_KEY) === '1';

  /** Call from a user gesture (browser autoplay rules). Safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 900;
    this.lowpass.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.startAmbience();
    this.startHeartbeat();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  /** Depth drives the muffling: bright at the surface, closed in the deep. */
  setDepth(m: number): void {
    if (!this.lowpass || !this.ctx) return;
    const f = Math.max(220, 900 - m * 3.2);
    this.lowpass.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.4);
  }

  /** bpm ~36-110; intensity 0..1 (loudness/urgency of each thump) */
  setHeart(bpm: number, intensity: number): void {
    this.bpm = Math.max(36, Math.min(110, bpm));
    this.hbIntensity = Math.max(0, Math.min(1, intensity));
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // brown-ish noise: integrate white noise
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998;
      data[i] = last * 3.5;
    }
    return buf;
  }

  private startAmbience(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(6);
    src.loop = true;
    this.ambienceGain = ctx.createGain();
    this.ambienceGain.gain.value = 0.16;
    // slow swell so the water feels alive
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(this.ambienceGain.gain);
    src.connect(this.ambienceGain);
    this.ambienceGain.connect(this.lowpass!);
    src.start();
    lfo.start();
  }

  private startHeartbeat(): void {
    const beat = () => {
      this.thump(0.9 * this.hbIntensity + 0.25);
      window.setTimeout(() => this.thump(0.6 * this.hbIntensity + 0.15), 180);
      window.setTimeout(beat, 60000 / this.bpm);
    };
    beat();
  }

  private thump(vol: number): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5 * vol, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  /** Short filtered-noise whoosh for a fin kick. */
  kick(perfect: boolean): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = perfect ? 620 : 420;
    bp.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(perfect ? 0.5 : 0.32, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.lowpass!);
    src.start();
  }

  /** Dull thud: a missed cue or a sting. */
  thud(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  /** Deep slow gliss for crossing a zone or milestone — whale-adjacent. */
  deepTone(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(88, ctx.currentTime + 1.4);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
    osc.connect(gain);
    gain.connect(this.lowpass!);
    osc.start();
    osc.stop(ctx.currentTime + 1.7);
  }

  /** Gentle rising triad: the white card. */
  chime(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    [392, 494, 587].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(t0);
      osc.stop(t0 + 1);
    });
  }

  /** Bubble pop for cave pickups. */
  pop(): void {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }
}

export const diveAudio = new DiveAudio();
