// Keyboard, mouse and touch input. Game code reads the polled state each frame.
const Input = {
  keys: new Set(),
  pressed: new Set(), // keys pressed since last frame
  mouse: { x: 0, y: 0, down: false },
  wheel: 0,
  lastTouch: -Infinity,
  touch: {
    active: false,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0, active: false },
  },

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouse.down = false;
    });

    canvas.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      // Browsers emulate a mousemove after a tap; only real mice leave touch mode.
      if (performance.now() - this.lastTouch > 1000) this.touch.active = false;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouse.down = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false }
    );

    this.initTouch();
  },

  initTouch() {
    if (!("ontouchstart" in window)) return;
    window.addEventListener(
      "touchstart",
      () => {
        this.touch.active = true;
        this.lastTouch = performance.now();
      },
      { passive: true }
    );
    this.bindStick(document.getElementById("stick-move"), this.touch.move);
    this.bindStick(document.getElementById("stick-aim"), this.touch.aim);
    const tap = (id, key) => {
      document.getElementById(id).addEventListener("touchstart", (e) => {
        e.preventDefault();
        this.pressed.add(key);
      });
    };
    tap("touch-reload", "r");
    tap("touch-build", "e");
    tap("touch-swap", "q");
  },

  bindStick(el, out) {
    const knob = el.querySelector(".knob");
    let id = null;
    const update = (t) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width / 2;
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      out.x = dx / max;
      out.y = dy / max;
      out.active = len > max * 0.25;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const reset = () => {
      id = null;
      out.x = 0;
      out.y = 0;
      out.active = false;
      knob.style.transform = "";
    };
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      id = t.identifier;
      update(t);
    });
    el.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) update(t);
    });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) reset();
    };
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  },

  isDown(...names) {
    return names.some((n) => this.keys.has(n));
  },

  wasPressed(...names) {
    return names.some((n) => this.pressed.has(n));
  },

  // Call at the end of every frame.
  endFrame() {
    this.pressed.clear();
    this.wheel = 0;
  },
};
