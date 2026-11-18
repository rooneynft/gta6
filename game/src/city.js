// Port Meridian: the city itself. A road grid over a 3200x2400 map, buildings
// packed into the blocks, a beach and water along the south edge, container
// yards and piers on the east docks. Everything is placed from the seeded
// random, so the same seed builds the same city every time.

import { DISTRICTS, PALETTE } from './config.js';
import { pick, range } from './random.js';

export const WORLD = { width: 3200, height: 2400 };
export const ROADS_V = [240, 640, 1040, 1440, 1840, 2240, 2640, 2960];
export const ROADS_H = [240, 640, 1040, 1440, 1840, 2080];
export const ROAD_W = 96;
export const WATER_Y = 2240;

const ROOFS = [PALETTE.buildingRoof, PALETTE.buildingRoof2, PALETTE.buildingRoof3, PALETTE.buildingRoof4, PALETTE.buildingRoof5];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'PORT MERIDIAN';
}

export function isOnRoad(x, y) {
  for (const rx of ROADS_V) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return false;
}

export function pointInWater(x, y) {
  return y >= WATER_Y;
}

/** The nearest point on a road centreline, for spawning cars and police. */
export function nearestRoadPoint(x, y) {
  let bestV = ROADS_V[0];
  let bestH = ROADS_H[0];
  for (const rx of ROADS_V) if (Math.abs(x - rx) < Math.abs(x - bestV)) bestV = rx;
  for (const ry of ROADS_H) if (Math.abs(y - ry) < Math.abs(y - bestH)) bestH = ry;
  const dv = Math.abs(x - bestV);
  const dh = Math.abs(y - bestH);
  return dv < dh ? { x: bestV, y, vertical: true } : { x, y: bestH, vertical: false };
}

export function randomRoadPoint(random) {
  if (random() < 0.5) {
    return { x: pick(random, ROADS_V), y: range(random, 120, WORLD.height - 220), vertical: true };
  }
  return { x: range(random, 120, WORLD.width - 220), y: pick(random, ROADS_H), vertical: false };
}

function buildingOverlapsWater(b) {
  return b.y + b.h >= WATER_Y - 8;
}

export function generateCity(random) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const containers = [];

  for (let vi = 0; vi < ROADS_V.length - 1; vi += 1) {
    for (let hi = 0; hi < ROADS_H.length - 1; hi += 1) {
      const x0 = ROADS_V[vi] + ROAD_W / 2 + 14;
      const x1 = ROADS_V[vi + 1] - ROAD_W / 2 - 14;
      const y0 = ROADS_H[hi] + ROAD_W / 2 + 14;
      const y1 = ROADS_H[hi + 1] - ROAD_W / 2 - 14;
      if (y0 >= WATER_Y - 40) continue;
      if (x0 >= 2640) continue; // east strip is the docks, handled below
      const roll = random();
      if (roll < 0.16) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = 3 + Math.floor(random() * 5);
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: range(random, x0 + 16, x1 - 16), y: range(random, y0 + 16, y1 - 16), r: 9 + random() * 7 });
        }
        continue;
      }
      const count = 1 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        const bw = range(random, 90, Math.min(190, (x1 - x0) / count - 24));
        const bh = range(random, 80, Math.min(170, y1 - y0 - 24));
        const bx = range(random, x0, Math.max(x0 + 1, x1 - bw));
        const by = range(random, y0, Math.max(y0 + 1, y1 - bh));
        const b = { x: bx, y: by, w: bw, h: bh, roof: pick(random, ROOFS), tall: random() < 0.3 };
        if (!buildingOverlapsWater(b)) buildings.push(b);
      }
    }
  }

  // The docks: container stacks east of the last road, plus two piers.
  for (let i = 0; i < 26; i += 1) {
    containers.push({
      x: range(random, 2700, 3120),
      y: range(random, 120, 2000),
      w: range(random, 46, 90),
      h: 30,
      color: pick(random, ['#e76f51', '#2a9d8f', '#e9c46a', '#457b9d', '#b5838d']),
      angle: random() < 0.5 ? 0 : Math.PI / 2,
    });
  }

  return {
    buildings,
    parks,
    trees,
    containers,
    spots: {
      garage: { x: 700, y: 700, label: "MARA'S GARAGE" },
      marina: { x: 2760, y: 1960, label: 'MARINA DROP' },
      docks: { x: 2880, y: 1180, label: 'THE DOCKS' },
      bank: { x: 1500, y: 1100, label: 'MERIDIAN BANK' },
      hideout: { x: 380, y: 1740, label: 'HIDEOUT' },
      sportsCar: { x: 2240, y: 700, label: 'COMET GT' },
      playerStart: { x: 640, y: 560 },
    },
  };
}

/** Push a circle out of every building it overlaps; returns the corrected point and whether it hit. */
export function collideBuildings(x, y, r, buildings) {
  let hit = false;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Centre inside the building: push out along the smallest penetration.
        const left = x - b.x;
        const right = b.x + b.w - x;
        const top = y - b.y;
        const bottom = b.y + b.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  return { x, y, hit };
}

export function rectHitsBuilding(x, y, hw, hh, buildings) {
  for (const b of buildings) {
    if (x + hw > b.x && x - hw < b.x + b.w && y + hh > b.y && y - hh < b.y + b.h) return b;
  }
  return null;
}
