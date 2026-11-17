// The screenshot scenes behind ?shot=start|play|drive|busted. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot that walks to a car, steals it, then drives the road grid toward the current
// mission marker, so the frame is what a short game really looks like and the same seed
// always gives the same frame.
import { ROADS_H, ROADS_V, STEP } from './config.js';
import { EVENT_BUSTED, EVENT_MISSION } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 34;
const DRIVE_SECONDS = 48;
const BUSTED_LIMIT_SECONDS = 120;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function nearest(list, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    const d = Math.hypot(item.x - x, item.y - y);
    if (d < bestD) { bestD = d; best = item; }
  }
  return { item: best, dist: bestD };
}

function nearestRoad(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y }; }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry }; }
  }
  return best;
}

function onRoad(x, y) {
  for (const rx of ROADS_V) if (Math.abs(x - rx) < 55) return { axis: 'v', road: rx };
  for (const ry of ROADS_H) if (Math.abs(y - ry) < 55) return { axis: 'h', road: ry };
  return null;
}

function closestRoad(list, value) {
  let best = list[0];
  for (const r of list) if (Math.abs(r - value) < Math.abs(best - value)) best = r;
  return best;
}

/** Next road-grid waypoint toward `target` from the car's position. */
function driveWaypoint(car, target) {
  const road = onRoad(car.x, car.y);
  if (!road) return nearestRoad(car.x, car.y);
  if (road.axis === 'v') {
    const ry = closestRoad(ROADS_H, target.y);
    if (Math.abs(car.y - ry) > 80) return { x: road.road, y: ry };
    const rx = closestRoad(ROADS_V, target.x);
    if (Math.abs(car.x - rx) > 80) return { x: rx, y: ry };
    return target;
  }
  const rx = closestRoad(ROADS_V, target.x);
  if (Math.abs(car.x - rx) > 80) return { x: rx, y: road.road };
  const ry = closestRoad(ROADS_H, target.y);
  if (Math.abs(car.y - ry) > 80) return { x: rx, y: ry };
  return target;
}

/** Steering input to drive the player's car toward a waypoint, with a stuck-recovery reverse. */
function makeDriver() {
  let stuckTimer = 0;
  let reverseTimer = 0;
  return function drive(state, target) {
    const car = state.player.inCar;
    if (!car) return { x: 0, y: 0, enter: false, punch: false };
    const wp = driveWaypoint(car, target);
    const desired = Math.atan2(wp.y - car.y, wp.x - car.x);
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (reverseTimer > 0) {
      reverseTimer -= STEP;
      return { x: diff > 0 ? -1 : 1, y: 1, enter: false, punch: false };
    }
    if (Math.abs(car.speed) < 25 && Math.abs(diff) < 1.2) {
      stuckTimer += STEP;
      if (stuckTimer > 1.6) {
        stuckTimer = 0;
        reverseTimer = 0.9;
        return { x: 0, y: 1, enter: false, punch: false };
      }
    } else {
      stuckTimer = 0;
    }
    const steer = clamp(diff * 2.2, -1, 1);
    // Always throttle: from a standstill the car cannot steer at all, so coasting
    // while facing the wrong way deadlocks. Driving forward while steering hard
    // makes a U-turn instead.
    return { x: steer, y: -1, enter: false, punch: false };
  };
}

/** Walk toward the nearest stealable car and press E when close. */
function walkToCar(state) {
  const p = state.player;
  const cars = state.cars.filter((c) => (c.kind === 'parked' || c.kind === 'traffic') && !c.wrecked);
  const { item: car, dist: d } = nearest(cars, p.x, p.y);
  if (!car) return { x: 0, y: 0, enter: false, punch: false };
  if (d < 50) return { x: 0, y: 0, enter: true, punch: false };
  return {
    x: clamp((car.x - p.x) / 30, -1, 1),
    y: clamp((car.y - p.y) / 30, -1, 1),
    enter: false,
    punch: false,
  };
}

function playForward(world, seconds, driver, wantBusted) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    let input;
    if (state.player.inCar) {
      const target = world.currentTarget() || { x: 2200, y: 400 };
      input = driver(state, target);
    } else if (wantBusted && state.footCops.length > 0) {
      const { item: cop } = nearest(state.footCops, state.player.x, state.player.y);
      input = cop
        ? { x: clamp((cop.x - state.player.x) / 30, -1, 1), y: clamp((cop.y - state.player.y) / 30, -1, 1), enter: false, punch: false }
        : { x: 0, y: 0, enter: false, punch: false };
    } else {
      input = walkToCar(state);
    }
    const events = world.step(STEP, input, false);
    if (events & EVENT_BUSTED) return true;
    if (!wantBusted && (events & EVENT_MISSION) && world.state.missionIndex >= 2) {
      // Play scene: stop shortly after the parcel run completes, while driving.
      return false;
    }
  }
  return world.state.busted;
}

/**
 * Set `world` to the named scene (start, play, drive or busted; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'drive' && name !== 'busted') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { x: 0, y: 0, enter: false, punch: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0, target: null };
  }
  if (name === 'busted') {
    world.state.wanted = 5;
    playForward(world, BUSTED_LIMIT_SECONDS, makeDriver(), true);
    if (!world.state.busted) {
      // Fallback: put the player right next to a cop and let the catch happen.
      const cop = world.state.footCops[0];
      if (cop) {
        world.state.player.x = cop.x + 10;
        world.state.player.y = cop.y + 10;
        playForward(world, 5, makeDriver(), true);
      }
      if (!world.state.busted) world.state.busted = true;
    }
    return { screen: SCREEN_OVER, best: world.state.money, target: world.currentTarget() };
  }
  if (name === 'drive') {
    const driver = makeDriver();
    playForward(world, 12, driver, false);
    world.state.wanted = 2;
    playForward(world, DRIVE_SECONDS - 12, driver, false);
    return { screen: SCREEN_PLAY, best: world.state.money, target: world.currentTarget() };
  }
  const driver = makeDriver();
  playForward(world, PLAY_SECONDS, driver, false);
  return { screen: SCREEN_PLAY, best: world.state.money, target: world.currentTarget() };
}
