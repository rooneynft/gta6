// Keyboard and mouse input. Held keys give a movement vector; one-shot presses
// (enter a car, punch, start, pause) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);

export function createInput(canvas) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let handbrake = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mutePressed = false;

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 1280;
    mouseY = ((event.clientY - rect.top) / rect.height) * 720;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) mutePressed = true;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  window.addEventListener('blur', () => {
    up = down = left = right = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', trackMouse);
  canvas.addEventListener('pointerdown', (event) => {
    trackMouse(event);
    mouseDown = true;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Normalised movement vector from the held keys. */
    move() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len, active: x !== 0 || y !== 0 };
    },
    keys() {
      return { up, down, left, right };
    },
    isHandbrake() {
      return handbrake;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    takeMute() {
      const m = mutePressed;
      mutePressed = false;
      return m;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
