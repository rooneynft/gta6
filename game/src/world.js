// The game's rules and state, with no drawing and no browser in it: the city of Vice
// Shores, the player on foot and in cars, traffic, pedestrians, police, the wanted
// system, five story missions and the busted ending. step() advances one fixed step and
// returns what happened as bit flags, so the caller can react without the world knowing
// about screens or sound. The city is generated from the seed, so the same seed always
// gives the same city; the simulation random stream restarts on reset() for the same reason.
import {
  CANAL, CAR, MISSIONS, PARK, PEDS, PLAYER, POLICE, ROADS_H, ROADS_V, ROAD_W,
  SHORE, START_MONEY, TRAFFIC, WANTED_DECAY_SECONDS, WANTED_MAX, WANTED_NEAR, WORLD,
} from './config.js';
import { createRandom } from './random.js';

export const EVENT_BUSTED = 1;
export const EVENT_MISSION = 2;
export const EVENT_CASH = 4;
export const EVENT_HIT = 8;
export const EVENT_PUNCH = 16;

const ROOF_COLORS = ['#c96f4a', '#d9a05b', '#7fae5a', '#5b8fd9', '#b06fc9', '#d95b7f', '#4ab3a6', '#e0d6c2'];
const CAR_COLORS = ['#e5534b', '#f2c94c', '#4fc3f7', '#9b59b6', '#e67e22', '#2ecc71', '#ecf0f1', '#34495e', '#ff6b9d'];
const PED_COLORS = ['#f39c12', '#8e44ad', '#16a085', '#c0392b', '#2980b9', '#d35400', '#7f8c8d', '#e74c3c'];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Nearest point on any road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 40, WORLD.height - 40) }; }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 40, WORLD.width - 40), y: ry }; }
  }
  return best;
}

export function createWorld(seed) {
  const state = {
    player: null,
    cars: [],
    peds: [],
    footCops: [],
    buildings: [],
    trees: [],
    cashBags: [],
    money: START_MONEY,
    wanted: 0,
    missionIndex: 0,
    missionStage: 0,
    bagsCollected: 0,
    passenger: false,
    elapsed: 0,
    toastText: '',
    toastUntil: 0,
    busted: false,
    allDone: false,
    decayTimer: 0,
    bustedTimer: 0,
    siren: false,
  };
  let random = createRandom(seed ^ 0x51ab);
  let cityRandom = createRandom(seed);

  function inBuilding(x, y, r) {
    for (const b of state.buildings) {
      if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
    }
    return false;
  }

  function inWater(x, y) {
    if (y >= SHORE.waterY0) return true;
    if (y > CANAL.y0 && y < CANAL.y1) {
      for (const rx of ROADS_V) if (Math.abs(x - rx) < ROAD_W / 2 - 6) return false;
      return true;
    }
    // The park pond.
    const px = (x - 1300) / 130;
    const py = (y - 700) / 75;
    return px * px + py * py < 1;
  }

  function blocked(x, y, r) {
    if (x < r || x > WORLD.width - r || y < r || y > WORLD.height - r) return true;
    return inBuilding(x, y, r) || inWater(x, y);
  }

  /** Move with collision: try the full step, then each axis alone (wall sliding). */
  function tryMove(entity, dx, dy, r) {
    const nx = entity.x + dx;
    const ny = entity.y + dy;
    if (!blocked(nx, ny, r)) { entity.x = nx; entity.y = ny; return true; }
    if (!blocked(nx, entity.y, r)) { entity.x = nx; return true; }
    if (!blocked(entity.x, ny, r)) { entity.y = ny; return true; }
    return false;
  }

  function makeCar(x, y, angle, kind, color) {
    return {
      x, y, angle, speed: 0, hp: CAR.health, kind, color,
      axis: 'v', dir: 1, lane: 28, occupied: kind === 'traffic',
      wrecked: false, lastIx: -1, lastIy: -1, lastTurnKey: '', ramCooldown: 0,
    };
  }

  function generateCity() {
    const rnd = cityRandom;
    state.buildings = [];
    state.trees = [];
    const xGaps = [[0, 340], [460, 940], [1060, 1540], [1660, 2140], [2260, 2740], [2860, 3200]];
    const yGaps = [[0, 340], [460, 940], [1060, 1540], [1660, 1940], [2060, 2120]];
    const lotBlocks = new Set(['1,2', '3,1']);
    for (let gx = 0; gx < xGaps.length; gx += 1) {
      for (let gy = 0; gy < yGaps.length; gy += 1) {
        const [x0, x1] = xGaps[gx];
        const [y0, y1] = yGaps[gy];
        // The park block.
        if (gx === 2 && gy === 1) continue;
        // The canal band: banks only, no buildings.
        if (gy === 3) {
          for (let i = 0; i < 3; i += 1) {
            state.trees.push({ x: x0 + 40 + rnd() * (x1 - x0 - 80), y: y0 + 20 + rnd() * 30, palm: false });
            state.trees.push({ x: x0 + 40 + rnd() * (x1 - x0 - 80), y: y1 - 50 + rnd() * 30, palm: false });
          }
          continue;
        }
        // The beachfront strip: palms and two beach bars.
        if (gy === 4) {
          for (let i = 0; i < 4; i += 1) {
            state.trees.push({ x: x0 + 30 + rnd() * (x1 - x0 - 60), y: y0 + 15 + rnd() * 30, palm: true });
          }
          if (gx === 1 || gx === 4) {
            state.buildings.push({ x: x0 + 60, y: y0 + 8, w: 120, h: 44, color: '#e0a458', pool: false, detail: 1 });
          }
          continue;
        }
        // Parking lots instead of buildings on two blocks.
        if (lotBlocks.has(`${gx},${gy}`)) continue;
        const cols = x1 - x0 > 380 ? 2 : 1;
        const rows = y1 - y0 > 380 ? 2 : 1;
        const cw = (x1 - x0) / cols;
        const ch = (y1 - y0) / rows;
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            if (rnd() < 0.22) continue;
            const w = cw * (0.55 + rnd() * 0.3);
            const h = ch * (0.55 + rnd() * 0.3);
            state.buildings.push({
              x: x0 + cx * cw + (cw - w) / 2,
              y: y0 + cy * ch + (ch - h) / 2,
              w, h,
              color: ROOF_COLORS[Math.floor(rnd() * ROOF_COLORS.length)],
              pool: rnd() < 0.18,
              detail: Math.floor(rnd() * 3),
            });
          }
        }
      }
    }
    // Park trees and pond-side palms.
    for (let i = 0; i < 26; i += 1) {
      const x = PARK.x0 + 30 + rnd() * (PARK.x1 - PARK.x0 - 60);
      const y = PARK.y0 + 30 + rnd() * (PARK.y1 - PARK.y0 - 60);
      const px = (x - 1300) / 150;
      const py = (y - 700) / 95;
      if (px * px + py * py < 1) continue;
      state.trees.push({ x, y, palm: rnd() < 0.25 });
    }
    for (let i = 0; i < 14; i += 1) {
      state.trees.push({ x: 60 + rnd() * (WORLD.width - 120), y: SHORE.sandY0 + 12 + rnd() * 90, palm: true });
    }
  }

  function randomRoadPoint(minDistFromPlayer) {
    for (let tries = 0; tries < 40; tries += 1) {
      const vertical = random() < 0.5;
      let x;
      let y;
      if (vertical) {
        x = ROADS_V[Math.floor(random() * ROADS_V.length)];
        y = 60 + random() * (WORLD.height - 120);
      } else {
        x = 60 + random() * (WORLD.width - 120);
        y = ROADS_H[Math.floor(random() * ROADS_H.length)];
      }
      if (minDistFromPlayer && state.player && dist(x, y, state.player.x, state.player.y) < minDistFromPlayer) continue;
      if (inWater(x, y)) continue;
      return { x, y };
    }
    return { x: 1600, y: 400 };
  }

  function spawnTrafficCar() {
    const p = randomRoadPoint(0);
    const vertical = random() < 0.5;
    const car = makeCar(p.x, p.y, 0, 'traffic', CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]);
    if (vertical) {
      car.axis = 'v';
      car.dir = random() < 0.5 ? 1 : -1;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      car.x = ROADS_V[Math.floor(random() * ROADS_V.length)] + car.dir * 28;
      car.y = 80 + random() * (WORLD.height - 160);
    } else {
      car.axis = 'h';
      car.dir = random() < 0.5 ? 1 : -1;
      car.angle = car.dir > 0 ? 0 : Math.PI;
      car.y = ROADS_H[Math.floor(random() * ROADS_H.length)] + car.dir * 28;
      car.x = 80 + random() * (WORLD.width - 160);
    }
    car.speed = TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
    return car;
  }

  function spawnPed() {
    const p = randomRoadPoint(150);
    return {
      x: p.x, y: p.y, angle: random() * Math.PI * 2,
      speed: PEDS.speedMin + random() * (PEDS.speedMax - PEDS.speedMin),
      color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
      tx: p.x, ty: p.y, down: 0, flee: 0, state: 'walk',
    };
  }

  function newSidewalkTarget(ped) {
    const vertical = random() < 0.5;
    if (vertical) {
      const rx = ROADS_V[Math.floor(random() * ROADS_V.length)];
      ped.tx = rx + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 16);
      ped.ty = 60 + random() * (WORLD.height - 120);
    } else {
      const ry = ROADS_H[Math.floor(random() * ROADS_H.length)];
      ped.tx = 60 + random() * (WORLD.width - 120);
      ped.ty = ry + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 16);
    }
  }

  function reset() {
    random = createRandom(seed ^ 0x51ab);
    cityRandom = createRandom(seed);
    generateCity();
    state.player = {
      x: 1670, y: 1060, angle: -Math.PI / 2, health: PLAYER.health,
      inCar: null, punchTimer: 0, punchCooldown: 0, invuln: 0, walkPhase: 0,
    };
    state.cars = [];
    // Parked cars near the spawn, so mission 1 is right there.
    const parkedSpots = [
      { x: 1676, y: 900, angle: Math.PI / 2 }, { x: 1676, y: 970, angle: Math.PI / 2 },
      { x: 1676, y: 1130, angle: Math.PI / 2 }, { x: 1524, y: 460, angle: 0 },
      { x: 924, y: 1060, angle: Math.PI / 2 }, { x: 2276, y: 1540, angle: 0 },
      { x: 476, y: 460, angle: Math.PI }, { x: 2876, y: 1060, angle: -Math.PI / 2 },
    ];
    for (const s of parkedSpots) {
      const car = makeCar(s.x, s.y, s.angle, 'parked', CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]);
      state.cars.push(car);
    }
    // Parking-lot cars on the two lot blocks.
    for (let i = 0; i < 4; i += 1) {
      state.cars.push(makeCar(520 + i * 90, 1120, Math.PI / 2, 'parked', CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]));
      state.cars.push(makeCar(2320 + i * 90, 520, 0, 'parked', CAR_COLORS[Math.floor(random() * CAR_COLORS.length)]));
    }
    for (let i = 0; i < TRAFFIC.count; i += 1) state.cars.push(spawnTrafficCar());
    state.peds = [];
    for (let i = 0; i < PEDS.count; i += 1) {
      const ped = spawnPed();
      newSidewalkTarget(ped);
      state.peds.push(ped);
    }
    state.footCops = [];
    state.cashBags = [];
    for (let i = 0; i < MISSIONS[3].bags; i += 1) {
      const p = randomRoadPoint(250);
      state.cashBags.push({ x: p.x, y: p.y, taken: false });
    }
    state.money = START_MONEY;
    state.wanted = 0;
    state.missionIndex = 0;
    state.missionStage = 0;
    state.bagsCollected = 0;
    state.passenger = false;
    state.elapsed = 0;
    state.toastText = '';
    state.toastUntil = 0;
    state.busted = false;
    state.allDone = false;
    state.decayTimer = 0;
    state.bustedTimer = 0;
    state.siren = false;
  }

  function setToast(text, seconds) {
    state.toastText = text;
    state.toastUntil = state.elapsed + seconds;
  }

  function raiseWanted(level) {
    state.wanted = Math.min(WANTED_MAX, Math.max(state.wanted, level));
    state.decayTimer = 0;
  }

  function completeMission() {
    const mission = MISSIONS[state.missionIndex];
    state.money += mission.reward;
    setToast(`MISSION COMPLETE  +$${mission.reward}`, 3.2);
    state.missionIndex += 1;
    state.missionStage = 0;
    state.passenger = false;
    if (state.missionIndex >= MISSIONS.length) {
      state.allDone = true;
      setToast('ALL MISSIONS COMPLETE — Vice Shores is yours!', 5);
      return EVENT_MISSION;
    }
    if (MISSIONS[state.missionIndex].id === 'heat') {
      raiseWanted(3);
      setToast('THE HEAT IS ON — lose the cops!', 3.2);
    }
    return EVENT_MISSION;
  }

  function currentTarget() {
    if (state.missionIndex >= MISSIONS.length) return null;
    const m = MISSIONS[state.missionIndex];
    if (m.id === 'pickup') return state.missionStage === 0 ? { ...m.targetA, label: 'Rico' } : { ...m.targetB, label: 'Marina' };
    if (m.target) return { ...m.target, label: m.targetLabel };
    return null;
  }

  function nearestCar(x, y, maxDist, kinds) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      if (car.wrecked) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar() {
    const p = state.player;
    if (p.inCar) {
      const car = p.inCar;
      car.kind = 'parked';
      car.speed = 0;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      if (blocked(p.x, p.y, PLAYER.radius)) {
        p.x = car.x - Math.cos(car.angle + Math.PI / 2) * 34;
        p.y = car.y - Math.sin(car.angle + Math.PI / 2) * 34;
      }
      p.angle = car.angle;
      p.inCar = null;
      return;
    }
    const car = nearestCar(p.x, p.y, 58, ['parked', 'traffic']);
    if (!car) return;
    if (car.kind === 'traffic' && car.occupied) {
      car.occupied = false;
      car.speed = 0;
      raiseWanted(2);
      const driver = spawnPed();
      driver.x = car.x + 30;
      driver.y = car.y + 30;
      driver.flee = 4;
      state.peds.push(driver);
      setToast('Carjacked! The driver ran off screaming.', 2.2);
    } else if (car.kind === 'parked') {
      raiseWanted(1);
    }
    car.kind = 'player';
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    if (state.missionIndex === 0) return 'mission';
    return null;
  }

  function punch() {
    const p = state.player;
    if (p.inCar || p.punchCooldown > 0) return 0;
    p.punchTimer = 0.22;
    p.punchCooldown = PLAYER.punchCooldown;
    let hitSomething = false;
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      const d = dist(p.x, p.y, ped.x, ped.y);
      if (d < PLAYER.punchRange && Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, ped.x, ped.y))) < PLAYER.punchArc) {
        ped.down = 3;
        ped.flee = 6;
        raiseWanted(state.wanted + 1);
        hitSomething = true;
      }
    }
    for (const cop of state.footCops) {
      if (cop.down > 0) continue;
      const d = dist(p.x, p.y, cop.x, cop.y);
      if (d < PLAYER.punchRange && Math.abs(angleDiff(p.angle, angleTo(p.x, p.y, cop.x, cop.y))) < PLAYER.punchArc) {
        cop.hp -= 1;
        if (cop.hp <= 0) { cop.down = 5; cop.hp = 3; }
        raiseWanted(state.wanted + 1);
        hitSomething = true;
      }
    }
    return hitSomething ? EVENT_PUNCH : 0;
  }

  function updatePlayerCar(dt, input) {
    const p = state.player;
    const car = p.inCar;
    const steer = input.x;
    // input.y is -1 for Up/W (accelerate) and +1 for Down/S (brake, then reverse).
    if (input.y < 0) car.speed += CAR.accel * dt;
    else if (input.y > 0) {
      car.speed -= (car.speed > 20 ? CAR.brake : CAR.accel * 0.6) * dt;
    } else {
      car.speed -= car.speed * CAR.drag * dt;
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const turnAuthority = clamp(Math.abs(car.speed) / 130, 0, 1);
    car.angle += steer * CAR.turnRate * turnAuthority * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const hitWall = blocked(nx, ny, 20);
    if (hitWall) {
      if (Math.abs(car.speed) > 210) {
        car.hp -= (Math.abs(car.speed) - 210) * 0.18;
        p.health -= (Math.abs(car.speed) - 210) * 0.05;
        car.speed *= 0.35;
      } else {
        car.speed *= 0.5;
      }
    }
    tryMove(car, Math.cos(car.angle) * car.speed * dt, Math.sin(car.angle) * car.speed * dt, 20);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.hp <= 0 && !car.wrecked) {
      car.wrecked = true;
      car.speed = 0;
      setToast('Your car is wrecked! Bail out!', 2.5);
    }
    if (car.wrecked && p.inCar) {
      p.inCar = null;
      car.kind = 'parked';
      p.x = car.x + 34;
      p.y = car.y + 34;
    }
  }

  function updateTraffic(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      // Slow down for the car ahead in the same lane.
      let ahead = Infinity;
      for (const other of state.cars) {
        if (other === car || other.wrecked) continue;
        const d = dist(car.x, car.y, other.x, other.y);
        if (d < 78) {
          const bearing = angleDiff(car.angle, angleTo(car.x, car.y, other.x, other.y));
          if (Math.abs(bearing) < 0.6) ahead = Math.min(ahead, d);
        }
      }
      const targetSpeed = ahead < 78 ? car.speed * 0.5 : TRAFFIC.speedMin + (TRAFFIC.speedMax - TRAFFIC.speedMin) * 0.5;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      // At an intersection, maybe turn onto the crossing road.
      const onV = car.axis === 'v';
      const roadPos = onV ? car.y : car.x;
      const crossing = onV ? ROADS_H : ROADS_V;
      for (const c of crossing) {
        const key = `${onV ? 'v' : 'h'}:${c}`;
        if (Math.abs(roadPos - c) < 8 && car.lastTurnKey !== key) {
          car.lastTurnKey = key;
          const roll = random();
          if (roll < 0.3) {
            // Turn: switch axis, snap onto the crossing road's lane.
            if (onV) {
              car.axis = 'h';
              car.dir = random() < 0.5 ? 1 : -1;
              car.angle = car.dir > 0 ? 0 : Math.PI;
              car.y = c + car.dir * 28;
            } else {
              car.axis = 'v';
              car.dir = random() < 0.5 ? 1 : -1;
              car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
              car.x = c + car.dir * 28;
            }
          }
          break;
        }
      }
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (nx < 70 || nx > WORLD.width - 70 || ny < 70 || ny > WORLD.height - 70) {
        car.dir *= -1;
        car.angle += Math.PI;
      }
      car.x = clamp(nx, 50, WORLD.width - 50);
      car.y = clamp(ny, 50, WORLD.height - 50);
      // Player car ramming a traffic car shoves it.
      if (p.inCar) {
        const d = dist(car.x, car.y, p.inCar.x, p.inCar.y);
        if (d < 46) {
          const push = angleTo(p.inCar.x, p.inCar.y, car.x, car.y);
          car.x += Math.cos(push) * 26 * dt * 4;
          car.y += Math.sin(push) * 26 * dt * 4;
          car.speed *= 0.96;
        }
      }
    }
  }

  function spawnPoliceCar() {
    const p = randomRoadPoint(520);
    const car = makeCar(p.x, p.y, 0, 'police', '#f4f1e8');
    car.axis = random() < 0.5 ? 'v' : 'h';
    if (car.axis === 'v') {
      car.x = ROADS_V[Math.floor(random() * ROADS_V.length)];
      car.dir = 1;
      car.angle = Math.PI / 2;
    } else {
      car.y = ROADS_H[Math.floor(random() * ROADS_H.length)];
      car.dir = 1;
      car.angle = 0;
    }
    car.speed = POLICE.carSpeed;
    return car;
  }

  function updatePolice(dt) {
    const p = state.player;
    const wantCars = Math.min(state.wanted, 4);
    const wantCops = state.wanted >= 2 ? Math.min(state.wanted - 1, 3) : 0;
    let policeCars = state.cars.filter((c) => c.kind === 'police');
    while (policeCars.length < wantCars) {
      const car = spawnPoliceCar();
      state.cars.push(car);
      policeCars.push(car);
    }
    while (policeCars.length > wantCars) {
      const car = policeCars.pop();
      state.cars.splice(state.cars.indexOf(car), 1);
    }
    while (state.footCops.length < wantCops) {
      const spot = randomRoadPoint(220);
      state.footCops.push({ x: spot.x, y: spot.y, angle: 0, hp: 3, down: 0, punchTimer: 0, phase: random() * 6 });
    }
    while (state.footCops.length > wantCops) state.footCops.pop();

    for (const car of policeCars) {
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      // Road-bound chase: at each intersection, pick the turn that gets closer to the player.
      const onV = car.axis === 'v';
      const roadPos = onV ? car.y : car.x;
      const crossing = onV ? ROADS_H : ROADS_V;
      for (const c of crossing) {
        if (Math.abs(roadPos - c) < 10 && car.lastIx !== c) {
          car.lastIx = c;
          const options = [];
          const cx = onV ? car.x : c;
          const cy = onV ? c : car.y;
          // Straight, left, right (never reverse).
          const dirs = onV
            ? [{ axis: 'v', dir: car.dir }, { axis: 'h', dir: 1 }, { axis: 'h', dir: -1 }]
            : [{ axis: 'h', dir: car.dir }, { axis: 'v', dir: 1 }, { axis: 'v', dir: -1 }];
          for (const o of dirs) {
            const ex = o.axis === 'v' ? cx : cx + o.dir * 200;
            const ey = o.axis === 'h' ? cy : cy + o.dir * 200;
            options.push({ ...o, d: dist(ex, ey, p.x, p.y) });
          }
          options.sort((a, b) => a.d - b.d);
          const pick = options[0];
          if (pick.axis !== car.axis) {
            car.axis = pick.axis;
            car.dir = pick.dir;
            car.angle = pick.axis === 'v' ? (pick.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (pick.dir > 0 ? 0 : Math.PI);
            if (pick.axis === 'v') car.x = c;
            else car.y = c;
          }
          break;
        }
      }
      const d = dist(car.x, car.y, p.x, p.y);
      car.speed = d < 90 ? POLICE.carSpeed * 0.72 : POLICE.carSpeed;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (nx < 70 || nx > WORLD.width - 70 || ny < 70 || ny > WORLD.height - 70) {
        car.dir *= -1;
        car.angle += Math.PI;
        car.lastIx = -1;
      }
      car.x = clamp(nx, 50, WORLD.width - 50);
      car.y = clamp(ny, 50, WORLD.height - 50);
      // Ram the player's car.
      if (p.inCar && d < 48 && car.ramCooldown <= 0) {
        car.ramCooldown = 0.8;
        p.inCar.hp -= POLICE.ramDamage;
        p.inCar.speed *= 0.55;
        p.health -= 4;
        if (p.inCar.hp <= 0 && !p.inCar.wrecked) {
          p.inCar.wrecked = true;
          p.inCar.speed = 0;
          setToast('Your car is wrecked! Bail out!', 2.5);
        }
      }
    }

    for (const cop of state.footCops) {
      if (cop.down > 0) { cop.down -= dt; continue; }
      cop.phase += dt;
      const d = dist(cop.x, cop.y, p.x, p.y);
      if (!p.inCar) {
        cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
        tryMove(cop, Math.cos(cop.angle) * POLICE.footSpeed * dt, Math.sin(cop.angle) * POLICE.footSpeed * dt, 12);
        if (d < 30) {
          if (cop.punchTimer <= 0) {
            cop.punchTimer = POLICE.punchInterval;
            p.health -= POLICE.punchDamage;
            if (p.invuln <= 0) p.invuln = 0.4;
          }
        }
      } else {
        // On foot, cops chase the car on the sidewalk; they cannot catch a moving car.
        cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
        if (d > 90) tryMove(cop, Math.cos(cop.angle) * POLICE.footSpeed * 0.7 * dt, Math.sin(cop.angle) * POLICE.footSpeed * 0.7 * dt, 12);
      }
      if (cop.punchTimer > 0) cop.punchTimer -= dt;
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.down > 0) { ped.down -= dt; continue; }
      if (ped.flee > 0) ped.flee -= dt;
      const dPlayer = dist(ped.x, ped.y, p.x, p.y);
      const playerCarFast = p.inCar && Math.abs(p.inCar.speed) > 120;
      if ((playerCarFast && dPlayer < 150) || ped.flee > 0) {
        const away = angleTo(p.x, p.y, ped.x, ped.y);
        ped.angle = away;
        tryMove(ped, Math.cos(away) * 150 * dt, Math.sin(away) * 150 * dt, 11);
        continue;
      }
      const dTarget = dist(ped.x, ped.y, ped.tx, ped.ty);
      if (dTarget < 24) { newSidewalkTarget(ped); continue; }
      ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
      tryMove(ped, Math.cos(ped.angle) * ped.speed * dt, Math.sin(ped.angle) * ped.speed * dt, 11);
      // Run over by the player's car.
      if (p.inCar && Math.abs(p.inCar.speed) > 60 && dPlayer < 34) {
        ped.down = 4;
        ped.flee = 8;
        raiseWanted(state.wanted + 1);
        p.inCar.speed *= 0.82;
        setToast('You ran someone over! The cops saw that.', 2);
      }
    }
  }

  function updateMissions(dt) {
    const p = state.player;
    if (state.missionIndex >= MISSIONS.length) return;
    const m = MISSIONS[state.missionIndex];
    if (m.id === 'parcel') {
      if (dist(p.x, p.y, m.target.x, m.target.y) < 70) completeMission();
    } else if (m.id === 'pickup') {
      if (state.missionStage === 0) {
        if (dist(p.x, p.y, m.targetA.x, m.targetA.y) < 70) {
          state.missionStage = 1;
          state.passenger = true;
          setToast('Rico is in! Now drop him at the Marina.', 3);
        }
      } else if (dist(p.x, p.y, m.targetB.x, m.targetB.y) < 70) {
        completeMission();
      }
    } else if (m.id === 'cash') {
      for (const bag of state.cashBags) {
        if (!bag.taken && dist(p.x, p.y, bag.x, bag.y) < 42) {
          bag.taken = true;
          state.bagsCollected += 1;
          state.money += 50;
          setToast(`Cash bag ${state.bagsCollected}/5  +$50`, 2);
          if (state.bagsCollected >= m.bags) completeMission();
        }
      }
    } else if (m.id === 'heat') {
      const t = currentTarget();
      if (state.wanted === 0 && t && dist(p.x, p.y, t.x, t.y) < 80) completeMission();
    }
  }

  /**
   * One fixed step. `input` is {x, y, enter, punch}: x/y are -1, 0 or 1. With `harmless`
   * set (the title screen's backdrop) the city lives but nothing touches the player and
   * nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    const p = state.player;

    if (!harmless) {
      // Player movement.
      if (input.enter) {
        const result = enterCar();
        if (result === 'mission') events |= completeMission();
      }
      if (p.inCar) {
        updatePlayerCar(dt, input);
      } else {
        const len = Math.hypot(input.x, input.y);
        if (len > 0) {
          p.angle = Math.atan2(input.y, input.x);
          p.walkPhase += dt * 10;
          tryMove(p, (input.x / len) * PLAYER.walkSpeed * dt, (input.y / len) * PLAYER.walkSpeed * dt, PLAYER.radius);
        }
        if (input.punch) events |= punch();
      }
      if (p.punchTimer > 0) p.punchTimer -= dt;
      if (p.punchCooldown > 0) p.punchCooldown -= dt;
      if (p.invuln > 0) p.invuln -= dt;
      if (state.wanted === 0 && p.health < PLAYER.health) p.health = Math.min(PLAYER.health, p.health + 2 * dt);

      // Wanted decay: no cop nearby for a while, one star drops.
      if (state.wanted > 0) {
        let nearest = Infinity;
        for (const car of state.cars) if (car.kind === 'police') nearest = Math.min(nearest, dist(car.x, car.y, p.x, p.y));
        for (const cop of state.footCops) nearest = Math.min(nearest, dist(cop.x, cop.y, p.x, p.y));
        if (nearest > WANTED_NEAR) {
          state.decayTimer += dt;
          if (state.decayTimer >= WANTED_DECAY_SECONDS) {
            state.wanted -= 1;
            state.decayTimer = 0;
            if (state.wanted === 0) setToast('You lost the cops. Clean… for now.', 2.5);
          }
        } else {
          state.decayTimer = 0;
        }
      }

      updateMissions(dt);

      // Busted: a foot cop catches the player on foot, or health runs out.
      if (!p.inCar) {
        let caught = false;
        for (const cop of state.footCops) {
          if (cop.down <= 0 && dist(cop.x, cop.y, p.x, p.y) < 26) { caught = true; break; }
        }
        if (caught) state.bustedTimer += dt;
        else state.bustedTimer = 0;
        if (state.bustedTimer > 0.4 || p.health <= 0) {
          state.busted = true;
          events |= EVENT_BUSTED;
          return events;
        }
      } else if (p.health <= 0) {
        state.busted = true;
        events |= EVENT_BUSTED;
        return events;
      }
    }

    updateTraffic(dt);
    updatePeds(dt);
    if (!harmless) updatePolice(dt);
    state.siren = state.wanted > 0;
    return events;
  }

  reset();
  return { state, reset, step, currentTarget, nearestCar, nearestRoadPoint: (x, y) => nearestRoadPoint(x, y) };
}
