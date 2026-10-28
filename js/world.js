// The city map: roads, buildings, cars, trees, player-built barricades,
// plus a flow field that lets zombies path around obstacles toward the player.
const WORLD_SIZE = 3200;
const BLOCK = 800; // distance between road centers
const ROAD_W = 140;
const FLOW_CELL = 40;

class World {
  constructor() {
    this.size = WORLD_SIZE;
    this.obstacles = []; // static solid rects
    this.barricades = []; // destructible rects built by the player
    this.roads = [];
    this.parks = [];
    this.decor = []; // non-solid ground details
    this.generate();
    this.buildGrid();
  }

  generate() {
    const s = this.size;
    // Road grid
    for (let p = BLOCK / 2; p < s; p += BLOCK) {
      this.roads.push({ x: 0, y: p - ROAD_W / 2, w: s, h: ROAD_W });
      this.roads.push({ x: p - ROAD_W / 2, y: 0, w: ROAD_W, h: s });
    }

    const center = s / 2;
    // City blocks sit between the roads.
    for (let by = -1; by < s / BLOCK; by++) {
      for (let bx = -1; bx < s / BLOCK; bx++) {
        const x0 = bx * BLOCK + BLOCK / 2 + ROAD_W / 2;
        const y0 = by * BLOCK + BLOCK / 2 + ROAD_W / 2;
        const x1 = Math.min(x0 + BLOCK - ROAD_W, s);
        const y1 = Math.min(y0 + BLOCK - ROAD_W, s);
        const bxs = Math.max(x0, 0);
        const bys = Math.max(y0, 0);
        if (x1 - bxs < 80 || y1 - bys < 80) continue;
        const block = { x: bxs, y: bys, w: x1 - bxs, h: y1 - bys };
        const hasCenter =
          center > block.x - 200 && center < block.x + block.w + 200 &&
          center > block.y - 200 && center < block.y + block.h + 200;
        if (hasCenter || Math.random() < 0.22) this.fillPark(block);
        else this.fillBuildings(block);
      }
    }

    // Abandoned cars on the roads
    for (const road of this.roads) {
      const horizontal = road.w > road.h;
      const count = Util.randInt(2, 4);
      for (let i = 0; i < count; i++) {
        const along = Util.rand(100, s - 100);
        const lane = Util.rand(-35, 35);
        const w = horizontal ? 70 : 36;
        const h = horizontal ? 36 : 70;
        const x = horizontal ? along : road.x + road.w / 2 + lane - w / 2;
        const y = horizontal ? road.y + road.h / 2 + lane - h / 2 : along;
        const car = { x, y, w, h, kind: "car", color: Util.pick(["#5d4037", "#37474f", "#7b1f1f", "#2e4a62", "#556b2f"]) };
        if (Math.abs(x + w / 2 - center) < 220 && Math.abs(y + h / 2 - center) < 220) continue;
        if (this.obstacles.some((o) => this.rectsOverlap(o, car, 40))) continue;
        this.obstacles.push(car);
      }
    }
  }

  fillBuildings(block) {
    const pad = 24;
    const cols = block.w > 400 ? 2 : 1;
    const rows = block.h > 400 ? 2 : 1;
    const cw = (block.w - pad * (cols + 1)) / cols;
    const ch = (block.h - pad * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.15) continue; // empty lot
        const w = cw * Util.rand(0.6, 1);
        const h = ch * Util.rand(0.6, 1);
        const x = block.x + pad + c * (cw + pad) + Util.rand(0, cw - w);
        const y = block.y + pad + r * (ch + pad) + Util.rand(0, ch - h);
        const shade = Util.randInt(55, 85);
        this.obstacles.push({
          x, y, w, h,
          kind: "building",
          color: `rgb(${shade}, ${shade - 6}, ${shade - 12})`,
          roof: `rgb(${shade - 18}, ${shade - 22}, ${shade - 26})`,
        });
      }
    }
  }

  fillPark(block) {
    this.parks.push(block);
    const center = this.size / 2;
    const count = Math.floor((block.w * block.h) / 30000);
    for (let i = 0; i < count; i++) {
      const size = Util.rand(26, 44);
      const x = Util.rand(block.x + 20, block.x + block.w - 20 - size);
      const y = Util.rand(block.y + 20, block.y + block.h - 20 - size);
      if (Util.dist(x, y, center, center) < 200) continue;
      const tree = { x, y, w: size, h: size, kind: "tree" };
      if (this.obstacles.some((o) => this.rectsOverlap(o, tree, 30))) continue;
      this.obstacles.push(tree);
    }
    for (let i = 0; i < count; i++) {
      this.decor.push({
        x: Util.rand(block.x, block.x + block.w),
        y: Util.rand(block.y, block.y + block.h),
        r: Util.rand(4, 10),
        color: Util.pick(["#2f4a22", "#3a5a28", "#4a3b23"]),
      });
    }
  }

  rectsOverlap(a, b, margin = 0) {
    return (
      a.x - margin < b.x + b.w && a.x + a.w + margin > b.x &&
      a.y - margin < b.y + b.h && a.y + a.h + margin > b.y
    );
  }

  // Spatial hash for static obstacles so collision checks stay cheap.
  buildGrid() {
    this.gridCell = 200;
    this.gridN = Math.ceil(this.size / this.gridCell);
    this.grid = Array.from({ length: this.gridN * this.gridN }, () => []);
    for (const o of this.obstacles) {
      const x0 = Math.floor(o.x / this.gridCell);
      const y0 = Math.floor(o.y / this.gridCell);
      const x1 = Math.floor((o.x + o.w) / this.gridCell);
      const y1 = Math.floor((o.y + o.h) / this.gridCell);
      for (let gy = Math.max(0, y0); gy <= Math.min(this.gridN - 1, y1); gy++) {
        for (let gx = Math.max(0, x0); gx <= Math.min(this.gridN - 1, x1); gx++) {
          this.grid[gy * this.gridN + gx].push(o);
        }
      }
    }

    // Flow field blocked cells (static obstacles inflated by a zombie radius).
    this.flowN = Math.ceil(this.size / FLOW_CELL);
    const n = this.flowN;
    this.blocked = new Uint8Array(n * n);
    for (const o of this.obstacles) {
      const inflate = 10;
      const x0 = Math.floor((o.x - inflate) / FLOW_CELL);
      const y0 = Math.floor((o.y - inflate) / FLOW_CELL);
      const x1 = Math.floor((o.x + o.w + inflate) / FLOW_CELL);
      const y1 = Math.floor((o.y + o.h + inflate) / FLOW_CELL);
      for (let gy = Math.max(0, y0); gy <= Math.min(n - 1, y1); gy++) {
        for (let gx = Math.max(0, x0); gx <= Math.min(n - 1, x1); gx++) {
          this.blocked[gy * n + gx] = 1;
        }
      }
    }
    this.flowDist = new Int32Array(n * n);
    this.flowDirX = new Float32Array(n * n);
    this.flowDirY = new Float32Array(n * n);
    this.queue = new Int32Array(n * n);
  }

  // Obstacles near a point (static + barricades).
  nearby(x, y, radius) {
    const out = [];
    const x0 = Math.max(0, Math.floor((x - radius) / this.gridCell));
    const y0 = Math.max(0, Math.floor((y - radius) / this.gridCell));
    const x1 = Math.min(this.gridN - 1, Math.floor((x + radius) / this.gridCell));
    const y1 = Math.min(this.gridN - 1, Math.floor((y + radius) / this.gridCell));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (const o of this.grid[gy * this.gridN + gx]) {
          if (!out.includes(o)) out.push(o);
        }
      }
    }
    for (const b of this.barricades) {
      if (Util.circleRect(x, y, radius, b)) out.push(b);
    }
    return out;
  }

  // Keep a circle entity inside the map and outside solids.
  // Returns the barricade it bumped into (if any).
  collide(ent) {
    let hitBarricade = null;
    for (const o of this.nearby(ent.x, ent.y, ent.r + 4)) {
      if (Util.resolveCircleRect(ent, o) && o.kind === "barricade") hitBarricade = o;
    }
    ent.x = Util.clamp(ent.x, ent.r, this.size - ent.r);
    ent.y = Util.clamp(ent.y, ent.r, this.size - ent.r);
    return hitBarricade;
  }

  isFree(x, y, r) {
    if (x < r || y < r || x > this.size - r || y > this.size - r) return false;
    return !this.nearby(x, y, r).some((o) => Util.circleRect(x, y, r, o));
  }

  // First solid hit along a segment: returns { t, obstacle } or null.
  raycast(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const radius = Math.max(cx - minX, cy - minY) * 1.5 + 1;
    let best = null;
    for (const o of this.nearby(cx, cy, radius)) {
      if (o.kind === "tree" && Math.random() < 0.5) continue; // bullets slip through leaves
      const t = Util.segmentRect(x1, y1, x2, y2, o);
      if (t >= 0 && (!best || t < best.t)) best = { t, obstacle: o };
    }
    return best;
  }

  lineOfSight(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const radius = Util.dist(x1, y1, x2, y2) / 2 + 1;
    for (const o of this.nearby(cx, cy, radius)) {
      if (o.kind === "tree") continue;
      if (Util.segmentRect(x1, y1, x2, y2, o) >= 0) return false;
    }
    return true;
  }

  // BFS outward from the target so every reachable cell points toward it.
  updateFlowField(tx, ty) {
    const n = this.flowN;
    const dist = this.flowDist;
    const q = this.queue;
    dist.fill(-1);
    let start = Math.floor(ty / FLOW_CELL) * n + Math.floor(tx / FLOW_CELL);
    start = Util.clamp(start, 0, n * n - 1);
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const idx = q[head++];
      const cx = idx % n;
      const cy = (idx - cx) / n;
      const d = dist[idx] + 1;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const ni = ny * n + nx;
          if (dist[ni] !== -1 || this.blocked[ni]) continue;
          // No diagonal corner cutting
          if (ox && oy && (this.blocked[cy * n + nx] || this.blocked[ny * n + cx])) continue;
          dist[ni] = d;
          q[tail++] = ni;
        }
      }
    }

    // Each cell points at its lowest-distance neighbour.
    for (let i = 0; i < n * n; i++) {
      this.flowDirX[i] = 0;
      this.flowDirY[i] = 0;
      if (dist[i] <= 0) continue;
      const cx = i % n;
      const cy = (i - cx) / n;
      let best = dist[i];
      let bx = 0;
      let by = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const nd = dist[ny * n + nx];
          if (nd >= 0 && nd < best) {
            if (ox && oy && (this.blocked[cy * n + nx] || this.blocked[ny * n + cx])) continue;
            best = nd;
            bx = ox;
            by = oy;
          }
        }
      }
      const len = Math.hypot(bx, by) || 1;
      this.flowDirX[i] = bx / len;
      this.flowDirY[i] = by / len;
    }
  }

  flowAt(x, y) {
    const n = this.flowN;
    const gx = Util.clamp(Math.floor(x / FLOW_CELL), 0, n - 1);
    const gy = Util.clamp(Math.floor(y / FLOW_CELL), 0, n - 1);
    const i = gy * n + gx;
    return { x: this.flowDirX[i], y: this.flowDirY[i], reachable: this.flowDist[i] >= 0 };
  }

  addBarricade(x, y, angle) {
    // Barricades are axis-aligned planks placed in front of the player.
    const horizontal = Math.abs(Math.cos(angle)) < Math.abs(Math.sin(angle));
    const w = horizontal ? 80 : 22;
    const h = horizontal ? 22 : 80;
    const b = { x: x - w / 2, y: y - h / 2, w, h, kind: "barricade", hp: 220, maxHp: 220 };
    if (b.x < 0 || b.y < 0 || b.x + b.w > this.size || b.y + b.h > this.size) return null;
    if (this.nearby(x, y, 60).some((o) => this.rectsOverlap(o, b))) return null;
    this.barricades.push(b);
    return b;
  }

  removeDestroyedBarricades() {
    this.barricades = this.barricades.filter((b) => b.hp > 0);
  }

  // A random free spot at least `minDist` away from (px, py).
  randomSpawn(px, py, minDist, maxDist = Infinity) {
    for (let i = 0; i < 60; i++) {
      const a = Util.rand(0, TAU);
      const d = Util.rand(minDist, Math.min(maxDist, this.size));
      const x = px + Math.cos(a) * d;
      const y = py + Math.sin(a) * d;
      if (this.isFree(x, y, 24)) {
        const f = this.flowAt(x, y);
        if (f.reachable) return { x, y };
      }
    }
    return null;
  }
}
