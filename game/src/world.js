// The world: one state object and the fixed-step update that drives it. The
// player walks or drives, cars collide with buildings and each other, crimes
// raise heat, missions advance, and the camera follows the action.

import { CAR, PLAYER, STEP } from './config.js';
import { WORLD, collideBuildings, generateCity, pointInWater, rectHitsBuilding } from './city.js';
import { createAudio } from './audio.js';
import { createCombat, explodeCar, playerPunch, playerShoot, updateCombat } from './combat.js';
import { createMissionState, startMission, updateMissions } from './missions.js';
import { addHeat, createPolice, updatePolice } from './police.js';
import { createRandom } from './random.js';
import { makeTrafficCar, spawnPeds, spawnTraffic, updatePeds, updateTraffic, scarePeds } from './traffic.js';
import { ACTION_ENTER, ACTION_PUNCH } from './input.js';

export const EVENT_WASTED = 1;
export const EVENT_BUSTED = 2;
export const EVENT_WIN = 4;

export function createWorld(random) {
  const city = generateCity(random);
  const world = {
    rand: random,
    city,
    time: 0,
    player: {
      x: city.spots.playerStart.x,
      y: city.spots.playerStart.y,
      angle: Math.PI / 2,
      hp: PLAYER.hp,
      cash: 0,
      car: null,
      hasPistol: false,
      shootTimer: 0,
      punchTimer: 0,
    },
    traffic: spawnTraffic(city, random, 20),
    peds: spawnPeds(city, random, 30),
    police: createPolice(),
    combat: createCombat(),
    mission: createMissionState(),
    invulnerable: 0,
    camera: { x: city.spots.playerStart.x, y: city.spots.playerStart.y },
    shake: 0,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0 },
    audio: createAudio(),
    events: {},
    attract: false,
  };
  // A few parked cars the player can steal right away.
  const parked = [
    { x: 640, y: 470, vertical: true },
    { x: 1040, y: 730, vertical: false },
    { x: 1440, y: 560, vertical: true },
    { x: 1840, y: 1130, vertical: false },
  ];
  for (const p of parked) {
    const car = makeTrafficCar(city, random, p.x, p.y, p.vertical, 1);
    car.speed = 0;
    car.maxSpeed = 0;
    car.kind = 'parked';
    world.traffic.push(car);
  }
  // The Comet GT for mission 4, parked and waiting.
  const gt = makeTrafficCar(city, random, city.spots.sportsCar.x, city.spots.sportsCar.y, true, 1);
  gt.speed = 0;
  gt.maxSpeed = 0;
  gt.kind = 'parked';
  gt.sports = true;
  gt.hp = CAR.hp;
  gt.color = '#ffd23f';
  world.traffic.push(gt);
  startMission(world, 0);
  return world;
}

export function resetWorld(world) {
  const fresh = createWorld(world.rand);
  for (const key of Object.keys(fresh)) world[key] = fresh[key];
}

function nearestStealableCar(world) {
  const player = world.player;
  let best = null;
  let bestD = 70;
  for (const car of world.traffic) {
    if (car.wreck > 0) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function enterCar(world, car) {
  const player = world.player;
  player.car = car;
  car.kind = 'player';
  car.maxSpeed = car.sports ? CAR.sportsMax : CAR.maxSpeed;
  car.hp = CAR.hp;
  car.speed = 0;
  const idx = world.traffic.indexOf(car);
  if (idx !== -1) world.traffic.splice(idx, 1);
  world.stats.carsStolen += 1;
  // Stealing in front of a witness brings the law.
  const witnessed = world.peds.some((p) => p.state !== 'down' && Math.hypot(p.x - player.x, p.y - player.y) < 260)
    || world.police.cars.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 420);
  if (witnessed) addHeat(world, 1, 'car theft');
  world.audio.pickup();
}

function exitCar(world) {
  const player = world.player;
  const car = player.car;
  if (!car) return;
  car.speed = 0;
  car.kind = 'parked';
  car.maxSpeed = 0;
  const side = Math.cos(car.angle + Math.PI / 2) * 34;
  const sideY = Math.sin(car.angle + Math.PI / 2) * 34;
  player.x = car.x + side;
  player.y = car.y + sideY;
  player.car = null;
  world.traffic.push(car);
}

function updatePlayerOnFoot(world, dt, input) {
  const player = world.player;
  const move = input.move();
  const speed = PLAYER.speed;
  let nx = player.x + move.x * speed * dt;
  let ny = player.y + move.y * speed * dt;
  if (move.active) player.angle = Math.atan2(move.y, move.x);
  const fixed = collideBuildings(nx, ny, PLAYER.radius, world.city.buildings);
  nx = fixed.x;
  ny = fixed.y;
  if (pointInWater(nx, ny)) {
    nx = player.x;
    ny = player.y;
  }
  nx = Math.max(24, Math.min(WORLD.width - 24, nx));
  ny = Math.max(24, Math.min(WORLD.height - 24, ny));
  player.x = nx;
  player.y = ny;
  // Bumping a pedestrian at speed knocks them down.
  for (const ped of world.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - player.x, ped.y - player.y) < 22) {
      ped.state = 'down';
      ped.downTimer = 6;
      scarePeds(world, ped.x, ped.y, 260);
    }
  }
}

function updatePlayerCar(world, dt, input) {
  const player = world.player;
  const car = player.car;
  const keys = input.keys();
  const forward = keys.up ? 1 : keys.down ? -0.55 : 0;
  const steerInput = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const speed01 = Math.abs(car.speed) / CAR.sportsMax;
  car.angle += steerInput * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 140 + 0.25) * (car.speed < 0 ? -1 : 1);
  if (forward > 0) car.speed += CAR.accel * dt;
  else if (forward < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
  else car.speed -= car.speed * CAR.drag * dt;
  if (input.isHandbrake()) car.speed -= car.speed * 3 * dt;
  car.speed = Math.max(-CAR.reverseMax, Math.min(car.maxSpeed, car.speed));
  let nx = car.x + Math.cos(car.angle) * car.speed * dt;
  let ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hitB = rectHitsBuilding(nx, ny, 20, 12, world.city.buildings);
  if (hitB) {
    car.speed *= -0.25;
    if (Math.abs(car.speed) > 80) car.hp -= 0.06;
    world.shake = 0.25;
    if (Math.abs(car.speed) > 60) world.audio.crash();
    nx = car.x;
    ny = car.y;
  }
  if (pointInWater(nx, ny)) {
    car.speed *= -0.3;
    nx = car.x;
    ny = car.y;
  }
  nx = Math.max(30, Math.min(WORLD.width - 30, nx));
  ny = Math.max(30, Math.min(WORLD.height - 30, ny));
  // Car-to-car bumps.
  for (const other of [...world.traffic, ...world.police.cars]) {
    if (other.wreck > 0) continue;
    const dx = other.x - nx;
    const dy = other.y - ny;
    const d = Math.hypot(dx, dy);
    if (d < 44 && d > 0.01) {
      const push = (44 - d) / 2;
      nx -= (dx / d) * push;
      ny -= (dy / d) * push;
      other.x += (dx / d) * push;
      other.y += (dy / d) * push;
      if (Math.abs(car.speed) > 180) {
        other.hp -= 1;
        car.hp -= 0.5;
        world.shake = 0.2;
        world.audio.crash();
        if (other.kind === 'traffic') addHeat(world, 0, '');
      }
      car.speed *= 0.82;
    }
  }
  car.x = nx;
  car.y = ny;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  // Running over a pedestrian is a crime.
  for (const ped of world.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - car.x, ped.y - car.y) < 24 && Math.abs(car.speed) > 60) {
      ped.state = 'down';
      ped.downTimer = 12;
      addHeat(world, 1, 'hit a pedestrian');
      scarePeds(world, ped.x, ped.y, 380);
      world.shake = 0.3;
    }
  }
  if (car.hp <= 0 && car.wreck <= 0) {
    // Wrecked: it burns out and ejects the player on foot.
    explodeCar(world, car);
    player.car = null;
    world.traffic.push(car);
    world.events.ejected = true;
    world.shake = 0.5;
    world.audio.crash();
  }
  world.audio.engine(Math.abs(car.speed) / CAR.sportsMax, true);
}

export function stepWorld(world, input, dt) {
  world.events = {};
  world.time += dt;
  const player = world.player;
  if (player.shootTimer > 0) player.shootTimer -= dt;
  if (player.punchTimer > 0) player.punchTimer -= dt;
  if (world.invulnerable > 0) world.invulnerable -= dt;
  if (world.shake > 0) world.shake -= dt;

  const actions = input.takeActions();
  if (actions & ACTION_ENTER) {
    if (player.car) exitCar(world);
    else {
      const car = nearestStealableCar(world);
      if (car) enterCar(world, car);
    }
  }
  if (actions & ACTION_PUNCH && !player.car) playerPunch(world);

  if (player.car) updatePlayerCar(world, dt, input);
  else {
    updatePlayerOnFoot(world, dt, input);
    world.audio.engine(0, false);
    const mouse = input.mouse();
    if (mouse.down && player.hasPistol) {
      // Mouse coordinates are screen space; convert through the camera.
      const wx = world.camera.x - 640 + mouse.x;
      const wy = world.camera.y - 360 + mouse.y;
      playerShoot(world, wx, wy);
    }
  }

  updateTraffic(world, dt);
  updatePeds(world, dt);
  updatePolice(world, dt);
  updateCombat(world, dt);
  updateMissions(world, dt);
  world.audio.update(dt, world.police.heat);

  // Camera follows the player, clamped to the city.
  const targetX = Math.max(640, Math.min(WORLD.width - 640, player.x));
  const targetY = Math.max(360, Math.min(WORLD.height - 360, player.y));
  world.camera.x += (targetX - world.camera.x) * Math.min(1, dt * 6);
  world.camera.y += (targetY - world.camera.y) * Math.min(1, dt * 6);

  let events = 0;
  if (player.hp <= 0) events |= EVENT_WASTED;
  if (world.events.busted) events |= EVENT_BUSTED;
  if (world.events.win) events |= EVENT_WIN;
  return events;
}
