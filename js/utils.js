// Shared math helpers and constants.
const TAU = Math.PI * 2;

const Util = {
  clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  },
  lerp(a, b, t) {
    return a + (b - a) * t;
  },
  rand(min, max) {
    return min + Math.random() * (max - min);
  },
  randInt(min, max) {
    return Math.floor(Util.rand(min, max + 1));
  },
  pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },
  dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
  },
  angleTo(ax, ay, bx, by) {
    return Math.atan2(by - ay, bx - ax);
  },
  // Weighted random choice: items = [{ weight, ... }]
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.weight;
    let r = Math.random() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  },
  // Circle vs axis-aligned rectangle overlap test.
  circleRect(cx, cy, r, rect) {
    const nx = Util.clamp(cx, rect.x, rect.x + rect.w);
    const ny = Util.clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  },
  // Push a circle out of a rectangle. Returns true if it collided.
  resolveCircleRect(ent, rect) {
    const nx = Util.clamp(ent.x, rect.x, rect.x + rect.w);
    const ny = Util.clamp(ent.y, rect.y, rect.y + rect.h);
    let dx = ent.x - nx;
    let dy = ent.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= ent.r * ent.r) return false;
    if (d2 === 0) {
      // Center is inside the rect: push out along the shallowest axis.
      const left = ent.x - rect.x;
      const right = rect.x + rect.w - ent.x;
      const top = ent.y - rect.y;
      const bottom = rect.y + rect.h - ent.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) ent.x = rect.x - ent.r;
      else if (m === right) ent.x = rect.x + rect.w + ent.r;
      else if (m === top) ent.y = rect.y - ent.r;
      else ent.y = rect.y + rect.h + ent.r;
      return true;
    }
    const d = Math.sqrt(d2);
    const push = ent.r - d;
    ent.x += (dx / d) * push;
    ent.y += (dy / d) * push;
    return true;
  },
  // Segment vs rectangle intersection (Liang–Barsky). Returns t in [0,1] or -1.
  segmentRect(x1, y1, x2, y2, rect) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return -1;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return -1;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return -1;
          if (t < t1) t1 = t;
        }
      }
    }
    return t0;
  },
  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  },
};

// localStorage can throw in private mode or sandboxed frames.
const Store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // ignore
    }
  },
};
