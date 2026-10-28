// Weapon definitions. Ammo is tracked per weapon: `mag` in the magazine, `reserve` spare.
const WEAPON_TYPES = {
  pistol: {
    name: "Pistole",
    damage: 34,
    fireRate: 0.28, // seconds between shots
    magSize: 12,
    reloadTime: 1.1,
    spread: 0.04,
    pellets: 1,
    speed: 900,
    range: 650,
    auto: false,
    infiniteReserve: true,
    knockback: 60,
    noise: 260,
    color: "#ffe082",
  },
  shotgun: {
    name: "Schrotflinte",
    damage: 22,
    fireRate: 0.85,
    magSize: 6,
    reloadTime: 2.0,
    spread: 0.32,
    pellets: 7,
    speed: 780,
    range: 380,
    auto: false,
    knockback: 140,
    noise: 520,
    color: "#ffab40",
  },
  rifle: {
    name: "Sturmgewehr",
    damage: 26,
    fireRate: 0.1,
    magSize: 30,
    reloadTime: 1.8,
    spread: 0.07,
    pellets: 1,
    speed: 1100,
    range: 800,
    auto: true,
    knockback: 40,
    noise: 420,
    color: "#fff59d",
  },
  sniper: {
    name: "Scharfschütze",
    damage: 160,
    fireRate: 1.2,
    magSize: 5,
    reloadTime: 2.4,
    spread: 0.005,
    pellets: 1,
    speed: 1800,
    range: 1400,
    auto: false,
    pierce: 4,
    knockback: 220,
    noise: 700,
    color: "#b3e5fc",
  },
};

const WEAPON_ORDER = ["pistol", "shotgun", "rifle", "sniper"];

class Weapon {
  constructor(type, reserve = 0) {
    this.type = type;
    this.def = WEAPON_TYPES[type];
    this.mag = this.def.magSize;
    this.reserve = reserve;
    this.cooldown = 0;
    this.reloading = 0;
  }

  get name() {
    return this.def.name;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
    }
  }

  canFire() {
    return this.cooldown <= 0 && this.reloading <= 0 && this.mag > 0;
  }

  startReload() {
    if (this.reloading > 0 || this.mag >= this.def.magSize) return false;
    if (!this.def.infiniteReserve && this.reserve <= 0) return false;
    this.reloading = this.def.reloadTime;
    return true;
  }

  finishReload() {
    this.reloading = 0;
    const need = this.def.magSize - this.mag;
    if (this.def.infiniteReserve) {
      this.mag += need;
    } else {
      const take = Math.min(need, this.reserve);
      this.mag += take;
      this.reserve -= take;
    }
  }

  cancelReload() {
    this.reloading = 0;
  }

  // Returns an array of bullet descriptors, or null if the weapon can't fire.
  fire(x, y, angle) {
    if (!this.canFire()) return null;
    this.mag--;
    this.cooldown = this.def.fireRate;
    const bullets = [];
    for (let i = 0; i < this.def.pellets; i++) {
      const a = angle + Util.rand(-this.def.spread, this.def.spread);
      bullets.push({
        x,
        y,
        vx: Math.cos(a) * this.def.speed * Util.rand(0.92, 1.05),
        vy: Math.sin(a) * this.def.speed * Util.rand(0.92, 1.05),
        damage: this.def.damage,
        range: this.def.range,
        pierce: this.def.pierce || 1,
        knockback: this.def.knockback,
        color: this.def.color,
      });
    }
    if (this.mag === 0) this.startReload();
    return bullets;
  }

  ammoText() {
    if (this.reloading > 0) return "Lädt nach…";
    const reserve = this.def.infiniteReserve ? "∞" : this.reserve;
    return `${this.mag} / ${reserve}`;
  }
}
