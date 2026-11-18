// Combat: bullets, rivals, pickups and explosions. The player shoots toward
// the mouse (or the nearest threat), punches up close, and rivals shoot back.
// Cash, health and the pistol are pickups on the ground.

import { PLAYER } from './config.js';
import { collideBuildings } from './city.js';
import { addHeat } from './police.js';
import { scarePeds } from './traffic.js';

export function createCombat() {
  return { bullets: [], rivals: [], pickups: [], particles: [] };
}

export function spawnParticles(world, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = world.rand() * Math.PI * 2;
    const s = (0.3 + world.rand() * 0.7) * (speed || 160);
    world.combat.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + world.rand() * 0.5,
      maxLife: 0.9,
      color,
      size: 2 + world.rand() * 3,
    });
  }
}

export function explodeCar(world, car) {
  spawnParticles(world, car.x, car.y, '#ff9f1c', 26, 260);
  spawnParticles(world, car.x, car.y, '#3a3844', 18, 140);
  spawnParticles(world, car.x, car.y, '#ffd23f', 12, 320);
  car.wreck = 10;
  car.speed = 0;
  const player = world.player;
  if (Math.hypot(player.x - car.x, player.y - car.y) < 130 && world.invulnerable <= 0) {
    player.hp -= 22;
    world.invulnerable = 0.5;
  }
  scarePeds(world, car.x, car.y, 420);
}

export function playerShoot(world, tx, ty) {
  const player = world.player;
  if (!player.hasPistol || player.shootTimer > 0) return;
  player.shootTimer = PLAYER.shootCooldown;
  const dx = tx - player.x;
  const dy = ty - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const spread = (world.rand() - 0.5) * 0.06;
  const angle = Math.atan2(dy, dx) + spread;
  world.combat.bullets.push({
    x: player.x + Math.cos(angle) * 20,
    y: player.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * PLAYER.bulletSpeed,
    vy: Math.sin(angle) * PLAYER.bulletSpeed,
    life: 0.85,
    from: 'player',
    damage: 1,
  });
  player.angle = angle;
  world.audio.shot();
  spawnParticles(world, player.x + Math.cos(angle) * 24, player.y + Math.sin(angle) * 24, '#ffd23f', 3, 90);
  scarePeds(world, player.x, player.y, 380);
  if (world.police.heat < 1) addHeat(world, 1, 'shots fired');
  else world.police.lastCrime = world.time;
}

export function playerPunch(world) {
  const player = world.player;
  if (player.punchTimer > 0) return;
  player.punchTimer = 0.35;
  world.audio.punch();
  const px = player.x + Math.cos(player.angle) * 26;
  const py = player.y + Math.sin(player.angle) * 26;
  const hit = (target, radius) => Math.hypot(target.x - px, target.y - py) < radius + 18;
  for (const rival of world.combat.rivals) {
    if (hit(rival, 14)) {
      rival.hp -= 1;
      rival.x += Math.cos(player.angle) * 14;
      rival.y += Math.sin(player.angle) * 14;
      spawnParticles(world, rival.x, rival.y, '#ff5d8f', 5, 120);
    }
  }
  for (const ped of world.peds) {
    if (ped.state !== 'down' && hit(ped, 12)) {
      ped.state = 'down';
      ped.downTimer = 9;
      scarePeds(world, ped.x, ped.y, 300);
      addHeat(world, 1, 'assault');
    }
  }
  for (const officer of world.police.officers) {
    if (hit(officer, 14)) {
      officer.hp -= 1;
      addHeat(world, 1, 'hit an officer');
    }
  }
}

export function spawnRival(world, x, y) {
  const rival = { x, y, angle: 0, hp: 3, speed: 120, shootTimer: 1 + world.rand(), state: 'fight', cash: 150 };
  world.combat.rivals.push(rival);
  return rival;
}

export function spawnCash(world, x, y, amount) {
  world.combat.pickups.push({ kind: 'cash', x, y, amount, bob: world.rand() * 6 });
}

export function spawnHealth(world, x, y) {
  world.combat.pickups.push({ kind: 'health', x, y, amount: 40, bob: 0 });
}

export function spawnPistol(world, x, y) {
  world.combat.pickups.push({ kind: 'pistol', x, y, amount: 0, bob: 0 });
}

function damageCar(world, car, amount) {
  car.hp -= amount;
  spawnParticles(world, car.x, car.y, '#8b93a3', 6, 120);
  if (car.hp <= 0 && car.wreck <= 0) {
    explodeCar(world, car);
    if (car.kind === 'traffic') addHeat(world, 0, '');
    if (car === world.player.car) {
      world.player.car = null;
      world.events.ejected = true;
    }
  }
}

export function updateCombat(world, dt) {
  const combat = world.combat;
  const player = world.player;

  // Bullets fly and hit things.
  for (let i = combat.bullets.length - 1; i >= 0; i -= 1) {
    const b = combat.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    const hitB = collideBuildings(b.x, b.y, 2, world.city.buildings);
    if (hitB.hit) {
      spawnParticles(world, b.x, b.y, '#f5d76e', 4, 100);
      dead = true;
    }
    if (!dead && b.from === 'player') {
      for (const rival of combat.rivals) {
        if (Math.hypot(rival.x - b.x, rival.y - b.y) < 15) {
          rival.hp -= b.damage;
          spawnParticles(world, b.x, b.y, '#c9184a', 6, 130);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const officer of world.police.officers) {
          if (Math.hypot(officer.x - b.x, officer.y - b.y) < 14) {
            officer.hp -= b.damage;
            addHeat(world, 1, 'shot an officer');
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of world.peds) {
          if (ped.state !== 'down' && Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
            ped.state = 'down';
            ped.downTimer = 12;
            addHeat(world, 1, 'shot a pedestrian');
            scarePeds(world, ped.x, ped.y, 340);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        const cars = [...world.traffic, ...world.police.cars];
        if (player.car) cars.push(player.car);
        for (const car of cars) {
          if (car.wreck > 0) continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < 26) {
            damageCar(world, car, b.damage);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from !== 'player') {
      if (Math.hypot(player.x - b.x, player.y - b.y) < 14 && world.invulnerable <= 0) {
        player.hp -= 6;
        world.invulnerable = 0.3;
        spawnParticles(world, b.x, b.y, '#ff5d8f', 5, 120);
        dead = true;
      }
    }
    if (dead) combat.bullets.splice(i, 1);
  }

  // Rivals hunt the player and shoot back.
  for (let i = combat.rivals.length - 1; i >= 0; i -= 1) {
    const rival = combat.rivals[i];
    if (rival.hp <= 0) {
      spawnCash(world, rival.x, rival.y, rival.cash);
      spawnParticles(world, rival.x, rival.y, '#c9184a', 10, 150);
      world.stats.kills += 1;
      combat.rivals.splice(i, 1);
      continue;
    }
    const dx = player.x - rival.x;
    const dy = player.y - rival.y;
    const dist = Math.hypot(dx, dy) || 1;
    rival.angle = Math.atan2(dy, dx);
    if (dist > 260) {
      rival.x += (dx / dist) * rival.speed * dt;
      rival.y += (dy / dist) * rival.speed * dt;
    } else if (dist < 120) {
      rival.x -= (dx / dist) * rival.speed * 0.6 * dt;
      rival.y -= (dy / dist) * rival.speed * 0.6 * dt;
    }
    rival.shootTimer -= dt;
    if (rival.shootTimer <= 0 && dist < 480) {
      rival.shootTimer = 1.1 + world.rand() * 0.7;
      const aim = rival.angle + (world.rand() - 0.5) * 0.35;
      combat.bullets.push({
        x: rival.x + Math.cos(aim) * 20,
        y: rival.y + Math.sin(aim) * 20,
        vx: Math.cos(aim) * 520,
        vy: Math.sin(aim) * 520,
        life: 0.9,
        from: 'rival',
        damage: 1,
      });
      world.audio.enemyShot();
    }
  }

  // Officers that drop to zero hp fall over.
  for (let i = world.police.officers.length - 1; i >= 0; i -= 1) {
    if (world.police.officers[i].hp <= 0) {
      spawnParticles(world, world.police.officers[i].x, world.police.officers[i].y, '#2b5cff', 8, 130);
      world.police.officers.splice(i, 1);
    }
  }

  // Pickups: walk over them to collect.
  for (let i = combat.pickups.length - 1; i >= 0; i -= 1) {
    const p = combat.pickups[i];
    p.bob += dt;
    if (Math.hypot(player.x - p.x, player.y - p.y) < 30) {
      if (p.kind === 'cash') {
        player.cash += p.amount;
        world.audio.cash();
        world.events.pickup = `+$${p.amount}`;
      } else if (p.kind === 'health') {
        player.hp = Math.min(100, player.hp + p.amount);
        world.audio.pickup();
        world.events.pickup = `+${p.amount} HP`;
      } else if (p.kind === 'pistol') {
        player.hasPistol = true;
        world.audio.pickup();
        world.events.pickup = 'PISTOL ACQUIRED';
      }
      combat.pickups.splice(i, 1);
    }
  }

  // Particles fade.
  for (let i = combat.particles.length - 1; i >= 0; i -= 1) {
    const p = combat.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) combat.particles.splice(i, 1);
  }
}
