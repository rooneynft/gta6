// Traffic and pedestrians: the city's background life. Traffic cars drive the
// road grid in lanes, slow for the car ahead and turn at intersections.
// Pedestrians stroll the sidewalks and run when they hear a gunshot or a car
// bears down on them.

import { CAR_COLORS } from './config.js';
import { ROADS_H, ROADS_V, ROAD_W, WORLD, nearestRoadPoint, randomRoadPoint } from './city.js';
import { pick, range } from './random.js';

export function makeTrafficCar(city, random, x, y, vertical, dir) {
  return {
    kind: 'traffic',
    x,
    y,
    angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI,
    speed: range(random, 70, 130),
    maxSpeed: range(random, 90, 150),
    vertical,
    dir,
    color: pick(random, CAR_COLORS),
    hp: 3,
    wreck: 0,
    turnCooldown: range(random, 1, 4),
    brake: 0,
  };
}

export function spawnTraffic(city, random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(random);
    const lane = (ROAD_W / 2 - 16) * (random() < 0.5 ? -1 : 1);
    const x = p.vertical ? p.x + (p.vertical ? lane : 0) : p.x;
    const y = p.vertical ? p.y : p.y + lane;
    cars.push(makeTrafficCar(city, random, x, y, p.vertical, random() < 0.5 ? 1 : -1));
  }
  return cars;
}

function carAhead(cars, self, dist) {
  const fx = Math.cos(self.angle);
  const fy = Math.sin(self.angle);
  let best = Infinity;
  for (const other of cars) {
    if (other === self || other.wreck > 0) continue;
    const dx = other.x - self.x;
    const dy = other.y - self.y;
    const along = dx * fx + dy * fy;
    const side = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < dist && side < 26 && along < best) best = along;
  }
  return best;
}

export function updateTraffic(world, dt) {
  const cars = world.traffic;
  for (const car of cars) {
    if (car.wreck > 0) {
      car.wreck -= dt;
      continue;
    }
    car.turnCooldown -= dt;
    const ahead = carAhead(cars, car, 90);
    const target = ahead < 70 ? Math.max(0, (ahead - 46) * 1.6) : car.maxSpeed;
    car.speed += Math.max(-260 * dt, Math.min(120 * dt, target - car.speed));
    const step = car.speed * dt;
    let nx = car.x + Math.cos(car.angle) * step;
    let ny = car.y + Math.sin(car.angle) * step;
    // At an intersection, sometimes turn onto the crossing road.
    const nearV = ROADS_V.find((rx) => Math.abs(nx - rx) < 26);
    const nearH = ROADS_H.find((ry) => Math.abs(ny - ry) < 26);
    if (car.speed > 5 && car.turnCooldown <= 0 && nearV !== undefined && nearH !== undefined && world.rand() < 0.35) {
      car.vertical = !car.vertical;
      car.dir = world.rand() < 0.5 ? 1 : -1;
      car.angle = car.vertical ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI;
      car.turnCooldown = range(world.rand, 2, 6);
      nx = car.vertical ? nearV + (car.dir > 0 ? 22 : -22) : nx;
      ny = car.vertical ? ny : nearH + (car.dir > 0 ? 22 : -22);
    }
    // Keep on the road: a moving car that drifted off the grid steers back.
    if (car.speed > 5 && (nx < 60 || nx > WORLD.width - 60 || ny < 60 || ny > WORLD.height - 60)) {
      const p = nearestRoadPoint(nx, ny);
      car.x = p.x;
      car.y = p.y;
      car.vertical = p.vertical;
      car.angle = p.vertical ? Math.PI / 2 : 0;
      car.dir = 1;
      continue;
    }
    car.x = nx;
    car.y = ny;
    if (car.x < 40) car.x = 40;
    if (car.x > WORLD.width - 40) car.x = WORLD.width - 40;
    if (car.y < 40) car.y = 40;
    if (car.y > WORLD.height - 40) car.y = WORLD.height - 40;
  }
}

export function makePed(city, random, x, y) {
  return {
    x,
    y,
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, 26, 48),
    target: null,
    state: 'walk',
    fleeTimer: 0,
    downTimer: 0,
    color: pick(random, ['#f1fa8c', '#ff9f1c', '#a7c957', '#e07a5f', '#8ecae6', '#f28482', '#b5179e', '#4cc9f0']),
    panic: 0,
  };
}

export function spawnPeds(city, random, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(random);
    const off = (ROAD_W / 2 + 16) * (random() < 0.5 ? -1 : 1);
    peds.push(makePed(city, random, p.vertical ? p.x + off : p.x, p.vertical ? p.y : p.y + off));
  }
  return peds;
}

function pedTarget(ped, world) {
  const p = randomRoadPoint(world.rand);
  const off = (ROAD_W / 2 + 16) * (world.rand() < 0.5 ? -1 : 1);
  return { x: p.vertical ? p.x + off : p.x, y: p.vertical ? p.y : p.y + off };
}

export function scarePeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5 + world.rand() * 2;
      ped.panic = 1;
    }
  }
}

export function updatePeds(world, dt) {
  const player = world.player;
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        const p = randomRoadPoint(world.rand);
        const off = (ROAD_W / 2 + 16) * (world.rand() < 0.5 ? -1 : 1);
        ped.x = p.vertical ? p.x + off : p.x;
        ped.y = p.vertical ? p.y : p.y + off;
        ped.state = 'walk';
        ped.target = null;
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const dx = ped.x - player.x;
      const dy = ped.y - player.y;
      const d = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy / d, dx / d);
      const speed = 150;
      ped.x += Math.cos(ped.angle) * speed * dt;
      ped.y += Math.sin(ped.angle) * speed * dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      continue;
    }
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 24) {
      ped.target = pedTarget(ped, world);
    }
    const dx = ped.target.x - ped.x;
    const dy = ped.target.y - ped.y;
    const d = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / d) * ped.speed * dt;
    ped.y += (dy / d) * ped.speed * dt;
    // A fast car bearing down makes them run.
    if (player.car) {
      const cd = Math.hypot(ped.x - player.car.x, ped.y - player.car.y);
      if (cd < 90 && Math.abs(player.car.speed) > 200) {
        ped.state = 'flee';
        ped.fleeTimer = 2;
      }
    }
  }
}
