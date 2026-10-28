// Core game loop: state machine, simulation step, collisions and HUD.
const DAY_LENGTH = 180; // seconds for a full day/night cycle

function segmentCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return fx * fx + fy * fy <= r * r ? 0 : -1;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return 0; // started inside
  return -1;
}

class Game {
  constructor() {
    this.canvas = document.getElementById("game");
    this.renderer = new Renderer(this.canvas);
    this.audio = new Sound();
    this.state = "menu";
    this.ui = {};
    for (const id of [
      "hud", "hp-fill", "sta-fill", "weapon-info", "wave-info", "score-info", "time-info", "message",
      "menu", "pause", "gameover", "perks", "perk-list", "final-stats", "highscore", "touch-controls",
    ]) this.ui[id] = document.getElementById(id);
    this.hudCache = {};
    Input.init(this.canvas);
    this.bindUi();
    this.showHighscore();
    // A world behind the menu so it isn't a blank screen.
    this.newRun();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  bindUi() {
    const on = (id, fn) => document.getElementById(id).addEventListener("click", fn);
    on("btn-start", () => this.start());
    on("btn-restart", () => this.start());
    on("btn-resume", () => this.setState("playing"));
    on("btn-quit", () => this.toMenu());
    on("btn-menu", () => this.toMenu());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.setState("paused");
    });
  }

  newRun() {
    this.world = new World();
    const c = this.world.size / 2;
    this.player = new Player(c, c);
    this.world.updateFlowField(c, c);
    this.flowTimer = 0;
    this.zombies = [];
    this.bullets = [];
    this.acid = [];
    this.pickups = [];
    this.effects = new Effects();
    this.director = new Director(this);
    this.camera = { x: c - this.renderer.w / 2, y: c - this.renderer.h / 2 };
    this.time = 0;
    this.clock = DAY_LENGTH * 0.9; // start in the morning
    this.score = 0;
    this.kills = 0;
    this.shots = 0;
    this.hits = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.messageTimer = 0;

    for (let i = 0; i < 22; i++) this.director.spawnZombie(Math.random() < 0.85 ? "walker" : "runner", false, false, 500);
    const starter = [
      ["shotgun", 260], ["ammo", 180], ["medkit", 320], ["scrap", 140], ["scrap", 220],
    ];
    for (const [type, d] of starter) {
      const spot = this.world.randomSpawn(c, c, d, d + 80);
      if (spot) this.pickups.push(new Pickup(type, spot.x, spot.y));
    }
  }

  start() {
    this.audio.unlock();
    this.newRun();
    this.setState("playing");
    this.showMessage("Überlebe so lange du kannst!", 3);
  }

  toMenu() {
    this.showHighscore();
    this.setState("menu");
  }

  setState(state) {
    this.state = state;
    const u = this.ui;
    u.menu.classList.toggle("hidden", state !== "menu");
    u.pause.classList.toggle("hidden", state !== "paused");
    u.gameover.classList.toggle("hidden", state !== "over");
    u.perks.classList.toggle("hidden", state !== "perk");
    u.hud.classList.toggle("hidden", state === "menu");
    u["touch-controls"].classList.toggle("hidden", !(Input.touch.active && state === "playing"));
    if (state === "playing") this.audio.unlock();
    else u.message.classList.remove("show");
    Input.mouse.down = false;
  }

  get nightFactor() {
    // 0 = full day, 1 = deep night; smooth transitions at dusk and dawn.
    const t = (this.clock % DAY_LENGTH) / DAY_LENGTH;
    const v = Math.cos(t * TAU); // 1 at t=0 (noon), -1 at t=0.5 (midnight)
    return Util.clamp((-v - 0.2) / 0.6, 0, 1);
  }

  screenToWorld(x, y) {
    return { x: x + this.camera.x, y: y + this.camera.y };
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.handleGlobalKeys();
    if (this.state === "playing") this.update(dt);
    else if (this.state === "menu") this.updateMenuCamera(dt);
    else if (this.state === "over") this.effects.update(dt);
    this.renderer.draw(this);
    if (this.state !== "menu") this.updateHud();
    Input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }

  handleGlobalKeys() {
    if (Input.wasPressed("p", "escape")) {
      if (this.state === "playing") this.setState("paused");
      else if (this.state === "paused") this.setState("playing");
    }
    if (Input.wasPressed("m")) {
      const muted = this.audio.toggleMute();
      if (this.state === "playing") this.showMessage(muted ? "Ton aus" : "Ton an", 1);
    }
    if (Input.wasPressed("enter") && (this.state === "menu" || this.state === "over")) this.start();
  }

  updateMenuCamera(dt) {
    this.time += dt;
    this.clock += dt * 4;
    const c = this.world.size / 2;
    this.camera.x = c + Math.cos(this.time * 0.05) * 500 - this.renderer.w / 2;
    this.camera.y = c + Math.sin(this.time * 0.05) * 500 - this.renderer.h / 2;
    this.effects.update(dt);
  }

  update(dt) {
    this.time += dt;
    this.clock += dt;
    const p = this.player;

    p.update(dt, this);
    if (Input.wasPressed("e")) this.buildBarricade();

    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.world.updateFlowField(p.x, p.y);
      this.flowTimer = 0.3;
    }

    for (const z of this.zombies) if (!z.dead) z.update(dt, this);
    this.separateZombies();
    this.updateBullets(dt);
    this.updateAcid(dt);
    this.updatePickups(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);
    this.world.removeDestroyedBarricades();
    this.director.update(dt);
    this.effects.update(dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.ui.message.classList.remove("show");
    }
    this.updateCamera(dt);
    if (p.hp <= 0) this.gameOver();
  }

  updateCamera(dt) {
    const p = this.player;
    const r = this.renderer;
    let lookX = 0;
    let lookY = 0;
    if (!Input.touch.active) {
      lookX = Util.clamp((Input.mouse.x - r.w / 2) * 0.2, -120, 120);
      lookY = Util.clamp((Input.mouse.y - r.h / 2) * 0.2, -120, 120);
    }
    const tx = p.x + lookX - r.w / 2;
    const ty = p.y + lookY - r.h / 2;
    const k = 1 - Math.exp(-dt * 8);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
    const size = this.world.size;
    this.camera.x = r.w < size ? Util.clamp(this.camera.x, 0, size - r.w) : (size - r.w) / 2;
    this.camera.y = r.h < size ? Util.clamp(this.camera.y, 0, size - r.h) : (size - r.h) / 2;
  }

  // Cheap spatial-hash push-apart so hordes don't stack on one spot.
  separateZombies() {
    const cell = 48;
    const buckets = new Map();
    for (const z of this.zombies) {
      const key = ((z.x / cell) | 0) * 1000 + ((z.y / cell) | 0);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(z);
    }
    for (const z of this.zombies) {
      const gx = (z.x / cell) | 0;
      const gy = (z.y / cell) | 0;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const b = buckets.get((gx + ox) * 1000 + gy + oy);
          if (!b) continue;
          for (const o of b) {
            if (o === z) continue;
            const dx = z.x - o.x;
            const dy = z.y - o.y;
            const min = z.r + o.r;
            const d2 = dx * dx + dy * dy;
            if (d2 > 0 && d2 < min * min) {
              const d = Math.sqrt(d2);
              const push = (min - d) * 0.5;
              const wz = o.r / min;
              z.x += (dx / d) * push * wz;
              z.y += (dy / d) * push * wz;
            }
          }
        }
      }
    }
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.px = b.x;
      b.py = b.y;
      let nx = b.x + b.vx * dt;
      let ny = b.y + b.vy * dt;
      const angle = Math.atan2(b.vy, b.vx);

      // Find every zombie along this step, nearest first.
      const hits = [];
      for (const z of this.zombies) {
        if (z.dead || b.hitSet.has(z)) continue;
        const t = segmentCircle(b.x, b.y, nx, ny, z.x, z.y, z.r);
        if (t >= 0) hits.push({ t, z });
      }
      hits.sort((a, c) => a.t - c.t);
      const wall = this.world.raycast(b.x, b.y, nx, ny);

      for (const h of hits) {
        if (wall && wall.t < h.t) break;
        b.hitSet.add(h.z);
        h.z.hit(b.damage, angle, b.knockback, this);
        this.hits++;
        this.audio.play("hit", 0.5);
        b.pierce--;
        if (b.pierce <= 0) {
          b.dead = true;
          nx = b.x + (nx - b.x) * h.t;
          ny = b.y + (ny - b.y) * h.t;
          break;
        }
      }
      if (!b.dead && wall) {
        nx = b.x + (nx - b.x) * wall.t;
        ny = b.y + (ny - b.y) * wall.t;
        b.dead = true;
        if (wall.obstacle.kind === "barricade") this.effects.splinters(nx, ny);
        else this.effects.sparks(nx, ny, angle);
      }
      b.travelled += Math.hypot(nx - b.x, ny - b.y);
      b.x = nx;
      b.y = ny;
      if (b.travelled > b.range) b.dead = true;
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  updateAcid(dt) {
    const p = this.player;
    for (const a of this.acid) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
      if (Util.dist(a.x, a.y, p.x, p.y) < a.r + p.r) {
        this.damagePlayer(a.damage);
        a.dead = true;
      } else if (a.life <= 0 || !this.world.isFree(a.x, a.y, a.r)) {
        a.dead = true;
      }
      if (a.dead) {
        this.effects.addDecal(a.x, a.y, 14, "#558b2f", 0.6);
        this.effects.blood(a.x, a.y, Math.atan2(a.vy, a.vx) + Math.PI, "#76ff03");
      }
    }
    this.acid = this.acid.filter((a) => !a.dead);
  }

  updatePickups(dt) {
    const p = this.player;
    for (const k of this.pickups) {
      k.life -= dt;
      if (k.life <= 0) k.dead = true;
      else if (Util.dist(k.x, k.y, p.x, p.y) < k.r + p.r + 4) this.collect(k);
    }
    this.pickups = this.pickups.filter((k) => !k.dead);
  }

  collect(k) {
    const p = this.player;
    let label = PICKUP_TYPES[k.type].label;
    let color = PICKUP_TYPES[k.type].color;
    if (k.type === "medkit") {
      if (p.hp >= p.maxHp) return; // leave it for later
      const heal = Math.min(40, p.maxHp - p.hp);
      p.hp += heal;
      label = `+${Math.round(heal)} Leben`;
    } else if (k.type === "ammo") {
      const guns = p.weapons.filter((w) => !w.def.infiniteReserve);
      if (guns.length) {
        for (const w of guns) w.reserve += Math.ceil(w.def.magSize * 1.5);
        label = "+Munition";
      } else {
        p.scrap += 1;
        label = "+1 Schrott";
        color = PICKUP_TYPES.scrap.color;
      }
    } else if (k.type === "scrap") {
      const n = Util.randInt(1, 2);
      p.scrap += n;
      label = `+${n} Schrott`;
    } else {
      const isNew = p.giveWeapon(k.type);
      label = isNew ? `${label}!` : `${label}-Munition`;
    }
    k.dead = true;
    this.audio.play("pickup");
    this.effects.text(k.x, k.y - 16, label, color);
  }

  onShot(x, y, angle, weapon) {
    this.shots++;
    this.audio.play(weapon.type);
    this.effects.flash(x, y, 160);
    this.effects.shell(this.player.x, this.player.y, angle);
    this.effects.shake = Math.max(this.effects.shake, weapon.type === "shotgun" || weapon.type === "sniper" ? 6 : 2);
    // Gunfire draws nearby zombies.
    const noise = weapon.def.noise;
    for (const z of this.zombies) {
      if (z.state === "idle" && Util.dist(z.x, z.y, x, y) < noise) z.state = "hunt";
    }
  }

  killZombie(z, scored = true) {
    if (z.dead) return;
    z.dead = true;
    this.director.onZombieKilled(z);
    this.effects.gore(z.x, z.y, z.type === "spitter" ? "#4a148c" : "#6d0b0b");
    this.audio.play("death", 0.6);
    if (z.type === "boomer") this.explode(z);
    if (!scored) return;
    this.kills++;
    this.combo++;
    this.comboTimer = 2.5;
    const mult = Math.min(5, 1 + Math.floor(this.combo / 5));
    const pts = z.def.score * mult;
    this.score += pts;
    this.effects.text(z.x, z.y - z.r - 6, mult > 1 ? `+${pts} x${mult}` : `+${pts}`, mult > 1 ? "#ffca28" : "#cfd8dc");
    if (z.type === "tank") this.showMessage("TANK ERLEDIGT!", 2);
  }

  explode(z) {
    if (z.exploded) return;
    z.exploded = true;
    const radius = 120;
    this.effects.explosion(z.x, z.y, radius);
    this.audio.play("explosion");
    const p = this.player;
    const dp = Util.dist(z.x, z.y, p.x, p.y);
    if (dp < radius + p.r) this.damagePlayer(45 * (1 - dp / (radius + p.r)) + 10);
    for (const o of this.zombies) {
      if (o === z || o.dead) continue;
      const d = Util.dist(z.x, z.y, o.x, o.y);
      if (d < radius + o.r) o.hit(140 * (1 - d / (radius + o.r)) + 20, Util.angleTo(z.x, z.y, o.x, o.y), 260, this);
    }
    for (const b of this.world.barricades) {
      if (Util.circleRect(z.x, z.y, radius, b)) {
        b.hp -= 120;
        if (b.hp <= 0) this.onBarricadeDestroyed(b);
      }
    }
    if (!z.dead) this.killZombie(z, false);
  }

  damagePlayer(amount) {
    const p = this.player;
    if (p.hp <= 0) return;
    p.damage(amount);
    this.effects.blood(p.x, p.y, Util.rand(0, TAU));
    this.effects.shake = Math.max(this.effects.shake, 8);
    this.audio.play("hurt");
  }

  buildPreview() {
    const p = this.player;
    return { x: p.x + Math.cos(p.angle) * 48, y: p.y + Math.sin(p.angle) * 48 };
  }

  buildBarricade() {
    const p = this.player;
    if (p.scrap < BARRICADE_COST) {
      this.effects.text(p.x, p.y - 26, `Brauche ${BARRICADE_COST} Schrott`, "#e57373");
      return;
    }
    const at = this.buildPreview();
    const b = this.world.addBarricade(at.x, at.y, p.angle);
    if (!b) {
      this.effects.text(p.x, p.y - 26, "Kein Platz", "#e57373");
      return;
    }
    // Don't trap zombies inside the planks.
    if (this.zombies.some((z) => Util.circleRect(z.x, z.y, z.r, b))) {
      this.world.barricades.pop();
      this.effects.text(p.x, p.y - 26, "Blockiert", "#e57373");
      return;
    }
    p.scrap -= BARRICADE_COST;
    this.world.collide(p);
    this.audio.play("build");
  }

  onBarricadeDestroyed(b) {
    for (let i = 0; i < 3; i++) this.effects.splinters(b.x + b.w / 2, b.y + b.h / 2);
    this.effects.text(b.x + b.w / 2, b.y, "Barrikade zerstört", "#ffab91");
  }

  offerPerks() {
    const list = this.ui["perk-list"];
    list.innerHTML = "";
    for (const perk of this.director.rollPerks()) {
      const btn = document.createElement("button");
      btn.className = "perk";
      btn.innerHTML = `${perk.name}<small>${perk.desc}</small>`;
      btn.addEventListener("click", () => {
        perk.apply(this.player);
        this.audio.play("perk");
        this.setState("playing");
        this.showMessage(perk.name, 1.5);
      });
      list.appendChild(btn);
    }
    document.getElementById("perk-title").textContent = `WELLE ${this.director.wave} ÜBERSTANDEN`;
    this.setState("perk");
  }

  showMessage(text, duration) {
    this.ui.message.textContent = text;
    this.ui.message.classList.add("show");
    this.messageTimer = duration;
  }

  gameOver() {
    const best = Store.get("zombie.best", { score: 0, wave: 0 });
    const record = this.score > best.score;
    if (record) Store.set("zombie.best", { score: this.score, wave: this.director.wave });
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    this.ui["final-stats"].innerHTML = `
      ${record ? '<div style="color:#ffca28"><strong>NEUER REKORD!</strong></div>' : ""}
      Punkte: <strong>${this.score}</strong><br>
      Welle erreicht: <strong>${this.director.wave}</strong><br>
      Zombies getötet: <strong>${this.kills}</strong><br>
      Überlebt: <strong>${Util.formatTime(this.time)}</strong><br>
      Trefferquote: <strong>${acc}%</strong>`;
    this.player.dead = true;
    this.effects.gore(this.player.x, this.player.y);
    this.audio.play("death");
    this.setState("over");
  }

  showHighscore() {
    const best = Store.get("zombie.best", null);
    this.ui.highscore.textContent = best ? `Rekord: ${best.score} Punkte (Welle ${best.wave})` : "";
  }

  setHud(id, value, html = false) {
    if (this.hudCache[id] === value) return;
    this.hudCache[id] = value;
    if (html) this.ui[id].innerHTML = value;
    else this.ui[id].textContent = value;
  }

  updateHud() {
    const p = this.player;
    const showTouch = Input.touch.active && this.state === "playing";
    if (this.hudCache.touch !== showTouch) {
      this.hudCache.touch = showTouch;
      this.ui["touch-controls"].classList.toggle("hidden", !showTouch);
    }
    const hpPct = Math.round((Math.max(0, p.hp) / p.maxHp) * 100);
    const staPct = Math.round((p.stamina / p.maxStamina) * 100);
    if (this.hudCache.hp !== hpPct) this.ui["hp-fill"].style.width = `${(this.hudCache.hp = hpPct)}%`;
    if (this.hudCache.sta !== staPct) this.ui["sta-fill"].style.width = `${(this.hudCache.sta = staPct)}%`;

    const slots = p.weapons
      .map((w, i) => (i === p.current ? `<b style="color:#8bc34a">[${i + 1}] ${w.name}</b>` : `<span style="opacity:.6">[${i + 1}] ${w.name}</span>`))
      .join(" ");
    this.setHud("weapon-info", `${slots}<br><span style="font-size:22px">${p.weapon.ammoText()}</span> &nbsp; Schrott: ${p.scrap}`, true);

    const d = this.director;
    let wave;
    if (d.state === "break" && d.wave === 0) wave = `Erste Welle in ${d.countdown}`;
    else if (d.state === "break") wave = `Pause – nächste Welle in ${d.countdown}`;
    else wave = `Welle ${d.wave} · ${d.queue.length + d.alive} übrig`;
    this.setHud("wave-info", wave);

    const combo = this.combo >= 5 ? ` · Combo x${Math.min(5, 1 + Math.floor(this.combo / 5))}` : "";
    this.setHud("score-info", `Punkte: ${this.score} · Kills: ${this.kills}${combo}`);

    const night = this.nightFactor > 0.5;
    this.setHud("time-info", `${night ? "☾ Nacht" : "☀ Tag"} · ${Util.formatTime(this.time)}`);
  }
}

window.addEventListener("load", () => {
  window.game = new Game();
});
