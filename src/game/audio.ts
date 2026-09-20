// Hyper-professional synthesized SFX + adaptive music — zero assets, pure WebAudio.
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  muted = false;

  private ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      return true;
    } catch {
      return false;
    }
  }

  unlock() {
    this.ensure();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  private osc(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, dest?: AudioNode) {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    const now = this.ctx.currentTime + t;
    o.frequency.setValueAtTime(Math.max(20, f0), now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    g.connect(dest ?? this.master);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterFreq: number, t = 0, type: BiquadFilterType = 'lowpass') {
    if (!this.ensure() || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    const now = ctx.currentTime + t;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now);
  }

  click() { this.osc('square', 700, 900, 0, 0.07, 0.12); }
  jump() {
    this.osc('square', 280, 620, 0, 0.16, 0.16);
    this.noise(0.08, 0.06, 2400, 0, 'highpass');
  }
  doubleJump() { this.osc('square', 420, 840, 0, 0.14, 0.14); }
  land() { this.noise(0.09, 0.12, 500); }
  coin() {
    this.osc('sine', 990, 990, 0, 0.09, 0.2);
    this.osc('sine', 1480, 1480, 0.07, 0.16, 0.2);
  }
  key() {
    this.osc('triangle', 520, 780, 0, 0.12, 0.22);
    this.osc('triangle', 780, 1170, 0.1, 0.16, 0.22);
    this.osc('sine', 1560, 1560, 0.2, 0.2, 0.16);
  }
  spikePop() {
    this.noise(0.12, 0.22, 3200, 0, 'highpass');
    this.osc('sawtooth', 180, 90, 0, 0.14, 0.16);
  }
  crumble() { this.noise(0.25, 0.18, 900); }
  splash() { this.noise(0.4, 0.25, 700); this.osc('sine', 220, 60, 0, 0.35, 0.2); }
  death() {
    this.noise(0.3, 0.3, 1800, 0, 'lowpass');
    this.osc('sawtooth', 420, 55, 0, 0.42, 0.26);
    this.osc('square', 220, 40, 0.05, 0.35, 0.12);
  }
  win() {
    const seq = [523, 659, 784, 1046, 784, 1046];
    seq.forEach((f, i) => this.osc('triangle', f, f, i * 0.09, 0.22, 0.22));
    this.noise(0.5, 0.06, 6000, 0.2, 'highpass');
  }
  door() {
    this.osc('sine', 140, 420, 0, 0.5, 0.2);
    this.noise(0.4, 0.08, 1200, 0.05);
  }
  checkpoint() { this.osc('sine', 660, 880, 0, 0.18, 0.18); }

  startMusic() {
    if (!this.ensure() || !this.ctx || this.musicTimer !== null) return;
    // Dark phrygian bass loop: E F E D C D — 132 BPM, hellish drone
    const bass = [82.4, 87.3, 82.4, 73.4, 65.4, 73.4, 82.4, 98];
    const tick = () => {
      if (!this.ctx || !this.musicGain) return;
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % bass.length;
      // kick on quarters
      if (s % 4 === 0) this.osc('sine', 120, 38, 0, 0.18, 0.5, this.musicGain);
      // hats offbeat
      if (s % 2 === 1) this.noiseHat();
      // bass pattern
      if (s === 0 || s === 6 || s === 10) {
        const f = bass[bar];
        this.osc('sawtooth', f, f, 0, 0.32, 0.32, this.musicGain);
        this.osc('sawtooth', f * 0.5, f * 0.5, 0, 0.32, 0.28, this.musicGain);
      }
      // eerie high bell every 2 bars
      if (this.step % 32 === 0) {
        const bell = [1244, 1318, 1174][Math.floor(this.step / 32) % 3];
        this.osc('sine', bell, bell * 0.995, 0.05, 1.2, 0.06, this.musicGain);
      }
      this.step++;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 60000 / 132 / 2);
  }

  private noiseHat() {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const dur = 0.04;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start();
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const sound = new SoundEngine();
