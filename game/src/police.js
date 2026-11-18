// The wanted system and the Meridian PD. Crimes raise heat; heat brings patrol
// cars that chase and ram, and officers on foot who chase and try to arrest
// the player. Lay low and out of sight and the heat cools off, one star at a
// time.

import { HEAT_CRIME_WINDOW, HEAT_DECAY_SECONDS, WANTED_MAX } from './config.js';
import { collideBuildings, nearestRoadPoint, randomRoadPoint } from './city.js';
import { makeTrafficCar } from './traffic.js';

export function createPolice() {
  return {
    heat: 0,
    cars: [],
    officers: [],
    decayTimer: 0,
    lastCrime: -999,
    bustTimer: 0,
  };
}

export function addHeat(world, amount, reason) {
  const police = world.police;
  const before = police.heat;
  police.heat = Math.max(0, Math.min(WANTED_MAX, police.heat + amount));
  police.lastCrime = world.time;
  police.decayTimer = 0;
  if (police.heat > before) world.events.crime = reason || 'crime';
}

function spawnPoliceCar(world) {
  const player = world.player;
  const p = randomRoadPoint(world.rand);
  const dx = p.x - player.x;
  const dy = p.y - player.y;
  const d = Math.hypot(dx, dy);
  // Spawn on a road a good chase away, never on top of the player.
  if (d < 500) {
    p.x = player.x + (dx / (d || 1)) * 700;
    p.y = player.y + (dy / (d || 1)) * 700;
    const near = nearestRoadPoint(p.x, p.y);
    p.x = near.x;
    p.y = near.y;
    p.vertical = near.vertical;
  }
  const car = makeTrafficCar(world.city, world.rand, p.x, p.y, p.vertical, 1);
  car.kind = 'police';
  car.color = '#2b5cff';
  car.maxSpeed = 300 + world.police.heat * 32;
  car.hp = 6;
  world.police.cars.push(car);
}

function spawnOfficer(world) {
  const player = world.player;
  const p = nearestRoadPoint(player.x + (world.rand() - 0.5) * 700, player.y + (world.rand() - 0.5) * 700);
  world.police.officers.push({
    x: p.x,
    y: p.y,
    angle: 0,
    speed: 165,
    hp: 4,
    punchTimer: 0,
    state: 'chase',
  });
}

export function updatePolice(world, dt) {
  const police = world.police;
  const player = world.player;

  const wantCars = Math.min(4, police.heat);
  while (police.cars.length < wantCars) spawnPoliceCar(world);
  while (police.cars.length > wantCars) police.cars.pop();
  const wantOfficers = police.heat >= 2 && !player.car ? Math.min(2, police.heat - 1) : 0;
  while (police.officers.length < wantOfficers) spawnOfficer(world);
  while (police.officers.length > wantOfficers) police.officers.pop();

  // Patrol cars chase the player and ram.
  for (const car of police.cars) {
    if (car.wreck > 0) {
      car.wreck -= dt;
      continue;
    }
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-2.4, Math.min(2.4, diff * 2.2));
    car.angle += steer * dt * Math.min(1, Math.abs(car.speed) / 120 + 0.35);
    const target = dist > 120 ? car.maxSpeed : car.maxSpeed * 0.7;
    car.speed += Math.max(-300 * dt, Math.min(240 * dt, target - car.speed));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Police still have to go around buildings.
    const fixed = collideBuildings(car.x, car.y, 20, world.city.buildings);
    if (fixed.hit) {
      car.x = fixed.x;
      car.y = fixed.y;
      car.speed *= 0.5;
    }
    // Ramming the player hurts — but a patrol car stops short of running a
    // pedestrian over; officers on foot do the arresting.
    if (dist < 46) {
      car.x = player.x - (dx / dist) * 52;
      car.y = player.y - (dy / dist) * 52;
      car.speed *= 0.5;
      if (player.car) {
        player.car.hp -= 2.5 * dt;
        player.car.speed *= 0.94;
        world.events.crash = true;
      }
    }
  }

  // Officers on foot chase and try to arrest.
  let nearestOfficer = Infinity;
  for (const officer of police.officers) {
    const dx = player.x - officer.x;
    const dy = player.y - officer.y;
    const dist = Math.hypot(dx, dy) || 1;
    nearestOfficer = Math.min(nearestOfficer, dist);
    officer.angle = Math.atan2(dy, dx);
    if (dist > 30) {
      officer.x += (dx / dist) * officer.speed * dt;
      officer.y += (dy / dist) * officer.speed * dt;
    } else {
      officer.punchTimer -= dt;
      if (officer.punchTimer <= 0 && world.invulnerable <= 0) {
        officer.punchTimer = 0.8;
        player.hp -= 6;
        world.invulnerable = 0.3;
        world.events.crash = true;
      }
    }
  }

  // Busted: an officer stands on the player long enough while on foot.
  if (!player.car && police.heat > 0 && nearestOfficer < 30) {
    police.bustTimer += dt;
    if (police.bustTimer > 1.4) world.events.busted = true;
  } else {
    police.bustTimer = Math.max(0, police.bustTimer - dt * 2);
  }

  // Heat cools off when the law cannot see the player and no crime is fresh.
  const anyNear = police.cars.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 480)
    || police.officers.some((o) => Math.hypot(o.x - player.x, o.y - player.y) < 320);
  if (police.heat > 0 && !anyNear && world.time - police.lastCrime > HEAT_CRIME_WINDOW) {
    police.decayTimer += dt;
    if (police.decayTimer >= HEAT_DECAY_SECONDS) {
      police.decayTimer = 0;
      police.heat -= 1;
    }
  } else {
    police.decayTimer = 0;
  }
}
