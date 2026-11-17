// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and busted.
//
// ?seed=N fixes the city. ?shot=start|play|drive|busted (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot. Progress (money and missions done) is saved to localStorage.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_HIT, EVENT_MISSION, EVENT_PUNCH } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const errors = document.getElementById('errors');
window.addEventListener('error', (event) => {
  if (errors) errors.textContent += `${event.message} @${event.filename || ''}:${event.lineno || ''};`;
});

const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { money: 50, missionIndex: 0 };
    const save = JSON.parse(raw);
    return {
      money: typeof save.money === 'number' ? save.money : 50,
      missionIndex: typeof save.missionIndex === 'number' ? save.missionIndex : 0,
    };
  } catch {
    return { money: 50, missionIndex: 0 };
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveProgress() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: world.state.money,
      missionIndex: world.state.missionIndex,
    }));
    if (world.state.money > readBest()) window.localStorage.setItem(BEST_KEY, String(world.state.money));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function applySave() {
  const save = readSave();
  world.state.money = save.money;
  world.state.missionIndex = Math.min(save.missionIndex, 5);
  if (world.state.missionIndex >= 5) world.state.allDone = true;
  if (world.state.missionIndex === 4) world.state.wanted = 0;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.target);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      document.title = 'shot-ready';
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    applySave();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing Vice Shores. Steal a car to start the first mission.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    saveProgress();
    if (world.state.money > best) best = world.state.money;
    audio.busted();
    announce(`Busted. Money $${world.state.money}. Best $${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return actions;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0, enter: false, punch: false }, true);
      return;
    }
    const vector = input.vector();
    const drive = {
      x: vector.x,
      y: vector.y,
      enter: Boolean(actions & ACTION_ENTER),
      punch: Boolean(actions & ACTION_PUNCH),
    };
    const events = world.step(STEP, drive, false);
    if (events & EVENT_MISSION) {
      audio.jingle();
      saveProgress();
      if (world.state.money > best) best = world.state.money;
      announce(world.state.toastText);
    }
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_BUSTED) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const speed01 = world.state.player.inCar ? Math.abs(world.state.player.inCar.speed) / 360 : 0;
    if (screen === SCREEN_PLAY) audio.update(STEP, speed01, world.state.siren);
    else audio.update(STEP, 0, false);
    renderer.draw(world.state, screen, best, world.currentTarget());
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  applySave();
  announce('Vice Shores. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
