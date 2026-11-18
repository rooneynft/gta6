// The screenshot scenes behind ?shot=start|street|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot (drive toward the mission marker
// along the road grid, shoot the nearest rival), so the frame is what a
// short game really looks like and the same seed always gives the same
// frame.

import { ROADS_X, ROADS_Z, SPOTS } from './config.js';
import { angleDiff } from './random.js';
import { createFakeInput } from './input.js';
import { stepAttract, stepWorld } from './world.js';
import { startMission, updateMissionObjective } from './missions.js';
import { enterCar } from './player.js';

const STEP = 1 / 60;

function runSteps(world, input, seconds, steer) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (steer) steer(input, world);
    stepWorld(world, input, STEP, null, null);
    if (world.player.hp <= 0) break;
  }
}

/** Drive toward a point along the road grid, like a local would. */
function driveToward(input, world, tx, tz) {
  const car = world.player.car;
  if (!car) return;
  const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const targetRoadZ = nearest(ROADS_Z, tz);
  const targetRoadX = nearest(ROADS_X, tx);
  const onV = ROADS_X.some((rx) => Math.abs(car.x - rx) < 12);
  const onH = ROADS_Z.some((rz) => Math.abs(car.z - rz) < 12);
  let wx = tx;
  let wy = tz;
  if (onV) {
    // Stay on this road until the crossing is close, then turn onto it:
    // aiming at the target too early cuts the corner through a block.
    if (Math.abs(car.z - targetRoadZ) > 14) {
      wx = nearest(ROADS_X, car.x);
      wy = targetRoadZ;
    } else {
      wx = targetRoadX;
      wy = targetRoadZ;
    }
  } else if (onH) {
    if (Math.abs(car.x - targetRoadX) > 14) {
      wx = targetRoadX;
      wy = nearest(ROADS_Z, car.z);
    } else {
      wx = tx;
      wy = tz;
    }
  } else {
    const p = { x: nearest(ROADS_X, car.x), z: car.z };
    const q = { x: car.x, z: nearest(ROADS_Z, car.z) };
    if (Math.abs(p.x - car.x) < Math.abs(q.z - car.z)) {
      wx = p.x;
      wy = p.z;
    } else {
      wx = q.x;
      wy = q.z;
    }
  }
  const dx = wx - car.x;
  const dz = wy - car.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  const diff = angleDiff(car.angle, want);
  const k = input.keys;
  // Keep rolling while turning: a car can only steer once it moves, so
  // never cut the throttle for a big angle — brake instead, and only when
  // already fast, so the turn happens at the intersection.
  if (Math.abs(diff) > 0.9 && Math.abs(car.speed) > 8) {
    k.delete('up');
    k.add('down');
  } else {
    k.add('up');
    k.delete('down');
  }
  if (diff > 0.12) { k.add('left'); k.delete('right'); }
  else if (diff < -0.12) { k.add('right'); k.delete('left'); }
  else { k.delete('left'); k.delete('right'); }
  if (dist < 30) k.delete('up');
  // Stuck against a wall: reverse out with opposite lock, then carry on.
  if (k.has('up') && Math.abs(car.speed) < 3 && dist > 40) {
    input.stuckTimer = (input.stuckTimer || 0) + STEP;
  } else {
    input.stuckTimer = 0;
  }
  if (input.stuckTimer > 1.2) {
    input.stuckTimer = 0;
    k.delete('up');
    k.add('down');
    if (k.has('left')) { k.delete('left'); k.add('right'); }
    else if (k.has('right')) { k.delete('right'); k.add('left'); }
    input.reverseUntil = (input.reverseUntil || 0) + 1;
  }
  if (input.reverseUntil > 0) {
    input.reverseUntil -= STEP;
    k.delete('up');
    k.add('down');
    if (input.reverseUntil <= 0) k.delete('down');
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any name other than street/chase/mission is the title scene.
 */
function w_rivalsLeft(world) {
  return world.rivals.some((r) => r.alive);
}

export function stageShot(name, world) {
  const input = createFakeInput();
  if (name === 'chase') {
    // Mission 4 in full flight: the gold Comet GT, 3-star heat, patrol cars
    // on the tail and the police helicopter overhead, driving for the hideout.
    startMission(world, 3);
    const gt = world.cars.find((c) => c.type === 'sports');
    world.player.x = gt.x;
    world.player.z = gt.z;
    enterCar(world, gt);
    world.mission.step = 1;
    updateMissionObjective(world);
    world.setWanted(3, 'grand theft auto');
    runSteps(world, input, 9, (inp, w) => driveToward(inp, w, SPOTS.hideout.x, SPOTS.hideout.z));
    return 'play';
  }
  if (name === 'street') {
    // On foot in Downtown at rush hour: mission 1 active, traffic and
    // pedestrians all around, a stealable sedan at the kerb.
    startMission(world, 0);
    world.player.x = 0;
    world.player.z = 0;
    world.cameraYaw = Math.PI * 0.75;
    runSteps(world, input, 3);
    return 'play';
  }
  if (name === 'mission') {
    // Mission 3: the dockside payback, pistol out, rivals engaging.
    // The mission is held here so the frame stays in the fight.
    world.holdMission = true;
    startMission(world, 2);
    world.player.hasPistol = true;
    world.player.ammo = 60;
    world.player.x = SPOTS.docks.x - 4;
    world.player.z = SPOTS.docks.z + 8;
    stepWorld(world, input, STEP, null, null);
    runSteps(world, input, 1.6, (inp, w) => {
      const rival = w.rivals.find((r) => r.alive);
      if (rival) {
        w.autoAim = { x: rival.x, z: rival.z };
        inp.mouse.down = true;
      } else {
        w.autoAim = null;
        inp.mouse.down = false;
      }
    });
    // If the fight already ended, stage it fresh with rivals alive.
    if (!w_rivalsLeft(world)) {
      world.holdMission = true;
      startMission(world, 2);
      world.player.hasPistol = true;
      world.player.ammo = 60;
      world.player.x = SPOTS.docks.x - 4;
      world.player.z = SPOTS.docks.z + 8;
      stepWorld(world, input, STEP, null, null);
      stepWorld(world, input, STEP, null, null);
    }
    return 'play';
  }
  // Title: the city alive behind the menu, camera orbiting.
  world.attract = true;
  const steps = Math.floor(6 / STEP);
  for (let i = 0; i < steps; i += 1) stepAttract(world, STEP);
  return 'title';
}
