// Particles, decals, floating text, screen shake and synthesized sound.

class Effects {
  constructor() {
    this.particles = [];
    this.decals = [];
    this.texts = [];
    this.flashes = [];
    this.shake = 0;
  }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.exp(-dt * (p.drag || 4));
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
      if (p.life <= 0 && p.decal) this.addDecal(p.x, p.y, p.size * 1.4, p.color, 0.7);
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) {
      t.y -= 30 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);

    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);

    this.shake = Math.max(0, this.shake - dt * 30);
  }

  addDecal(x, y, r, color, alpha) {
    this.decals.push({ x, y, r, color, alpha });
    if (this.decals.length > 400) this.decals.shift();
  }

  blood(x, y, angle, color = "#7a0f0f") {
    for (let i = 0; i < 6; i++) {
      const a = angle + Util.rand(-0.6, 0.6);
      const s = Util.rand(60, 220);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: Util.rand(0.2, 0.5),
        maxLife: 0.5,
        size: Util.rand(2, 4),
        color,
        decal: Math.random() < 0.4,
      });
    }
  }

  gore(x, y, color = "#7a0f0f") {
    for (let i = 0; i < 18; i++) {
      const a = Util.rand(0, TAU);
      const s = Util.rand(40, 260);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: Util.rand(0.3, 0.8),
        maxLife: 0.8,
        size: Util.rand(2, 5),
        color,
        decal: true,
      });
    }
    this.addDecal(x, y, Util.rand(14, 22), color, 0.8);
  }

  sparks(x, y, angle) {
    for (let i = 0; i < 5; i++) {
      const a = angle + Math.PI + Util.rand(-0.9, 0.9);
      const s = Util.rand(80, 260);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: Util.rand(0.1, 0.25),
        maxLife: 0.25,
        size: 2,
        color: "#ffd54f",
        glow: true,
      });
    }
  }

  splinters(x, y) {
    for (let i = 0; i < 4; i++) {
      const a = Util.rand(0, TAU);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * 120,
        vy: Math.sin(a) * 120,
        life: 0.4,
        maxLife: 0.4,
        size: 3,
        color: "#8d6e63",
      });
    }
  }

  shell(x, y, angle) {
    const a = angle + Math.PI / 2 + Util.rand(-0.3, 0.3);
    this.particles.push({
      x, y,
      vx: Math.cos(a) * 110,
      vy: Math.sin(a) * 110,
      life: 0.5,
      maxLife: 0.5,
      size: 2,
      color: "#c9a227",
      drag: 6,
    });
  }

  explosion(x, y, radius) {
    for (let i = 0; i < 40; i++) {
      const a = Util.rand(0, TAU);
      const s = Util.rand(80, radius * 4);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: Util.rand(0.3, 0.7),
        maxLife: 0.7,
        size: Util.rand(3, 7),
        color: Util.pick(["#ff9800", "#ffc107", "#ff5722", "#795548"]),
        glow: true,
      });
    }
    this.addDecal(x, y, radius * 0.6, "#1b1b12", 0.7);
    this.flash(x, y, radius * 2.5, 0.25);
    this.shake = Math.max(this.shake, 14);
  }

  flash(x, y, radius, life = 0.06) {
    this.flashes.push({ x, y, radius, life, maxLife: life });
  }

  text(x, y, str, color = "#fff") {
    this.texts.push({ x, y, str, color, life: 1, maxLife: 1 });
  }
}

// Tiny WebAudio synthesizer so the game needs no sound files.
class Sound {
  constructor() {
    this.ctx = null;
    this.muted = Store.get("zombie.muted", false);
    this.lastPlayed = {};
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    Store.set("zombie.muted", this.muted);
    return this.muted;
  }

  noiseBurst(duration, freq, volume, type = "lowpass") {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration);
  }

  tone(freq, endFreq, duration, volume, wave = "sine") {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = wave;
    const g = c.createGain();
    const t = c.currentTime;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration);
  }

  play(name, volume = 1) {
    if (!this.ctx || this.muted) return;
    // Throttle identical sounds so swarms don't clip.
    const now = this.ctx.currentTime;
    const minGap = name === "groan" ? 0.25 : 0.03;
    if (now - (this.lastPlayed[name] || 0) < minGap) return;
    this.lastPlayed[name] = now;
    const v = volume;
    switch (name) {
      case "pistol":
        this.noiseBurst(0.12, 2500, 0.6 * v);
        this.tone(180, 60, 0.08, 0.3 * v, "square");
        break;
      case "shotgun":
        this.noiseBurst(0.3, 1400, 0.9 * v);
        this.tone(120, 40, 0.18, 0.5 * v, "square");
        break;
      case "rifle":
        this.noiseBurst(0.08, 3200, 0.5 * v);
        this.tone(220, 80, 0.05, 0.2 * v, "square");
        break;
      case "sniper":
        this.noiseBurst(0.45, 1800, 1 * v);
        this.tone(90, 30, 0.3, 0.5 * v, "sawtooth");
        break;
      case "reload":
        this.tone(800, 600, 0.05, 0.2 * v, "square");
        setTimeout(() => this.ctx && this.tone(500, 900, 0.06, 0.2 * v, "square"), 160);
        break;
      case "empty":
        this.tone(1200, 1000, 0.03, 0.2 * v, "square");
        break;
      case "hit":
        this.noiseBurst(0.06, 800, 0.3 * v);
        break;
      case "death":
        this.tone(140, 50, 0.4, 0.3 * v, "sawtooth");
        this.noiseBurst(0.2, 600, 0.3 * v);
        break;
      case "groan":
        this.tone(Util.rand(70, 110), Util.rand(45, 60), Util.rand(0.6, 1.1), 0.25 * v, "sawtooth");
        break;
      case "hurt":
        this.tone(300, 120, 0.2, 0.4 * v, "triangle");
        break;
      case "pickup":
        this.tone(600, 1200, 0.12, 0.3 * v, "triangle");
        break;
      case "build":
        this.noiseBurst(0.1, 500, 0.5 * v);
        setTimeout(() => this.ctx && this.noiseBurst(0.1, 500, 0.5 * v), 120);
        break;
      case "explosion":
        this.noiseBurst(0.9, 600, 1.2 * v);
        this.tone(80, 20, 0.7, 0.6 * v, "sine");
        break;
      case "spit":
        this.noiseBurst(0.15, 1200, 0.3 * v, "bandpass");
        break;
      case "wave":
        this.tone(220, 110, 1.2, 0.35 * v, "sawtooth");
        this.tone(165, 82, 1.2, 0.35 * v, "sawtooth");
        break;
      case "perk":
        this.tone(440, 880, 0.25, 0.3 * v, "triangle");
        setTimeout(() => this.ctx && this.tone(660, 1320, 0.25, 0.3 * v, "triangle"), 120);
        break;
    }
  }
}
