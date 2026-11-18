// Keyboard and mouse input. The game reads a snapshot every frame; edges
// (a key just pressed) are consumed once, so menus and actions never fire
// twice from one press.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, moved: false };

  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'run', ShiftRight: 'run', Space: 'handbrake',
    KeyE: 'action', KeyF: 'punch', KeyR: 'radio', KeyM: 'mute',
    KeyP: 'pause', Escape: 'pause', Enter: 'confirm',
    Digit1: 'digit1', Digit2: 'digit2', Digit3: 'digit3', Digit4: 'digit4',
  };

  function onKeyDown(event) {
    const name = KEYMAP[event.code];
    if (!name) return;
    if (event.code === 'Space') event.preventDefault();
    if (!keys.has(name)) pressed.add(name);
    keys.add(name);
  }
  function onKeyUp(event) {
    const name = KEYMAP[event.code];
    if (name) keys.delete(name);
  }
  function onMouseMove(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.moved = true;
  }
  function onMouseDown(event) {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    keys, mouse,
    held(name) { return keys.has(name); },
    move() {
      const x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len, active: x !== 0 || y !== 0 };
    },
    /** True once for the frame after the key went down. */
    wasPressed(name) { return pressed.has(name); },
    takeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c;
    },
    /** Clear the one-frame edges after the frame is stepped. */
    endFrame() { pressed.clear(); mouse.clicked = false; },
  };
}

/** A fake input for the screenshot autopilot: the same shape, driven by code. */
export function createFakeInput() {
  const keys = new Set();
  const mouse = { x: 640, y: 360, down: false, clicked: false };
  return {
    keys, mouse,
    held(name) { return keys.has(name); },
    move() {
      const x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const y = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len, active: x !== 0 || y !== 0 };
    },
    wasPressed() { return false; },
    takeClick() { return false; },
    endFrame() {},
  };
}
