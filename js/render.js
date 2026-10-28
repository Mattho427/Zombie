// All canvas drawing. Reads game state, never mutates it.
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.light = document.createElement("canvas");
    this.lctx = this.light.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    for (const c of [this.canvas, this.light]) {
      c.width = Math.floor(this.w * this.dpr);
      c.height = Math.floor(this.h * this.dpr);
    }
  }

  inView(x, y, margin, cam) {
    return x > cam.x - margin && x < cam.x + this.w + margin && y > cam.y - margin && y < cam.y + this.h + margin;
  }

  draw(game) {
    const ctx = this.ctx;
    const cam = game.camera;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#0b0d0a";
    ctx.fillRect(0, 0, this.w, this.h);

    const sx = (Math.random() - 0.5) * game.effects.shake;
    const sy = (Math.random() - 0.5) * game.effects.shake;
    ctx.save();
    ctx.translate(-cam.x + sx, -cam.y + sy);

    this.drawGround(game, cam);
    this.drawDecals(game, cam);
    this.drawPickups(game, cam);
    this.drawShadows(game, cam);
    for (const z of game.zombies) if (this.inView(z.x, z.y, 60, cam)) this.drawZombie(z);
    if (!game.player.dead) this.drawPlayer(game.player);
    this.drawProjectiles(game);
    this.drawParticles(game);
    this.drawObstacles(game, cam);
    this.drawBarricades(game, cam);
    this.drawTexts(game);
    ctx.restore();

    this.drawLighting(game, sx, sy);
    this.drawVignette(game);
    if (game.state !== "menu") this.drawMinimap(game);
  }

  drawGround(game, cam) {
    const ctx = this.ctx;
    const world = game.world;
    ctx.fillStyle = "#2b3324";
    ctx.fillRect(0, 0, world.size, world.size);

    ctx.fillStyle = "#33402a";
    for (const p of world.parks) ctx.fillRect(p.x, p.y, p.w, p.h);
    for (const d of world.decor) {
      if (!this.inView(d.x, d.y, 20, cam)) continue;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }

    // Sidewalks, asphalt, lane markings
    for (const r of world.roads) {
      ctx.fillStyle = "#4a4a44";
      ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
    }
    for (const r of world.roads) {
      ctx.fillStyle = "#26272a";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.strokeStyle = "rgba(220, 200, 90, 0.45)";
    ctx.lineWidth = 4;
    ctx.setLineDash([36, 30]);
    ctx.beginPath();
    for (const r of world.roads) {
      if (r.w > r.h) {
        ctx.moveTo(r.x, r.y + r.h / 2);
        ctx.lineTo(r.x + r.w, r.y + r.h / 2);
      } else {
        ctx.moveTo(r.x + r.w / 2, r.y);
        ctx.lineTo(r.x + r.w / 2, r.y + r.h);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Map border
    ctx.strokeStyle = "#8b1a1a";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, world.size, world.size);
  }

  drawDecals(game, cam) {
    const ctx = this.ctx;
    for (const d of game.effects.decals) {
      if (!this.inView(d.x, d.y, d.r, cam)) continue;
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawShadows(game, cam) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    for (const o of game.world.obstacles) {
      if (o.kind !== "building" || !this.inView(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h), cam)) continue;
      ctx.fillRect(o.x + 10, o.y + 10, o.w, o.h);
    }
  }

  drawObstacles(game, cam) {
    const ctx = this.ctx;
    for (const o of game.world.obstacles) {
      if (!this.inView(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h), cam)) continue;
      if (o.kind === "building") {
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = o.roof;
        ctx.fillRect(o.x + 8, o.y + 8, o.w - 16, o.h - 16);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
        // Rooftop vents
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(o.x + o.w * 0.2, o.y + o.h * 0.25, 18, 18);
        ctx.fillRect(o.x + o.w * 0.65, o.y + o.h * 0.6, 24, 14);
      } else if (o.kind === "car") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(o.x + 4, o.y + 4, o.w, o.h);
        ctx.fillStyle = o.color;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = "rgba(160, 200, 220, 0.35)";
        if (o.w > o.h) ctx.fillRect(o.x + o.w * 0.25, o.y + 4, o.w * 0.4, o.h - 8);
        else ctx.fillRect(o.x + 4, o.y + o.h * 0.25, o.w - 8, o.h * 0.4);
      } else if (o.kind === "tree") {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.arc(cx + 6, cy + 6, o.w * 0.75, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#1f3a17";
        ctx.beginPath();
        ctx.arc(cx, cy, o.w * 0.75, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#2d5222";
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 4, o.w * 0.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawBarricades(game, cam) {
    const ctx = this.ctx;
    for (const b of game.world.barricades) {
      if (!this.inView(b.x, b.y, 100, cam)) continue;
      ctx.fillStyle = "#6d4c41";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = "#3e2723";
      ctx.lineWidth = 2;
      const planks = 4;
      ctx.beginPath();
      for (let i = 1; i < planks; i++) {
        if (b.w > b.h) {
          ctx.moveTo(b.x + (b.w / planks) * i, b.y);
          ctx.lineTo(b.x + (b.w / planks) * i, b.y + b.h);
        } else {
          ctx.moveTo(b.x, b.y + (b.h / planks) * i);
          ctx.lineTo(b.x + b.w, b.y + (b.h / planks) * i);
        }
      }
      ctx.stroke();
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      if (b.hp < b.maxHp) this.healthBar(b.x + b.w / 2, b.y - 8, 40, b.hp / b.maxHp, "#a1887f");
    }
  }

  healthBar(x, y, w, frac, color) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * Util.clamp(frac, 0, 1), 4);
  }

  drawPickups(game, cam) {
    const ctx = this.ctx;
    for (const p of game.pickups) {
      if (!this.inView(p.x, p.y, 30, cam)) continue;
      if (p.life < 5 && Math.floor(p.life * 6) % 2 === 0) continue;
      const def = PICKUP_TYPES[p.type];
      const bob = Math.sin(game.time * 4 + p.bob) * 2;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 12;
      if (p.type === "medkit") {
        ctx.fillStyle = "#f5f5f5";
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = def.color;
        ctx.fillRect(-3, -7, 6, 14);
        ctx.fillRect(-7, -3, 14, 6);
      } else if (p.type === "ammo") {
        ctx.fillStyle = "#4e5b31";
        ctx.fillRect(-11, -8, 22, 16);
        ctx.fillStyle = def.color;
        for (let i = -1; i <= 1; i++) ctx.fillRect(i * 6 - 2, -5, 4, 10);
      } else if (p.type === "scrap") {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(-9, 6);
        ctx.lineTo(-4, -8);
        ctx.lineTo(8, -5);
        ctx.lineTo(10, 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#616161";
        ctx.fillRect(-3, -2, 6, 4);
      } else {
        // Weapon crate
        ctx.fillStyle = "#3e4a2a";
        ctx.fillRect(-14, -9, 28, 18);
        ctx.fillStyle = def.color;
        ctx.fillRect(-10, -2, 20, 4);
        ctx.fillRect(-10, 2, 5, 4);
      }
      ctx.restore();
    }
  }

  drawPlayer(p) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.arc(3, 4, p.r, 0, TAU);
    ctx.fill();
    ctx.rotate(p.angle);

    const gunLen = { pistol: 14, shotgun: 22, rifle: 26, sniper: 32 }[p.weapon.type];
    const sway = Math.sin(p.walkCycle) * 2;
    ctx.fillStyle = "#222";
    ctx.fillRect(p.r - 4, 2, gunLen, 5);
    // Arms
    ctx.fillStyle = "#c69c7a";
    ctx.beginPath();
    ctx.arc(p.r - 2, 6 + sway * 0.3, 4, 0, TAU);
    ctx.arc(p.r - 6, -6 - sway * 0.3, 4, 0, TAU);
    ctx.fill();
    // Body
    ctx.fillStyle = p.hurtTimer > 0 ? "#ff6f61" : "#3f5a7a";
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 0.8, p.r, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#1c2a3a";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Head with cap
    ctx.fillStyle = "#c69c7a";
    ctx.beginPath();
    ctx.arc(2, 0, p.r * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#4b5320";
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 0.5, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.restore();
  }

  drawZombie(z) {
    const ctx = this.ctx;
    const r = z.r;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.arc(3, 4, r, 0, TAU);
    ctx.fill();
    ctx.rotate(z.angle);

    const flash = z.hitFlash > 0;
    const sway = Math.sin(z.walkCycle) * r * 0.25;
    const skin = flash ? "#ffffff" : z.def.color;

    // Reaching arms
    ctx.strokeStyle = flash ? "#fff" : this.shade(z.def.color, -20);
    ctx.lineWidth = r * 0.42;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, r * 0.6);
    ctx.lineTo(r * 1.35, r * 0.55 + sway);
    ctx.moveTo(0, -r * 0.6);
    ctx.lineTo(r * 1.35, -r * 0.55 - sway);
    ctx.stroke();

    // Torn shirt
    ctx.fillStyle = flash ? "#fff" : z.type === "tank" ? "#212121" : "#4a3f35";
    ctx.beginPath();
    ctx.ellipse(-2, 0, r * 0.85, r, 0, 0, TAU);
    ctx.fill();

    if (z.type === "boomer") {
      ctx.fillStyle = flash ? "#fff" : "#d88a4a";
      ctx.beginPath();
      ctx.arc(-2, 0, r * 0.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 120, 0, 0.5)";
      ctx.beginPath();
      ctx.arc(-4, 3, r * 0.35, 0, TAU);
      ctx.fill();
    }

    // Head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(2, 0, r * 0.58, 0, TAU);
    ctx.fill();
    // Glowing eyes
    ctx.fillStyle = z.type === "spitter" ? "#e1bee7" : "#ff3d00";
    ctx.fillRect(r * 0.35, -r * 0.28, 3, 3);
    ctx.fillRect(r * 0.35, r * 0.12, 3, 3);
    ctx.restore();

    if (z.hp < z.maxHp && (z.type === "brute" || z.type === "tank" || z.hp < z.maxHp * 0.99)) {
      const color = z.type === "tank" ? "#ff5252" : "#9ccc65";
      this.healthBar(z.x, z.y - r - 10, z.type === "tank" ? 60 : 28, z.hp / z.maxHp, color);
    }
  }

  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Util.clamp((n >> 16) + amt, 0, 255);
    const g = Util.clamp(((n >> 8) & 255) + amt, 0, 255);
    const b = Util.clamp((n & 255) + amt, 0, 255);
    return `rgb(${r}, ${g}, ${b})`;
  }

  drawProjectiles(game) {
    const ctx = this.ctx;
    ctx.lineCap = "round";
    for (const b of game.bullets) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const a of game.acid) {
      ctx.fillStyle = "#76ff03";
      ctx.shadowColor = "#76ff03";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  drawParticles(game) {
    const ctx = this.ctx;
    for (const p of game.effects.particles) {
      ctx.globalAlpha = Util.clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(game) {
    const ctx = this.ctx;
    ctx.font = "bold 14px Courier New, monospace";
    ctx.textAlign = "center";
    for (const t of game.effects.texts) {
      ctx.globalAlpha = Util.clamp(t.life / t.maxLife, 0, 1);
      ctx.fillStyle = "#000";
      ctx.fillText(t.str, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // Darkness layer with holes punched out for the flashlight and flashes.
  drawLighting(game, sx, sy) {
    const darkness = game.nightFactor * 0.9;
    if (darkness < 0.02) return;
    const l = this.lctx;
    const cam = game.camera;
    l.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    l.globalCompositeOperation = "source-over";
    l.clearRect(0, 0, this.w, this.h);
    l.fillStyle = `rgba(4, 6, 14, ${darkness})`;
    l.fillRect(0, 0, this.w, this.h);
    l.globalCompositeOperation = "destination-out";

    const p = game.player;
    const px = p.x - cam.x + sx;
    const py = p.y - cam.y + sy;

    // Ambient circle around the player
    let g = l.createRadialGradient(px, py, 10, px, py, 130);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    l.fillStyle = g;
    l.beginPath();
    l.arc(px, py, 130, 0, TAU);
    l.fill();

    // Flashlight cone
    if (!p.dead) {
      const len = 480;
      const spread = 0.42;
      g = l.createRadialGradient(px, py, 20, px, py, len);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.7, "rgba(0,0,0,0.8)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      l.fillStyle = g;
      l.beginPath();
      l.moveTo(px, py);
      l.arc(px, py, len, p.angle - spread, p.angle + spread);
      l.closePath();
      l.fill();
    }

    for (const f of game.effects.flashes) {
      const fx = f.x - cam.x + sx;
      const fy = f.y - cam.y + sy;
      const a = f.life / f.maxLife;
      g = l.createRadialGradient(fx, fy, 0, fx, fy, f.radius);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      l.fillStyle = g;
      l.beginPath();
      l.arc(fx, fy, f.radius, 0, TAU);
      l.fill();
    }
    for (const a of game.acid) {
      const ax = a.x - cam.x + sx;
      const ay = a.y - cam.y + sy;
      l.fillStyle = "rgba(0,0,0,0.6)";
      l.beginPath();
      l.arc(ax, ay, 26, 0, TAU);
      l.fill();
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Muzzle flash glow on top of the darkness
    ctx.globalCompositeOperation = "lighter";
    for (const f of game.effects.flashes) {
      const fx = f.x - cam.x + sx;
      const fy = f.y - cam.y + sy;
      const a = (f.life / f.maxLife) * 0.25;
      const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, f.radius * 0.6);
      gr.addColorStop(0, `rgba(255, 200, 120, ${a})`);
      gr.addColorStop(1, "rgba(255, 200, 120, 0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(fx, fy, f.radius * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  drawVignette(game) {
    const ctx = this.ctx;
    const p = game.player;
    const low = 1 - p.hp / p.maxHp;
    const hurt = p.hurtTimer > 0 ? 0.35 : 0;
    const strength = Math.max(hurt, low > 0.6 ? (low - 0.6) * 1.2 * (0.7 + Math.sin(game.time * 6) * 0.3) : 0);
    if (strength <= 0) return;
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
    g.addColorStop(0, "rgba(160, 0, 0, 0)");
    g.addColorStop(1, `rgba(160, 0, 0, ${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawMinimap(game) {
    const ctx = this.ctx;
    const size = Math.min(150, this.w * 0.3);
    const scale = size / game.world.size;
    const x0 = this.w - size - 16;
    const y0 = Input.touch.active ? 120 : this.h - size - 16;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(10, 14, 8, 0.8)";
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = "#3a3a36";
    for (const r of game.world.roads) ctx.fillRect(x0 + r.x * scale, y0 + r.y * scale, r.w * scale, r.h * scale);
    ctx.fillStyle = "#6d6a60";
    for (const o of game.world.obstacles) {
      if (o.kind !== "building") continue;
      ctx.fillRect(x0 + o.x * scale, y0 + o.y * scale, o.w * scale, o.h * scale);
    }
    ctx.fillStyle = "#ffd54f";
    for (const p of game.pickups) {
      if (p.type in WEAPON_TYPES || p.type === "medkit") ctx.fillRect(x0 + p.x * scale - 1.5, y0 + p.y * scale - 1.5, 3, 3);
    }
    for (const z of game.zombies) {
      ctx.fillStyle = z.type === "tank" ? "#ff1744" : z.state === "hunt" ? "#e53935" : "#7cb342";
      const s = z.type === "tank" ? 4 : 2;
      ctx.fillRect(x0 + z.x * scale - s / 2, y0 + z.y * scale - s / 2, s, s);
    }
    ctx.fillStyle = "#4fc3f7";
    ctx.beginPath();
    ctx.arc(x0 + game.player.x * scale, y0 + game.player.y * scale, 3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#3a4630";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, size, size);
    ctx.restore();
  }
}
