// The player on foot: camera-relative walking and running, and getting
// into and out of cars. Movement is relative to where the camera looks,
// so W always walks away from the screen.

import { PLAYER } from './config.js';
import { angleDiff, clamp, distance } from './random.js';

export function stepPlayerOnFoot(world, input, dt) {
  const p = world.player;
  const move = input.move();
  const yaw = world.cameraYaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -fz;
  const rz = fx;
  const mx = fx * -move.y + rx * move.x;
  const mz = fz * -move.y + rz * move.x;
  const speed = input.held('run') ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (move.active) {
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    const want = Math.atan2(mx, mz);
    p.angle += angleDiff(p.angle, want) * Math.min(1, dt * 12);
    p.moving = true;
    p.walkPhase = (p.walkPhase || 0) + dt * speed * 1.6;
  } else {
    p.moving = false;
  }
  p.x = clamp(p.x, -276, 276);
  p.z = clamp(p.z, -216, 216);
  world.collideBody(p);
  // Bump into pedestrians: they step aside, the player slows a touch.
  for (const ped of world.peds) {
    if (distance(p.x, p.z, ped.x, ped.z) < 1.2) {
      ped.x += (ped.x - p.x) * 0.4;
      ped.z += (ped.z - p.z) * 0.4;
    }
  }
}

/** The nearest stealable car, or null. Police cruisers cannot be stolen. */
export function nearestStealableCar(world, range) {
  let best = null;
  let bestD = range;
  for (const car of world.cars) {
    if (car.isPolice || car.dead) continue;
    const d = distance(world.player.x, world.player.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(world, car) {
  const p = world.player;
  p.car = car;
  car.isPlayerCar = true;
  car.isTraffic = false;
  p.x = car.x;
  p.z = car.z;
  p.angle = car.angle;
  world.addHeat(1, 'grand theft auto');
  world.audio.horn();
  world.banner = { text: car.name, sub: 'WASD to drive — Space is the handbrake', kind: '', until: world.elapsed + 3 };
}

export function exitCar(world) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  car.isPlayerCar = false;
  car.speed = 0;
  p.car = null;
  p.x = car.x - Math.sin(car.angle + Math.PI / 2) * 2.5;
  p.z = car.z - Math.cos(car.angle + Math.PI / 2) * 2.5;
  p.angle = car.angle;
}
