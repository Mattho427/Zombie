// Player, zombies, projectiles and pickups.

class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 14;
    this.angle = 0;
    this.maxHp = 100;
    this.hp = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.baseSpeed = 170;
    this.speedMul = 1;
    this.damageMul = 1;
    this.reloadMul = 1;
    this.scrap = 3;
    this.weapons = [new Weapon("pistol")];
    this.current = 0;
    this.hurtTimer = 0;
    this.walkCycle = 0;
    this.regen = 0;
    this.triggerWasUp = true;
  }

  get weapon() {
    return this.weapons[this.current];
  }

  hasWeapon(type) {
    return this.weapons.find((w) => w.type === type);
  }

  giveWeapon(type) {
    const existing = this.hasWeapon(type);
    const def = WEAPON_TYPES[type];
    if (existing) {
      existing.reserve += def.magSize * 2;
      return false;
    }
    this.weapons.push(new Weapon(type, def.magSize * 2));
    this.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a.type) - WEAPON_ORDER.indexOf(b.type));
    this.current = this.weapons.findIndex((w) => w.type === type);
    return true;
  }

  switchTo(index) {
    if (index < 0 || index >= this.weapons.length || index === this.current) return;
    this.weapon.cancelReload();
    this.current = index;
  }

  // Fall back to the strongest weapon that still has ammo (the pistol always does).
  switchToLoaded() {
    for (let i = this.weapons.length - 1; i >= 0; i--) {
      const w = this.weapons[i];
      if (w.mag > 0 || w.reserve > 0 || w.def.infiniteReserve) {
        this.switchTo(i);
        return;
      }
    }
  }

  cycleWeapon(dir) {
    const n = this.weapons.length;
    this.switchTo((this.current + dir + n) % n);
  }

  damage(amount) {
    this.hp -= amount;
    this.hurtTimer = 0.25;
  }

  update(dt, game) {
    let mx = 0;
    let my = 0;
    if (Input.isDown("w", "arrowup")) my -= 1;
    if (Input.isDown("s", "arrowdown")) my += 1;
    if (Input.isDown("a", "arrowleft")) mx -= 1;
    if (Input.isDown("d", "arrowright")) mx += 1;
    if (Input.touch.active) {
      mx += Input.touch.move.x;
      my += Input.touch.move.y;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const moving = len > 0.1;

    let speed = this.baseSpeed * this.speedMul;
    const wantsSprint = Input.isDown("shift") || Math.hypot(Input.touch.move.x, Input.touch.move.y) > 0.95;
    if (wantsSprint && moving && this.stamina > 0) {
      speed *= 1.6;
      this.stamina = Math.max(0, this.stamina - 32 * dt);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + (moving ? 14 : 24) * dt);
    }

    this.x += mx * speed * dt;
    this.y += my * speed * dt;
    game.world.collide(this);
    if (moving) this.walkCycle += dt * speed * 0.05;

    // Aim
    if (Input.touch.active && Input.touch.aim.active) {
      this.angle = Math.atan2(Input.touch.aim.y, Input.touch.aim.x);
    } else if (Input.touch.active && moving) {
      this.angle = Math.atan2(my, mx);
    } else if (!Input.touch.active) {
      const m = game.screenToWorld(Input.mouse.x, Input.mouse.y);
      this.angle = Util.angleTo(this.x, this.y, m.x, m.y);
    }

    // Weapon switching
    for (let i = 0; i < 4; i++) if (Input.wasPressed(String(i + 1))) this.switchTo(i);
    if (Input.wheel) this.cycleWeapon(Input.wheel);
    if (Input.wasPressed("q")) this.cycleWeapon(1);

    const w = this.weapon;
    w.update(dt * this.reloadMul);
    if (Input.wasPressed("r") && w.startReload()) game.audio.play("reload");

    const trigger = Input.touch.active ? Input.touch.aim.active : Input.mouse.down;
    const fresh = Input.touch.active ? trigger : this.triggerWasUp;
    if (trigger && (w.def.auto || fresh || Input.touch.active)) {
      const mx2 = this.x + Math.cos(this.angle) * (this.r + 10);
      const my2 = this.y + Math.sin(this.angle) * (this.r + 10);
      const shots = w.fire(mx2, my2, this.angle);
      if (shots) {
        for (const s of shots) {
          s.damage *= this.damageMul;
          game.bullets.push(new Bullet(s));
        }
        game.onShot(mx2, my2, this.angle, w);
      } else if (w.mag === 0 && w.reloading <= 0 && fresh) {
        if (!w.startReload()) {
          game.audio.play("empty");
          this.switchToLoaded();
        }
      }
    }
    this.triggerWasUp = !trigger;

    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
  }
}

const ZOMBIE_TYPES = {
  walker: { hp: 60, speed: 52, damage: 10, r: 13, color: "#6b8f4e", score: 10, weight: 10 },
  runner: { hp: 38, speed: 118, damage: 7, r: 11, color: "#a3a85a", score: 15, weight: 0 },
  brute: { hp: 320, speed: 40, damage: 24, r: 21, color: "#4e5d3a", score: 40, weight: 0 },
  spitter: { hp: 70, speed: 48, damage: 6, r: 13, color: "#7e57c2", score: 25, weight: 0 },
  boomer: { hp: 90, speed: 58, damage: 0, r: 17, color: "#c0703a", score: 25, weight: 0 },
  tank: { hp: 1800, speed: 58, damage: 35, r: 32, color: "#3e2723", score: 300, weight: 0 },
};

class Zombie {
  constructor(type, x, y, wave, hunting) {
    const def = ZOMBIE_TYPES[type];
    this.type = type;
    this.def = def;
    this.x = x;
    this.y = y;
    this.r = def.r;
    const hpScale = 1 + (wave - 1) * 0.08;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * Util.rand(0.88, 1.12) * (1 + Math.min(wave, 20) * 0.012);
    this.damage = def.damage * (1 + (wave - 1) * 0.04);
    this.angle = Util.rand(0, TAU);
    this.state = hunting ? "hunt" : "idle";
    this.wanderTimer = 0;
    this.attackTimer = 0;
    this.specialTimer = Util.rand(1, 3);
    this.chargeTimer = 0;
    this.kx = 0;
    this.ky = 0;
    this.hitFlash = 0;
    this.walkCycle = Util.rand(0, TAU);
    this.groanTimer = Util.rand(3, 12);
    this.dead = false;
  }

  hit(amount, angle, knockback, game) {
    this.hp -= amount;
    this.hitFlash = 0.08;
    this.state = "hunt";
    const kb = knockback / Math.sqrt(this.r / 13);
    this.kx += Math.cos(angle) * kb;
    this.ky += Math.sin(angle) * kb;
    game.effects.blood(this.x, this.y, angle, this.type === "spitter" ? "#6a1b9a" : "#7a0f0f");
    if (this.hp <= 0 && !this.dead) game.killZombie(this);
  }

  update(dt, game) {
    const p = game.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);
    const night = game.nightFactor;
    let speed = this.speed * (1 + night * 0.2);

    if (this.state === "idle") {
      const sight = Util.lerp(340, 200, night);
      if (dist < 110 || (dist < sight && game.world.lineOfSight(this.x, this.y, p.x, p.y))) {
        this.state = "hunt";
        game.audio.play("groan", 0.5);
      }
    }

    let vx = 0;
    let vy = 0;
    if (this.state === "idle") {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = Util.rand(2, 5);
        this.angle = Util.rand(0, TAU);
        this.wandering = Math.random() < 0.6;
      }
      if (this.wandering) {
        vx = Math.cos(this.angle) * speed * 0.35;
        vy = Math.sin(this.angle) * speed * 0.35;
      }
    } else {
      let dirX;
      let dirY;
      const direct = dist < 280 && game.world.lineOfSight(this.x, this.y, p.x, p.y);
      if (direct) {
        dirX = dx / (dist || 1);
        dirY = dy / (dist || 1);
      } else {
        const f = game.world.flowAt(this.x, this.y);
        if (f.reachable && (f.x || f.y)) {
          dirX = f.x;
          dirY = f.y;
        } else {
          dirX = dx / (dist || 1);
          dirY = dy / (dist || 1);
        }
      }
      // Smooth turning
      const target = Math.atan2(dirY, dirX);
      let diff = target - this.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      this.angle += diff * Math.min(1, dt * 8);

      if (this.type === "spitter" && direct && dist < 300) {
        speed *= dist < 200 ? -0.5 : 0; // keep distance
      }
      if (this.type === "tank") this.updateTank(dt, direct, dist);
      if (this.chargeTimer > 0) speed *= 3;

      vx = Math.cos(this.angle) * speed;
      vy = Math.sin(this.angle) * speed;
      this.updateSpecial(dt, game, direct, dist);
    }

    this.x += (vx + this.kx) * dt;
    this.y += (vy + this.ky) * dt;
    const decay = Math.exp(-dt * 10);
    this.kx *= decay;
    this.ky *= decay;
    if (Math.abs(vx) + Math.abs(vy) > 1) this.walkCycle += dt * speed * 0.08;

    const barricade = game.world.collide(this);
    if (barricade && this.type === "boomer" && this.state === "hunt") {
      game.explode(this);
      return;
    }
    this.attackTimer -= dt;
    if (barricade && this.state === "hunt" && this.attackTimer <= 0 && this.damage > 0) {
      barricade.hp -= this.damage * 1.5;
      this.attackTimer = 0.9;
      game.effects.splinters(this.x, this.y);
      if (barricade.hp <= 0) game.onBarricadeDestroyed(barricade);
    }

    // Melee attack
    if (dist < this.r + p.r + 6 && this.state === "hunt") {
      if (this.type === "boomer") {
        game.explode(this);
        return;
      }
      if (this.attackTimer <= 0) {
        this.attackTimer = this.type === "tank" ? 1.3 : 0.85;
        game.damagePlayer(this.damage, this);
      }
    }

    // Stragglers lost far away are moved closer so waves can't stall.
    if (this.state === "hunt" && dist > 1500) {
      this.farTimer = (this.farTimer || 0) + dt;
      if (this.farTimer > 15) {
        this.farTimer = 0;
        const spot = game.world.randomSpawn(p.x, p.y, 650, 950);
        if (spot) {
          this.x = spot.x;
          this.y = spot.y;
        }
      }
    } else {
      this.farTimer = 0;
    }

    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = Util.rand(6, 16);
      if (dist < 500) game.audio.play("groan", 0.25 * (1 - dist / 500));
    }
  }

  updateTank(dt, direct, dist) {
    if (this.chargeTimer > 0) {
      this.chargeTimer -= dt;
      return;
    }
    this.specialTimer -= dt;
    if (this.specialTimer <= 0 && direct && dist < 450 && dist > 120) {
      this.chargeTimer = 0.7;
      this.specialTimer = Util.rand(4, 7);
    }
  }

  updateSpecial(dt, game, direct, dist) {
    if (this.type !== "spitter") return;
    this.specialTimer -= dt;
    if (this.specialTimer <= 0 && direct && dist < 420) {
      this.specialTimer = Util.rand(2.2, 3.2);
      const p = game.player;
      // Lead the target a little.
      const a = Util.angleTo(this.x, this.y, p.x, p.y) + Util.rand(-0.08, 0.08);
      game.acid.push(new AcidBall(this.x, this.y, a, this.damage * 2));
      game.audio.play("spit", 0.6);
    }
  }
}

class Bullet {
  constructor(o) {
    Object.assign(this, o);
    this.travelled = 0;
    this.dead = false;
    this.hitSet = new Set();
    this.px = this.x;
    this.py = this.y;
  }
}

class AcidBall {
  constructor(x, y, angle, damage) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * 320;
    this.vy = Math.sin(angle) * 320;
    this.damage = damage;
    this.r = 6;
    this.life = 2;
    this.dead = false;
  }
}

const PICKUP_TYPES = {
  ammo: { color: "#d4a017", label: "Munition" },
  medkit: { color: "#e53935", label: "Medikit" },
  scrap: { color: "#9e9e9e", label: "Schrott" },
  shotgun: { color: "#ffab40", label: "Schrotflinte" },
  rifle: { color: "#fff59d", label: "Sturmgewehr" },
  sniper: { color: "#b3e5fc", label: "Scharfschütze" },
};

class Pickup {
  constructor(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.r = 12;
    this.life = type in WEAPON_TYPES ? 60 : 35;
    this.bob = Util.rand(0, TAU);
    this.dead = false;
  }
}
