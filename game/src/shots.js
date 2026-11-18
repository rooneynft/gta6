// The screenshot scenes behind ?shot=chase|street|mission|start. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (drive toward the mission marker along
// the road grid, walk toward the objective, shoot the nearest rival), so the
// frame is what a short game really looks like and the same seed always gives
// the same frame.

import { STEP } from './config.js';
import { resetWorld, stepWorld } from './world.js';
import { addHeat } from './police.js';
import { startMission } from './missions.js';
import { makePed, makeTrafficCar } from './traffic.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** A fake input object the autopilot drives instead of a keyboard. */
function fakeInput() {
  const keys = { up: false, down: false, left: false, right: false };
  const mouse = { x: 640, y: 360, down: false };
  return {
    keysState: keys,
    mouseState: mouse,
    move() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      return { x: x / len, y: y / len, active: x !== 0 || y !== 0 };
    },
    keys() {
      return keys;
    },
    isHandbrake() {
      return false;
    },
    mouse() {
      return mouse;
    },
    takeActions() {
      return 0;
    },
  };
}

function driveToward(input, world, tx, ty) {
  const car = world.player.car;
  if (!car) return;
  // Route along the road grid (Manhattan): stay on the current road until the
  // crossing road nearest the target, then turn onto it.
  const ROADS_V = [240, 640, 1040, 1440, 1840, 2240, 2640, 2960];
  const ROADS_H = [240, 640, 1040, 1440, 1840, 2080];
  const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const targetRoadY = nearest(ROADS_H, ty);
  const targetRoadX = nearest(ROADS_V, tx);
  let wx = tx;
  let wy = ty;
  const onV = ROADS_V.some((rx) => Math.abs(car.x - rx) < 50);
  const onH = ROADS_H.some((ry) => Math.abs(car.y - ry) < 50);
  if (onV) {
    // Along the vertical road toward the target's horizontal road; turn early.
    if (Math.abs(car.y - targetRoadY) > 160) {
      wx = nearest(ROADS_V, car.x);
      wy = targetRoadY;
    } else {
      wx = targetRoadX;
      wy = targetRoadY;
    }
  } else if (onH) {
    if (Math.abs(car.x - targetRoadX) > 160) {
      wx = targetRoadX;
      wy = nearest(ROADS_H, car.y);
    } else {
      wx = tx;
      wy = ty;
    }
  } else {
    // Off the grid: head for the nearest road point first.
    const p = { x: nearest(ROADS_V, car.x), y: car.y };
    const q = { x: car.x, y: nearest(ROADS_H, car.y) };
    if (Math.abs(p.x - car.x) < Math.abs(q.y - car.y)) {
      wx = p.x;
      wy = p.y;
    } else {
      wx = q.x;
      wy = q.y;
    }
  }
  const dx = wx - car.x;
  const dy = wy - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const k = input.keysState;
  // Brake before a sharp turn and only accelerate once roughly aligned, so
  // the car turns at the intersection instead of cutting through a block.
  k.up = dist > 60 && Math.abs(diff) < 0.5;
  k.down = Math.abs(diff) > 0.9 && Math.abs(car.speed) > 200;
  k.left = diff < -0.12;
  k.right = diff > 0.12;
  // Stuck against something: only after pushing forward without moving for a
  // while — never at a standstill, where the car has simply not started yet.
  if (k.up && Math.abs(car.speed) < 12 && dist > 60) {
    input.stuckTimer = (input.stuckTimer || 0) + STEP;
  } else {
    input.stuckTimer = 0;
  }
  if (input.stuckTimer > 1.2) {
    input.stuckTimer = 0;
    k.up = false;
    k.down = true;
    k.left = !k.left;
    k.right = !k.right;
  }
}

function walkToward(input, world, tx, ty) {
  const p = world.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const k = input.keysState;
  k.up = dy < -24;
  k.down = dy > 24;
  k.left = dx < -24;
  k.right = dx > 24;
}

function shootNearestRival(input, world) {
  const player = world.player;
  let best = null;
  let bestD = 520;
  for (const rival of world.combat.rivals) {
    const d = Math.hypot(rival.x - player.x, rival.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = rival;
    }
  }
  if (!best) {
    input.mouseState.down = false;
    return;
  }
  input.mouseState.x = best.x - world.camera.x + 640;
  input.mouseState.y = best.y - world.camera.y + 360;
  input.mouseState.down = true;
}

function runSteps(world, input, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, input, STEP);
    if (world.player.hp <= 0) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any name other than chase/street/mission is the title scene.
 */
export function stageShot(name, world) {
  resetWorld(world);
  const input = fakeInput();
  if (name === 'chase') {
    // Mission 4 in full flight: the yellow Comet GT, 3-star heat, patrol cars
    // on the tail, driving for the hideout.
    startMission(world, 3);
    const gt = world.traffic.find((c) => c.sports);
    world.player.x = gt.x;
    world.player.y = gt.y;
    gt.kind = 'player';
    gt.maxSpeed = 680;
    world.traffic.splice(world.traffic.indexOf(gt), 1);
    world.player.car = gt;
    world.mission.step = 1;
    addHeat(world, 3, 'grand theft auto');
    world.mission.objective = 'Lose the heat, then reach the hideout';
    world.mission.marker = { ...world.city.spots.hideout };
    for (let i = 0; i < 9 / STEP; i += 1) {
      driveToward(input, world, world.city.spots.hideout.x, world.city.spots.hideout.y);
      stepWorld(world, input, STEP);
      if (world.player.hp <= 0) break;
    }
    return { screen: SCREEN_PLAY, best: world.player.cash };
  }
  if (name === 'street') {
    // On foot in Downtown, traffic and pedestrians all around. A few extra
    // cars and walkers are staged on the nearby roads so the frame is busy.
    world.player.x = 1440;
    world.player.y = 1040;
    world.camera.x = 1440;
    world.camera.y = 1040;
    for (const spot of [
      { x: 1440, y: 800, vertical: true },
      { x: 1440, y: 1300, vertical: true },
      { x: 1200, y: 1040, vertical: false },
      { x: 1700, y: 1040, vertical: false },
    ]) {
      const car = makeTrafficCar(world.city, world.rand, spot.x, spot.y, spot.vertical, 1);
      world.traffic.push(car);
    }
    for (let i = 0; i < 5; i += 1) {
      world.peds.push(makePed(world.city, world.rand,
        1440 + (world.rand() - 0.5) * 500, 1040 + (world.rand() - 0.5) * 300));
    }
    runSteps(world, input, 2);
    for (let i = 0; i < 6 / STEP; i += 1) {
      walkToward(input, world, 1840, 1040);
      stepWorld(world, input, STEP);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    // Mission 3: the dockside payback, pistol out, rivals engaging.
    startMission(world, 2);
    world.player.hasPistol = true;
    world.player.x = world.city.spots.docks.x - 100;
    world.player.y = world.city.spots.docks.y;
    // One step inside the docks marker spawns the four rivals.
    stepWorld(world, input, STEP);
    for (let i = 0; i < 2.0 / STEP; i += 1) {
      shootNearestRival(input, world);
      stepWorld(world, input, STEP);
      if (world.player.hp <= 0) break;
    }
    return { screen: SCREEN_PLAY, best: world.player.cash };
  }
  // Title: the city alive behind the menu.
  world.attract = true;
  runSteps(world, input, 5);
  return { screen: SCREEN_TITLE, best: 0 };
}
