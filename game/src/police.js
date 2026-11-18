// The wanted system: crimes raise stars, the Meridian PD answers with
// patrol cars and officers, and at three stars a police helicopter joins
// the chase. Lay low and the heat cools off — unless the helicopter is
// watching.

import { WANTED } from './config.js';
import { clamp, distance } from './random.js';

export function setWanted(world, stars, reason) {
  const before = world.wanted;
  world.wanted = clamp(stars, 0, WANTED.maxStars);
  world.wantedIdle = 0;
  if (world.wanted > before && world.wanted > 0) {
    world.audio.siren(true);
    if (reason) {
      world.banner = {
        text: `Wanted: ${'★'.repeat(world.wanted)}${'☆'.repeat(5 - world.wanted)}`,
        sub: reason, kind: 'bad', until: world.elapsed + 3,
      };
    }
  }
  if (world.wanted === 0) world.audio.siren(false);
}

export function addHeat(world, stars, reason) {
  setWanted(world, world.wanted + stars, reason);
}

/** Cool the wanted level down when the player has been quiet and unseen. */
export function stepWanted(world, dt) {
  if (world.wanted <= 0) return;
  const nearPolice = world.police.some((c) => distance(c.x, c.z, world.player.x, world.player.z) < 45)
    || (world.heli.active && world.heli.y < 60);
  if (nearPolice) {
    world.wantedIdle = 0;
    return;
  }
  world.wantedIdle += dt;
  if (world.wantedIdle > WANTED.decayIdleSeconds) {
    world.wantedCooldown = (world.wantedCooldown || 0) + dt;
    if (world.wantedCooldown > WANTED.decayStepSeconds) {
      world.wantedCooldown = 0;
      world.wantedIdle = WANTED.decayIdleSeconds;
      setWanted(world, world.wanted - 1, null);
      if (world.wanted === 0) {
        world.banner = { text: 'You lost the cops', sub: 'The heat is off', kind: 'good', until: world.elapsed + 3 };
      }
    }
  }
}

/** Spawn and steer police cars and foot officers toward the player. */
export function stepPolice(world, dt) {
  const p = world.player;
  const wantCars = Math.min(world.wanted * WANTED.policeCarsPerStar, 5);
  const cars = world.police.filter((c) => c.isPolice);
  const officers = world.police.filter((c) => !c.isPolice);

  while (cars.length < wantCars) {
    const spawn = world.roadSpawnNear(p.x, p.z, 70 + world.rand() * 40);
    const car = world.spawnCar('police', spawn.x, spawn.z, spawn.angle, true);
    car.isPolice = true;
    car.hp = 120;
    world.police.push(car);
    cars.push(car);
  }
  while (cars.length > wantCars) {
    const extra = cars.pop();
    world.removeCar(extra);
    world.police.splice(world.police.indexOf(extra), 1);
  }

  // Officers only chase a player on foot, and only up to two at a time.
  if (world.wanted > 0 && !p.car && officers.length < 2) {
    const spawn = world.roadSpawnNear(p.x, p.z, 25 + world.rand() * 15);
    world.police.push({
      inCar: false, x: spawn.x, z: spawn.z, angle: 0, speed: 0,
      hp: 50, punchCooldown: 0, mesh: null,
    });
    officers.push(world.police[world.police.length - 1]);
  }

  for (const cop of [...world.police]) {
    if (cop.isPolice) {
      chaseCar(world, cop, dt);
    } else {
      chaseOfficer(world, cop, dt);
    }
    if (cop.hp <= 0) {
      world.police.splice(world.police.indexOf(cop), 1);
      if (cop.isPolice) world.removeCar(cop);
    }
  }
}

function chaseCar(world, car, dt) {
  const p = world.player;
  const target = p.car || p;
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  const want = Math.atan2(dx, dz);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff * 3 * dt));
  const top = car.type === 'police' ? 30 : 26;
  car.speed = Math.min(top, car.speed + 18 * dt);
  if (Math.abs(diff) > 1.2) car.speed = Math.max(8, car.speed - 20 * dt);
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  world.collideCar(car, dt);
  // Ram the player: damage their car, or the player on foot.
  if (dist < 4.2) {
    if (p.car) {
      world.damageCar(p.car, 14 * dt * 4, 'police ram');
      car.speed *= 0.5;
    } else if (dist < 2.4) {
      world.damagePlayer(8 * dt * 4, 'arrested by the PD');
    }
  }
}

function chaseOfficer(world, cop, dt) {
  const p = world.player;
  const dx = p.x - cop.x;
  const dz = p.z - cop.z;
  const dist = Math.hypot(dx, dz) || 1;
  cop.angle = Math.atan2(dx, dz);
  const speed = 6.5;
  cop.x += (dx / dist) * speed * dt;
  cop.z += (dz / dist) * speed * dt;
  cop.punchCooldown -= dt;
  if (dist < 2 && cop.punchCooldown <= 0) {
    cop.punchCooldown = 1;
    world.damagePlayer(8, 'beaten by an officer');
  }
}

/** The police helicopter: appears at three stars and shadows the player. */
export function stepHelicopter(world, dt) {
  const heli = world.heli;
  const p = world.player;
  if (world.wanted >= WANTED.heliAtStars) {
    heli.active = true;
    heli.targetY = 42;
  } else if (world.wanted === 0) {
    heli.active = false;
  }
  if (!heli.active) return;
  // The helicopter hangs ahead of the player, in view, instead of straight
  // overhead where the camera never sees it.
  const ahead = p.car ? 30 : 12;
  const tx = p.x + Math.sin(p.angle) * ahead;
  const tz = p.z + Math.cos(p.angle) * ahead;
  heli.x += (tx - heli.x) * Math.min(1, dt * 0.8);
  heli.z += (tz - heli.z) * Math.min(1, dt * 0.8);
  heli.y += ((heli.targetY || 42) - heli.y) * Math.min(1, dt * 1.2);
  heli.rotor += dt * 22;
  heli.angle += dt * 0.15;
}
