// Uses KeyboardEvent.code (physical key position), so WASD on QWERTY and ZQSD on AZERTY both work.
const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

export function createInput(canvas, { joystick, knob, interactButton }) {
  const keys = new Set();
  const presses = new Set(); // keys pressed since the last consumePresses(), for toggles
  let enabled = true;
  const state = {
    lookX: 0,
    lookY: 0,
    zoom: 0,
    stick: { x: 0, y: 0 },
  };

  addEventListener('keydown', (e) => {
    if (!enabled || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    keys.add(e.code);
    if (!e.repeat) presses.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // Mouse / touch drag on the canvas orbits the camera.
  const drags = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const last = drags.get(e.pointerId);
    if (!last) return;
    state.lookX += e.clientX - last.x;
    state.lookY += e.clientY - last.y;
    last.x = e.clientX;
    last.y = e.clientY;
  });
  const endDrag = (e) => {
    drags.delete(e.pointerId);
    if (!drags.size) canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.zoom += Math.sign(e.deltaY);
  }, { passive: false });

  // Virtual joystick (touch devices).
  let stickId = null;
  const stickMove = (e) => {
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = e.clientX - (rect.left + radius);
    let dy = e.clientY - (rect.top + radius);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.stick.x = dx / radius;
    state.stick.y = -dy / radius;
  };
  joystick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    joystick.setPointerCapture(e.pointerId);
    stickMove(e);
  });
  joystick.addEventListener('pointermove', (e) => e.pointerId === stickId && stickMove(e));
  const stickEnd = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    state.stick.x = state.stick.y = 0;
    knob.style.transform = '';
  };
  joystick.addEventListener('pointerup', stickEnd);
  joystick.addEventListener('pointercancel', stickEnd);

  // The touch E button acts like a tap on the E key.
  interactButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    presses.add('KeyE');
  });
  interactButton.addEventListener('contextmenu', (e) => e.preventDefault());

  const any = (codes) => codes.some((c) => keys.has(c));

  return {
    /** While disabled (an overlay covers the scene), keys are left to the page, e.g. for scrolling. */
    set enabled(value) {
      enabled = value;
      if (!value) {
        keys.clear();
        presses.clear();
      }
    },
    /** Movement intent: x = right, y = forward, length <= 1. */
    move() {
      let x = (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0) + state.stick.x;
      let y = (any(FORWARD) ? 1 : 0) - (any(BACK) ? 1 : 0) + state.stick.y;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      return { x, y };
    },
    get running() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(state.stick.x, state.stick.y) > 0.9;
    },
    /** Returns and resets the key codes pressed since the last call (key repeat ignored). */
    consumePresses() {
      const out = new Set(presses);
      presses.clear();
      return out;
    },
    /** Returns and resets accumulated look / zoom deltas. */
    consumeLook() {
      const out = { x: state.lookX, y: state.lookY, zoom: state.zoom };
      state.lookX = state.lookY = state.zoom = 0;
      return out;
    },
  };
}
