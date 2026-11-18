// Combat on foot: the pistol (mouse aim, hitscan), punching, rivals who
// shoot back, and the cash and health pickups scattered around the city.

import { COMBAT, ECONOMY, PLAYER } from './config.js';
import { distance } from './random.js';

export function spawnRivals(world, spot, count) {
  for (let i = 0; i < count; i += 1) {
    world.rivals.push({
      x: spot.x + (world.rand() - 0.5) * 24,
      z: spot.z + (world.rand() - 0.5) * 24,
      angle: 0, hp: COMBAT.rivalHp, alive: true,
      shotCooldown: 1 + world.rand(), mesh: null, moveTarget: null,
    });
  }
}

/** Aim with the mouse: project the cursor onto the ground plane. */
export function aimPoint(world, mouse, camera, canvas) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((mouse.x - rect.left) / rect.width) * 2 - 1;
  const ny = -(((mouse.y - rect.top) / rect.height) * 2 - 1);
  const px = world.player.x;
  const pz = world.player.z;
  // The camera sits behind and above the player; approximate the ground
  // point under the cursor from the screen offset and the camera yaw.
  const yaw = world.cameraYaw || 0;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const dist = 14;
  return {
    x: px + forwardX * dist * (0.4 - ny * 0.6) + rightX * nx * 16,
    z: pz + forwardZ * dist * (0.4 - ny * 0.6) + rightZ * nx * 16,
  };
}

export function stepCombat(world, input, dt, camera, canvas) {
  const p = world.player;
  p.shotCooldown = Math.max(0, (p.shotCooldown || 0) - dt);
  p.punchCooldown = Math.max(0, (p.punchCooldown || 0) - dt);

  // Aim and fire the pistol.
  if (!p.car && p.hasPistol && input.mouse.down && p.shotCooldown <= 0) {
    if (p.ammo > 0) {
      p.ammo -= 1;
      p.shotCooldown = COMBAT.pistolCooldown;
      world.audio.shot();
      firePistol(world, input, camera, canvas);
    } else {
      p.shotCooldown = 0.3;
      world.banner = { text: 'Out of ammo', sub: 'Buy more at Vice Supplies', kind: 'bad', until: world.elapsed + 2 };
    }
  }

  // Punch: the nearest rival, officer or pedestrian in reach.
  if (!p.car && input.wasPressed('punch') && p.punchCooldown <= 0) {
    p.punchCooldown = PLAYER.punchCooldown;
    const target = nearestEnemy(world, p.x, p.z, PLAYER.punchRange);
    if (target) {
      target.hp -= PLAYER.punchDamage;
      if (target.hp <= 0 && target.alive !== undefined) target.alive = false;
      if (target.hp <= 0) world.addHeat(1, 'assault');
    }
  }

  // Rivals: strafe toward the player and shoot.
  for (const rival of world.rivals) {
    if (!rival.alive) continue;
    const d = distance(rival.x, rival.z, p.x, p.z);
    rival.angle = Math.atan2(p.x - rival.x, p.z - rival.z);
    rival.shotCooldown -= dt;
    if (d > 12) {
      rival.x += Math.sin(rival.angle) * 4.5 * dt;
      rival.z += Math.cos(rival.angle) * 4.5 * dt;
    } else if (d < 7) {
      rival.x -= Math.sin(rival.angle) * 2 * dt;
      rival.z -= Math.cos(rival.angle) * 2 * dt;
    }
    if (d < COMBAT.rivalRange && rival.shotCooldown <= 0) {
      rival.shotCooldown = COMBAT.rivalShotCooldown;
      world.audio.shot();
      world.damagePlayer(COMBAT.rivalDamage, 'shot by a Harbor King');
      world.tracer = { from: { x: rival.x, z: rival.z }, to: { x: p.x, z: p.z }, until: world.elapsed + 0.08 };
    }
    if (rival.hp <= 0) {
      rival.alive = false;
      world.player.cash += 40;
      world.audio.cash();
    }
  }
  world.rivals = world.rivals.filter((r) => r.alive || world.elapsed - (r.diedAt || 0) < 1);
  for (const r of world.rivals) if (!r.alive && !r.diedAt) r.diedAt = world.elapsed;

  // Pickups: cash and health, collected by walking over them.
  for (const pickup of world.pickups) {
    if (pickup.taken) continue;
    if (distance(p.x, p.z, pickup.x, pickup.z) < 2.4
      || (p.car && distance(p.car.x, p.car.z, pickup.x, pickup.z) < 3)) {
      pickup.taken = true;
      if (pickup.kind === 'cash') {
        p.cash += ECONOMY.pickupCash;
        world.audio.cash();
      } else {
        p.hp = Math.min(p.hp + 40, PLAYER.maxHp);
        world.audio.pickup();
      }
    }
  }
}

function nearestEnemy(world, x, z, range) {
  let best = null;
  let bestD = range;
  const all = [...world.rivals.filter((r) => r.alive), ...world.police.filter((c) => !c.isPolice), ...world.peds];
  for (const e of all) {
    const d = distance(x, z, e.x, e.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function firePistol(world, input, camera, canvas) {
  const p = world.player;
  // The screenshot autopilot aims straight at its target; a human aims
  // with the mouse.
  const aim = world.autoAim || aimPoint(world, input.mouse, camera, canvas);
  p.angle = Math.atan2(aim.x - p.x, aim.z - p.z);
  world.tracer = { from: { x: p.x, z: p.z }, to: aim, until: world.elapsed + 0.08 };
  world.addHeat(0, null);
  // Hit the nearest rival, officer or pedestrian near the aim line.
  let best = null;
  let bestD = COMBAT.pistolRange;
  const targets = [...world.rivals.filter((r) => r.alive), ...world.police.filter((c) => !c.isPolice), ...world.peds];
  for (const t of targets) {
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const along = dx * Math.sin(p.angle) + dz * Math.cos(p.angle);
    const side = Math.abs(dx * Math.cos(p.angle) - dz * Math.sin(p.angle));
    if (along > 0 && along < bestD && side < 2.2) { bestD = along; best = t; }
  }
  if (best) {
    best.hp -= COMBAT.pistolDamage;
    if (best.hp <= 0) {
      if (best.alive !== undefined) best.alive = false;
      world.addHeat(1, best.isPed ? 'pedestrian down' : 'rival down');
      if (best.isPed) world.player.cash = Math.max(0, world.player.cash - 20);
    }
  } else {
    // A shot fired in public still draws attention, once in a while.
    if (world.rand() < 0.35) world.addHeat(1, 'shots fired');
  }
}
