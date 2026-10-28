// Wave pacing, zombie spawning, loot and between-wave perks.

const PERKS = [
  { id: "tough", name: "Zähigkeit", desc: "+25 max. Leben und sofort +25 Leben", apply: (p) => { p.maxHp += 25; p.hp += 25; } },
  { id: "runner", name: "Ausdauerläufer", desc: "+10% Laufgeschwindigkeit, +25 Ausdauer", apply: (p) => { p.speedMul *= 1.1; p.maxStamina += 25; p.stamina = p.maxStamina; } },
  { id: "hollow", name: "Hohlspitzgeschosse", desc: "+15% Schaden mit allen Waffen", apply: (p) => { p.damageMul *= 1.15; } },
  { id: "hands", name: "Schnelle Hände", desc: "+20% Nachlade- und Feuergeschwindigkeit", apply: (p) => { p.reloadMul *= 1.2; } },
  { id: "medic", name: "Feldsanitäter", desc: "Leben vollständig auffüllen", apply: (p) => { p.hp = p.maxHp; } },
  { id: "regen", name: "Adrenalin", desc: "Regeneriert dauerhaft +0,5 Leben pro Sekunde", apply: (p) => { p.regen += 0.5; } },
  {
    id: "stash", name: "Versteck gefunden", desc: "+3 Magazine für jede Waffe und +3 Schrott",
    apply: (p) => {
      for (const w of p.weapons) if (!w.def.infiniteReserve) w.reserve += w.def.magSize * 3;
      p.scrap += 3;
    },
  },
  { id: "builder", name: "Bastler", desc: "+8 Schrott für Barrikaden", apply: (p) => { p.scrap += 8; } },
];

const BARRICADE_COST = 3;
const MAX_ZOMBIES = 110;

class Director {
  constructor(game) {
    this.game = game;
    this.wave = 0;
    this.state = "break";
    this.timer = 6; // grace period before wave 1
    this.queue = [];
    this.spawnTimer = 0;
    this.alive = 0;
    this.pickupTimer = 8;
    this.ambientTimer = 20;
    this.perkDelay = 0;
  }

  get countdown() {
    return this.state === "break" ? Math.ceil(this.timer) : 0;
  }

  update(dt) {
    const game = this.game;
    if (this.state === "break") {
      if (this.perkDelay > 0) {
        this.perkDelay -= dt;
        if (this.perkDelay <= 0) game.offerPerks();
        return;
      }
      this.timer -= dt;
      if (this.timer <= 0) this.startWave();
    } else {
      this.spawnTimer -= dt;
      const limit = MAX_ZOMBIES - game.zombies.length;
      if (this.queue.length && this.spawnTimer <= 0 && limit > 0) {
        const burst = Math.min(this.queue.length, Util.randInt(1, 2 + Math.floor(this.wave / 3)), limit);
        for (let i = 0; i < burst; i++) {
          const type = this.queue.shift();
          if (!this.spawnZombie(type, true, true)) this.queue.push(type);
        }
        const base = Math.max(0.35, 2.2 - this.wave * 0.12);
        this.spawnTimer = base * (1 - game.nightFactor * 0.4);
      }
      if (!this.queue.length && this.alive <= 0) this.endWave();
    }

    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.pickupTimer = Util.rand(10, 16);
      if (game.pickups.length < 14) this.spawnAmbientPickup();
    }

    // Keep a few wanderers around the city.
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = Util.rand(8, 14);
      const idle = game.zombies.filter((z) => z.state === "idle").length;
      if (idle < 18) this.spawnZombie(Math.random() < 0.8 ? "walker" : "runner", false, false, 900);
    }
  }

  startWave() {
    const game = this.game;
    this.wave++;
    this.state = "active";
    const n = this.wave;
    const count = 8 + n * 4;
    const weights = [
      { type: "walker", weight: 10 },
      { type: "runner", weight: n >= 2 ? 2 + n * 0.8 : 0 },
      { type: "spitter", weight: n >= 3 ? 1 + n * 0.35 : 0 },
      { type: "boomer", weight: n >= 4 ? 1 + n * 0.35 : 0 },
      { type: "brute", weight: n >= 5 ? 0.6 + n * 0.25 : 0 },
    ];
    this.queue = [];
    for (let i = 0; i < count; i++) this.queue.push(Util.weighted(weights).type);
    if (n % 5 === 0) {
      for (let i = 0; i < n / 5; i++) this.queue.splice(Math.floor(this.queue.length / 2), 0, "tank");
    }
    this.spawnTimer = 0.5;
    game.audio.play("wave");
    game.showMessage(n % 5 === 0 ? `WELLE ${n} – EIN TANK NAHT!` : `WELLE ${n}`, 2.5);
    // Every wave wakes the sleeping dead.
    for (const z of game.zombies) if (Util.dist(z.x, z.y, game.player.x, game.player.y) < 900) z.state = "hunt";
  }

  endWave() {
    const game = this.game;
    this.state = "break";
    this.timer = 12;
    const bonus = this.wave * 100;
    game.score += bonus;
    game.showMessage(`WELLE ${this.wave} ÜBERSTANDEN  +${bonus}`, 2.5);
    game.effects.text(game.player.x, game.player.y - 30, `+${bonus}`, "#8bc34a");
    this.perkDelay = 1.5;
  }

  // Spawns out of sight of the player. Returns the zombie, or null if no spot was found.
  spawnZombie(type, hunting, fromWave, minDist = 650) {
    const game = this.game;
    const p = game.player;
    const spot = game.world.randomSpawn(p.x, p.y, minDist, minDist + 700);
    if (!spot) return null;
    const z = new Zombie(type, spot.x, spot.y, Math.max(1, this.wave), hunting);
    if (type === "tank") {
      z.maxHp += this.wave * 120;
      z.hp = z.maxHp;
    }
    z.fromWave = fromWave;
    if (fromWave) this.alive++;
    game.zombies.push(z);
    return z;
  }

  onZombieKilled(z) {
    if (z.fromWave) this.alive--;
    this.dropLoot(z);
  }

  dropLoot(z) {
    const game = this.game;
    const r = Math.random();
    if (z.type === "tank") {
      game.pickups.push(new Pickup("medkit", z.x - 15, z.y));
      game.pickups.push(new Pickup("ammo", z.x + 15, z.y));
      game.pickups.push(new Pickup(this.weaponDrop() || "ammo", z.x, z.y + 15));
      return;
    }
    if (z.type === "brute" && r < 0.3) {
      const w = this.weaponDrop();
      if (w) {
        game.pickups.push(new Pickup(w, z.x, z.y));
        return;
      }
    }
    if (r < 0.11) game.pickups.push(new Pickup("ammo", z.x, z.y));
    else if (r < 0.15) game.pickups.push(new Pickup("medkit", z.x, z.y));
    else if (r < 0.38) game.pickups.push(new Pickup("scrap", z.x, z.y));
  }

  // A weapon the player doesn't own yet (respecting unlock waves).
  weaponDrop() {
    const p = this.game.player;
    const options = [
      { type: "shotgun", weight: 3 },
      { type: "rifle", weight: this.wave >= 2 ? 2 : 0 },
      { type: "sniper", weight: this.wave >= 4 ? 1.5 : 0 },
    ].filter((o) => o.weight > 0 && !p.hasWeapon(o.type));
    return options.length ? Util.weighted(options).type : null;
  }

  spawnAmbientPickup() {
    const game = this.game;
    const p = game.player;
    const spot = game.world.randomSpawn(p.x, p.y, 250, 800);
    if (!spot) return;
    const weapon = this.weaponDrop();
    const type = Util.weighted([
      { type: "ammo", weight: 5 },
      { type: "medkit", weight: p.hp < p.maxHp * 0.5 ? 4 : 2 },
      { type: "scrap", weight: 3 },
      { type: weapon, weight: weapon ? 1.2 : 0 },
    ]).type;
    game.pickups.push(new Pickup(type, spot.x, spot.y));
  }

  rollPerks() {
    const pool = PERKS.slice();
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Util.randInt(0, pool.length - 1), 1)[0]);
    return out;
  }
}
