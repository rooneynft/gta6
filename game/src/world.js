// The world: one state object and one step function. Every subsystem
// (missions, police, combat, traffic) reads and writes this state, and the
// renderer only draws it, so the game can be stepped without a GPU.

import { CAR, ECONOMY, PLAYER, ROADS_X, ROADS_Z, SPOTS } from './config.js';
import { buildCity, collideBuildings } from './city.js';
import { makeRandom, pick, range } from './random.js';
import { makeCar, spawnTraffic, stepPlayerCar, stepTrafficCar } from './vehicles.js';
import { addHeat, setWanted, stepHelicopter, stepPolice, stepWanted } from './police.js';
import { spawnRivals, stepCombat } from './combat.js';
import { enterCar, exitCar, nearestStealableCar, stepPlayerOnFoot } from './player.js';
import { startMission, stepMission } from './missions.js';
import { saveGame } from './save.js';

export function createWorld(audio, seed) {
  const rand = makeRandom(seed || 7);
  const city = buildCity(rand);
  const world = {
    rand, city, audio,
    elapsed: 0, clockMinutes: 9 * 60, cameraYaw: 0,
    screen: 'title', attract: false, storyDone: false,
    player: {
      x: SPOTS.garage.x, z: SPOTS.garage.z + 6, angle: 0,
      hp: PLAYER.maxHp, armor: 0, cash: ECONOMY.startCash,
      hasPistol: false, ammo: 0, car: null, moving: false,
      walkPhase: 0, shotCooldown: 0, punchCooldown: 0, radius: PLAYER.radius,
    },
    cars: [], peds: [], police: [], rivals: [],
    pickups: city.pickups.map((p) => ({ ...p, taken: false })),
    heli: { active: false, x: 0, z: 0, y: 60, rotor: 0, angle: 0, targetY: 42 },
    wanted: 0, wantedIdle: 0, wantedCooldown: 0,
    mission: null, banner: null, tracer: null, shopBought: null,
    shopOpen: false, nearShop: false, nearCar: null, wasted: false,
    wastedCause: '', saveSoon: false, autosaveTimer: 0,
    stats: { carsStolen: 0, shotsFired: 0 },
  };

  // Parked cars from the city plan, plus the gold Comet GT downtown.
  for (const spot of city.parkedSpots) {
    const car = makeCar(spot.type, spot.x, spot.z, spot.angle);
    world.cars.push(car);
  }
  spawnTraffic(world, 14);
  spawnPeds(world, 24);

  // Helpers the subsystems call back into.
  world.setWanted = (stars, reason) => setWanted(world, stars, reason);
  world.addHeat = (stars, reason) => addHeat(world, stars, reason);
  world.spawnRivals = (spot, count) => spawnRivals(world, spot, count);
  world.spawnCar = (type, x, z, angle) => {
    const car = makeCar(type, x, z, angle);
    world.cars.push(car);
    return car;
  };
  world.removeCar = (car) => {
    const i = world.cars.indexOf(car);
    if (i >= 0) world.cars.splice(i, 1);
  };
  world.roadSpawnNear = (x, z, dist) => {
    for (let tries = 0; tries < 8; tries += 1) {
      const vertical = world.rand() < 0.5;
      const road = vertical ? pick(world.rand, ROADS_X) : pick(world.rand, ROADS_Z);
      const along = range(world.rand, -200, 200);
      const px = vertical ? road : along;
      const pz = vertical ? along : road;
      if (Math.hypot(px - x, pz - z) > dist * 0.6 && Math.hypot(px - x, pz - z) < dist * 1.6) {
        return { x: px, z: pz, angle: Math.atan2(x - px, z - pz) };
      }
    }
    return { x: x + dist, z, angle: Math.PI };
  };
  world.collideBody = (body) => {
    collideBuildings(world.city, body);
    body.x = Math.max(-276, Math.min(276, body.x));
    body.z = Math.max(-216, Math.min(216, body.z));
  };
  world.collideCar = (car) => {
    const before = { x: car.x, z: car.z };
    car.radius = CAR.radius;
    collideBuildings(world.city, car);
    car.x = Math.max(-276, Math.min(276, car.x));
    car.z = Math.max(-216, Math.min(216, car.z));
    for (const other of world.cars) {
      if (other === car || other.dead) continue;
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 4.4) {
        const push = (4.4 - d) / 2;
        car.x += (dx / d) * push;
        car.z += (dz / d) * push;
        other.x -= (dx / d) * push;
        other.z -= (dz / d) * push;
      }
    }
    return Math.hypot(car.x - before.x, car.z - before.z) > 0.01;
  };
  world.damagePlayer = (amount, cause) => {
    const p = world.player;
    if (p.hp <= 0) return;
    let left = amount;
    if (p.armor > 0) {
      const soaked = Math.min(p.armor, left * 0.5);
      p.armor -= soaked;
      left -= soaked;
    }
    p.hp -= left;
    if (p.hp <= 0) {
      p.hp = 0;
      world.wasted = true;
      world.wastedCause = cause || 'wasted';
    }
  };
  world.damageCar = (car, amount) => {
    if (car.dead) return;
    car.hp -= amount;
    if (car.hp <= 0) {
      car.hp = 0;
      car.dead = true;
      car.speed = 0;
      world.audio.crash();
      if (car.isPlayerCar) {
        world.banner = { text: 'Your car is wrecked', sub: 'Get out and find another ride', kind: 'bad', until: world.elapsed + 3 };
        world.damagePlayer(25, 'car explosion');
        exitCar(world);
      }
    }
  };

  return world;
}

function spawnPeds(world, count) {
  for (let i = 0; i < count; i += 1) {
    const vertical = world.rand() < 0.5;
    const road = vertical ? pick(world.rand, ROADS_X) : pick(world.rand, ROADS_Z);
    const along = range(world.rand, -200, 200);
    world.peds.push({
      x: vertical ? road + (world.rand() < 0.5 ? -9 : 9) : along,
      z: vertical ? along : road + (world.rand() < 0.5 ? -9 : 9),
      angle: world.rand() * Math.PI * 2, speed: range(world.rand, 1.2, 2.4),
      hp: 30, isPed: true, mesh: null, target: null, walkPhase: world.rand() * 6,
    });
  }
}

function stepPeds(world, dt) {
  for (const ped of world.peds) {
    if (ped.hp <= 0) continue;
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 3) {
      const vertical = world.rand() < 0.5;
      const road = vertical ? pick(world.rand, ROADS_X) : pick(world.rand, ROADS_Z);
      ped.target = {
        x: vertical ? road + (world.rand() < 0.5 ? -9 : 9) : range(world.rand, -200, 200),
        z: vertical ? range(world.rand, -200, 200) : road + (world.rand() < 0.5 ? -9 : 9),
      };
    }
    const dx = ped.target.x - ped.x;
    const dz = ped.target.z - ped.z;
    const d = Math.hypot(dx, dz) || 1;
    ped.angle = Math.atan2(dx, dz);
    ped.x += (dx / d) * ped.speed * dt;
    ped.z += (dz / d) * ped.speed * dt;
    ped.walkPhase += dt * ped.speed * 2;
    world.collideBody(ped);
  }
  // The dead leave and fresh faces arrive, so the streets stay alive.
  world.peds = world.peds.filter((p) => p.hp > 0);
  while (world.peds.length < 20) {
    const before = world.peds.length;
    spawnPeds(world, 1);
    if (world.peds.length === before) break;
  }
}

/** The title screen's living backdrop: traffic and pedestrians only. */
export function stepAttract(world, dt) {
  world.elapsed += dt;
  world.clockMinutes += dt;
  for (const car of world.cars) stepTrafficCar(world, car, dt);
  stepPeds(world, dt);
  world.cameraYaw += dt * 0.05;
}

/** One frame of the real game. */
export function stepWorld(world, input, dt, camera, canvas) {
  world.elapsed += dt;
  world.clockMinutes += dt;
  const p = world.player;

  if (input.wasPressed('radio')) {
    const station = world.audio.cycleStation();
    world.banner = { text: station.name, sub: station.genre, kind: '', until: world.elapsed + 2 };
  }
  if (input.wasPressed('mute')) world.audio.toggleMute();

  // The E key: enter or leave a car, or open the shop at its door.
  if (input.wasPressed('action')) {
    if (world.shopOpen) {
      world.shopOpen = false;
    } else if (p.car) {
      exitCar(world);
    } else if (world.nearShop) {
      world.shopOpen = true;
      world.audio.pickup();
    } else {
      const car = nearestStealableCar(world, 4);
      if (car) {
        enterCar(world, car);
        world.stats.carsStolen += 1;
      }
    }
  }

  if (p.car) {
    stepPlayerCar(world, p.car, input, dt);
    p.x = p.car.x;
    p.z = p.car.z;
    p.angle = p.car.angle;
    p.speed = p.car.speed;
  } else {
    stepPlayerOnFoot(world, input, dt);
    p.speed = p.moving ? (input.held('run') ? 9.5 : 6) : 0;
  }

  // What is nearby, for the context prompt.
  world.nearCar = p.car ? null : nearestStealableCar(world, 4);
  world.nearShop = !p.car && Math.hypot(p.x - SPOTS.shop.x, p.z - SPOTS.shop.z) < 6;

  for (const car of world.cars) stepTrafficCar(world, car, dt);
  stepPeds(world, dt);
  stepPolice(world, dt);
  stepHelicopter(world, dt);
  stepWanted(world, dt);
  stepCombat(world, input, dt, camera, canvas);
  stepMission(world, input, dt);

  // Camera yaw follows the player or their car, smoothed.
  const targetYaw = p.angle;
  let diff = targetYaw - world.cameraYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  world.cameraYaw += diff * Math.min(1, dt * (p.car ? 2.2 : 4));

  // The siren only wails while the heat is on.
  world.audio.siren(world.wanted > 0);

  if (world.saveSoon || (world.autosaveTimer += dt) > 30) {
    world.autosaveTimer = 0;
    world.saveSoon = false;
    saveGame(world);
  }
}
