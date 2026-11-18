// Vice Shores — bootstrap, game loop and menus. The simulation lives in
// world.js, the drawing in render.js, the HUD in hud.js; this file wires
// them together and owns the screens: title, play, pause, shop, wasted
// and the story-complete screen.

import { SHOT_PARAM, SPOTS } from './config.js';
import { createAudio } from './audio.js';
import { createInput, createFakeInput } from './input.js';
import { createRenderer, resetScene, resizeRenderer, syncWorld } from './render.js';
import { createWorld, stepAttract, stepWorld } from './world.js';
import { grabHud, updateHud } from './hud.js';
import { startMission, resetMission } from './missions.js';
import { SHOP_ITEMS, buyItem } from './shops.js';
import { clearSave, hasSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const shotName = params.get(SHOT_PARAM);
const seed = Number(params.get('seed') || 7) || 7;

const audio = createAudio();
const input = createInput(canvas);
const els = grabHud();
let world = createWorld(audio, seed);
const state = createRenderer(canvas, world);

/** Start over in the same scene: a fresh world, empty dynamic meshes. */
function freshWorld() {
  world = createWorld(audio, seed);
  resetScene(state);
  return world;
}

const overlays = {
  menu: document.getElementById('menu'),
  howto: document.getElementById('howto'),
  pause: document.getElementById('pause-menu'),
  shop: document.getElementById('shop-menu'),
  over: document.getElementById('over-menu'),
  win: document.getElementById('win-menu'),
};

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('on', key === name);
  }
  els.hud.classList.toggle('on', name !== 'menu' && name !== 'howto');
}

function setScreen(name) {
  world.screen = name;
  if (name === 'play') showOverlay(null);
  else if (name === 'title') showOverlay('menu');
  else if (name === 'pause') showOverlay('pause');
  else if (name === 'over') showOverlay('over');
  else if (name === 'win') showOverlay('win');
  refreshContinueButton();
}

function refreshContinueButton() {
  const save = loadSave();
  const btn = document.getElementById('btn-continue');
  const sub = document.getElementById('continue-sub');
  if (save) {
    btn.style.opacity = '1';
    sub.textContent = `Mission ${save.missionIndex + 1} · $${Math.floor(save.cash).toLocaleString('en-US')} · saved ${new Date(save.savedAt).toLocaleString()}`;
  } else {
    btn.style.opacity = '0.45';
    sub.textContent = 'No save found yet';
  }
}

function newGame() {
  freshWorld();
  startMission(world, 0);
  audio.unlock();
  setScreen('play');
}

function continueGame() {
  const save = loadSave();
  if (!save) return;
  freshWorld();
  const p = world.player;
  p.cash = save.cash;
  p.hp = save.hp;
  p.armor = save.armor || 0;
  p.ammo = save.ammo;
  p.hasPistol = save.hasPistol;
  p.x = save.x;
  p.z = save.z;
  world.clockMinutes = save.clockMinutes || 9 * 60;
  startMission(world, save.missionIndex || 0);
  audio.unlock();
  setScreen('play');
}

function respawn() {
  const p = world.player;
  p.cash = Math.floor(p.cash * 0.85);
  p.hp = 100;
  p.armor = 0;
  p.x = SPOTS.hospital.x;
  p.z = SPOTS.hospital.z;
  p.car = null;
  world.wanted = 0;
  world.wasted = false;
  world.audio.siren(false);
  resetMission(world);
  world.banner = { text: 'Patched up at Shores Hospital', sub: '−15% cash', kind: '', until: world.elapsed + 3 };
  setScreen('play');
}

function buildShop() {
  const list = document.getElementById('shop-items');
  list.innerHTML = '';
  SHOP_ITEMS.forEach((item, i) => {
    const button = document.createElement('button');
    button.className = 'shop-item';
    button.innerHTML = `<span class="key">${i + 1}</span><span class="name">${item.name}<small>${item.desc}</small></span><span class="price">$${item.price}</span>`;
    button.addEventListener('click', () => buyItem(world, item.id));
    list.appendChild(button);
  });
}

function wireButtons() {
  document.getElementById('btn-new').addEventListener('click', newGame);
  document.getElementById('btn-continue').addEventListener('click', continueGame);
  document.getElementById('btn-howto').addEventListener('click', () => showOverlay('howto'));
  document.getElementById('btn-howto-back').addEventListener('click', () => showOverlay('menu'));
  document.getElementById('btn-resume').addEventListener('click', () => setScreen('play'));
  document.getElementById('btn-save').addEventListener('click', () => {
    saveGame(world);
    world.banner = { text: 'Game saved', sub: '', kind: 'good', until: world.elapsed + 2 };
    setScreen('play');
  });
  document.getElementById('btn-quit-title').addEventListener('click', () => {
    freshWorld();
    world.attract = true;
    setScreen('title');
  });
  document.getElementById('btn-shop-close').addEventListener('click', () => { world.shopOpen = false; });
  document.getElementById('btn-respawn').addEventListener('click', respawn);
  document.getElementById('btn-over-title').addEventListener('click', () => {
    freshWorld();
    world.attract = true;
    setScreen('title');
  });
  document.getElementById('btn-freeroam').addEventListener('click', () => setScreen('play'));
  document.getElementById('btn-win-title').addEventListener('click', () => {
    freshWorld();
    world.attract = true;
    setScreen('title');
  });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('resize', () => resizeRenderer(state));
}

// --- Screenshot staging -------------------------------------------------
let shotFrames = 0;
if (shotName) {
  const screen = stageShot(shotName, world);
  world.screen = screen;
  if (screen === 'play') showOverlay(null);
  else showOverlay('menu');
  window.__shotName = shotName;
}

// --- Main loop ----------------------------------------------------------
let lastTime = performance.now();
let framesRendered = 0;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  if (world.screen === 'play') {
    if (input.wasPressed('pause')) {
      setScreen('pause');
    } else if (world.shopOpen) {
      if (input.wasPressed('action')) world.shopOpen = false;
      for (let i = 0; i < 4; i += 1) {
        if (input.wasPressed(`digit${i + 1}`)) buyItem(world, SHOP_ITEMS[i].id);
      }
    } else {
      stepWorld(world, input, dt, state.camera, canvas);
    }
    if (world.wasted) {
      document.getElementById('wasted-cause').textContent =
        `You were ${world.wastedCause || 'wasted'}. The PD scraped you off the street.`;
      setScreen('over');
    }
    if (world.screen === 'win') setScreen('win');
    if (world.shopOpen) showOverlay('shop');
    else if (world.screen === 'play') showOverlay(null);
    updateHud(world, els, audio);
  } else if (world.screen === 'title' || world.screen === 'pause' || world.screen === 'over' || world.screen === 'win') {
    if (world.screen === 'title') stepAttract(world, dt);
    if (input.wasPressed('pause') && world.screen === 'pause') setScreen('play');
  }

  syncWorld(state, world, dt);
  input.endFrame();
  framesRendered += 1;

  if (shotName) {
    shotFrames += 1;
    if (shotFrames === 30) window.__shotReady = true;
  }
  if (framesRendered === 2) window.__gameReady = true;
}

wireButtons();
buildShop();
refreshContinueButton();
if (!shotName) {
  world.attract = true;
  setScreen('title');
}
state.renderer.setAnimationLoop((t) => frame(t));

Object.assign(window, {
  __world: () => world,
  __newGame: newGame,
  __clearSave: clearSave,
  __hasSave: hasSave,
  /** The live key set: add 'up', 'left' and friends to drive the game. */
  __inputKeys: input.keys,
  /** Step the simulation without waiting for frames (used by tests). */
  __simulate(seconds) {
    const steps = Math.floor(seconds * 60);
    for (let i = 0; i < steps; i += 1) {
      if (world.screen === 'play') stepWorld(world, input, 1 / 60, state.camera, canvas);
      else if (world.screen === 'title') stepAttract(world, 1 / 60);
      input.endFrame();
    }
  },
});
