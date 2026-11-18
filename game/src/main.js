// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, game over and win. Progress saves to localStorage on every mission
// completion and every pause.
//
// ?seed=N fixes the city. ?shot=chase|street|mission|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, resetWorld, stepWorld, EVENT_BUSTED, EVENT_WASTED, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { startMission } from './missions.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.player.cash,
      hp: Math.max(1, Math.ceil(world.player.hp)),
      hasPistol: world.player.hasPistol,
      missionIndex: world.mission.done ? 5 : world.mission.index,
      x: world.player.x,
      y: world.player.y,
      kills: world.stats.kills,
      carsStolen: world.stats.carsStolen,
      missionsDone: world.stats.missionsDone,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  const save = readSave();
  return save ? save.cash : 0;
}

function applySave(save) {
  world.player.cash = save.cash || 0;
  world.player.hp = save.hp || 100;
  world.player.hasPistol = !!save.hasPistol;
  world.player.x = save.x ?? world.player.x;
  world.player.y = save.y ?? world.player.y;
  world.stats.kills = save.kills || 0;
  world.stats.carsStolen = save.carsStolen || 0;
  world.stats.missionsDone = save.missionsDone || 0;
  const idx = Math.min(save.missionIndex || 0, 4);
  if (save.missionIndex >= 5) {
    world.mission.done = true;
    world.mission.index = 5;
    world.mission.objective = 'Story complete — Port Meridian is yours. Free roam!';
  } else {
    startMission(world, idx);
  }
  world.camera.x = world.player.x;
  world.camera.y = world.player.y;
}

function runShot(name) {
  const scene = stageShot(name, world);
  world.best = readBest();
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, world.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let continuePressed = false;
  world.best = best;
  world.saveExists = !!readSave();

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat && screen === SCREEN_TITLE) continuePressed = true;
  });

  function announce(message) {
    status.textContent = message;
  }

  function startGame(fresh) {
    if (fresh) resetWorld(world);
    const save = fresh ? null : readSave();
    if (save) applySave(save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    world.audio.unlock();
    announce('Playing Meridian Heat. Follow the gold marker.');
  }

  function endGame(busted) {
    world.wasBusted = busted;
    screen = SCREEN_OVER;
    world.audio.busted();
    if (world.player.cash > best) {
      best = world.player.cash;
      world.best = best;
    }
    announce(busted ? 'Busted by the Meridian PD.' : 'Wasted.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (input.takeMute()) {
      const muted = world.audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (continuePressed) {
      continuePressed = false;
      if (screen === SCREEN_TITLE && readSave()) startGame(false);
      return;
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame(true);
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_OVER || screen === SCREEN_WIN)) startGame(true);
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The city lives behind the menu.
      const idle = {
        move: () => ({ x: 0, y: 0, active: false }),
        keys: () => ({ up: false, down: false, left: false, right: false }),
        isHandbrake: () => false,
        mouse: () => ({ x: 0, y: 0, down: false }),
        takeActions: () => 0,
      };
      stepWorld(world, idle, STEP);
      return;
    }
    const events = stepWorld(world, input, STEP);
    if (world.events.missionDone) {
      writeSave();
      if (world.player.cash > best) best = world.player.cash;
    }
    if (events & EVENT_WASTED) endGame(false);
    else if (events & EVENT_BUSTED) endGame(true);
    else if (events & EVENT_WIN) {
      screen = SCREEN_WIN;
      writeSave();
      announce('The Meridian Job is done. Port Meridian is yours.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, world.time);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused.');
    }
  });

  announce('Meridian Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
