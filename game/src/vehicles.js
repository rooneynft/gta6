// Vehicles: the traffic that fills the roads, the cars the player can
// steal, and the car physics both share. Traffic drives the road grid;
// the player's car answers the keys.

import { CAR, CAR_TYPES, ROADS_X, ROADS_Z } from './config.js';
import { nearestRoadX, nearestRoadZ } from './city.js';
import { angleDiff, pick, range } from './random.js';

export function makeCar(type, x, z, angle) {
  const spec = CAR_TYPES[type];
  return {
    type, x, z, angle, speed: 0, hp: CAR.maxHp,
    maxSpeed: spec.maxSpeed, color: spec.color, name: spec.name,
    isPolice: false, isPlayerCar: false, mesh: null, wheels: [],
    dead: false, honkCooldown: 0,
  };
}

/** Spawn the morning traffic: cars cruising the road grid. */
export function spawnTraffic(world, count) {
  for (let i = 0; i < count; i += 1) {
    const vertical = world.rand() < 0.5;
    const road = vertical
      ? pick(world.rand, ROADS_X) : pick(world.rand, ROADS_Z);
    const along = range(world.rand, -200, 200);
    const type = pick(world.rand, ['sedan', 'sedan', 'taxi', 'van']);
    const car = makeCar(type, vertical ? road : along, vertical ? along : road,
      vertical ? (world.rand() < 0.5 ? 0 : Math.PI) : (world.rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
    car.speed = range(world.rand, 7, 12);
    car.vertical = vertical;
    car.lane = world.rand() < 0.5 ? -3.5 : 3.5;
    car.isTraffic = true;
    world.cars.push(car);
  }
}

/** One traffic car, one frame: follow its road, turn at crossings. */
export function stepTrafficCar(world, car, dt) {
  // Parked cars, police cruisers and the player's car are not traffic.
  if (!car.isTraffic) return;
  const onRoadX = ROADS_X.some((rx) => Math.abs(car.x - rx) < 9);
  const onRoadZ = ROADS_Z.some((rz) => Math.abs(car.z - rz) < 9);
  const atCrossing = onRoadX && onRoadZ;
  if (atCrossing && world.rand() < dt * 0.35) {
    car.vertical = !car.vertical;
    car.angle = car.vertical
      ? (world.rand() < 0.5 ? 0 : Math.PI)
      : (world.rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Steer back onto the lane centre of the current road.
  const laneX = car.vertical ? nearestRoadX(car.x) + car.lane : car.x;
  const laneZ = car.vertical ? car.z : nearestRoadZ(car.z) + car.lane;
  const want = Math.atan2(laneX - car.x, laneZ - car.z);
  const diff = angleDiff(car.angle, want);
  car.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff * 4 * dt));
  car.speed += (10 - car.speed) * Math.min(1, dt);
  // Slow for the car ahead.
  for (const other of world.cars) {
    if (other === car || other.isPlayerCar) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
    const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
    if (ahead > 0 && ahead < 9 && side < 3.5) car.speed = Math.min(car.speed, 3);
  }
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  // Wrap around the far edge so the streets never empty out.
  if (car.x < -272 || car.x > 272 || car.z < -212 || car.z > 212) {
    const vertical = world.rand() < 0.5;
    const road = vertical ? pick(world.rand, ROADS_X) : pick(world.rand, ROADS_Z);
    const along = -200;
    car.x = vertical ? road : along;
    car.z = vertical ? along : road;
    car.vertical = vertical;
    car.angle = vertical ? 0 : Math.PI / 2;
  }
  world.collideCar(car, dt);
}

/** The player's car: acceleration, steering, handbrake, collisions. */
export function stepPlayerCar(world, car, input, dt) {
  const move = input.move();
  const forward = move.y < 0 ? 1 : move.y > 0 ? -0.6 : 0;
  const steering = move.x;
  if (forward > 0) car.speed += CAR.accel * dt;
  else if (forward < 0) car.speed -= CAR.brake * dt;
  else car.speed -= Math.sign(car.speed) * CAR.drag * 6 * dt;
  if (input.held('handbrake')) car.speed *= Math.max(0, 1 - 3.5 * dt);
  if (Math.abs(car.speed) < 0.2 && forward === 0) car.speed = 0;
  const top = forward < 0 ? CAR.reverseMax : car.maxSpeed;
  car.speed = Math.max(-top, Math.min(top, car.speed));
  const steerAmount = steering * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 6);
  // Turning right (D) swings the nose toward screen-right, which is a
  // decreasing angle in this facing convention.
  car.angle -= steerAmount * (car.speed >= 0 ? 1 : -1);
  const beforeX = car.x;
  const beforeZ = car.z;
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  const hit = world.collideCar(car, dt);
  if (hit && Math.abs(car.speed) > 8) {
    world.damageCar(car, Math.abs(car.speed) * 0.9, 'crash');
    world.audio.crash();
    car.speed *= 0.35;
  }
  // Running over a pedestrian is a crime, and it costs the victim.
  for (const ped of world.peds) {
    if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.6 && Math.abs(car.speed) > 4) {
      ped.hp = 0;
      world.addHeat(1, 'hit and run');
      world.audio.crash();
    }
  }
  // Keep the player inside the city.
  car.x = Math.max(-276, Math.min(276, car.x));
  car.z = Math.max(-216, Math.min(216, car.z));
  return { moved: Math.hypot(car.x - beforeX, car.z - beforeZ) };
}
