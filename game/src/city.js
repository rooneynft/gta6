// The procedural city of Vice Shores: a grid of roads, blocks full of
// buildings, palms, lamps, parked cars and cash pickups. Everything is
// placed from a seed, so the map never changes between visits.

import { ROADS_X, ROADS_Z, SPOTS, WORLD } from './config.js';
import { pick, range } from './random.js';

const BUILDING_COLORS = [
  0xd8c9a8, 0xc9b49a, 0xb8a88e, 0xa8b8c8, 0xc8a8a0, 0x9ab8a8,
  0xd8d0c0, 0x8ea8c8, 0xe0cfa8, 0xb0a090,
];
const ROOF_COLORS = [0x6a5a48, 0x5a6a7a, 0x7a6a5a, 0x4a4a52];

/** A block is the rectangle between two neighbouring roads. */
function blockRects() {
  const rects = [];
  for (let i = 0; i < ROADS_X.length - 1; i += 1) {
    for (let j = 0; j < ROADS_Z.length - 1; j += 1) {
      rects.push({
        x0: ROADS_X[i] + 11, x1: ROADS_X[i + 1] - 11,
        z0: ROADS_Z[j] + 11, z1: ROADS_Z[j + 1] - 11,
        cx: (ROADS_X[i] + ROADS_X[i + 1]) / 2,
        cz: (ROADS_Z[j] + ROADS_Z[j + 1]) / 2,
      });
    }
  }
  return rects;
}

export function buildCity(rand) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const parkedSpots = [];
  const rects = blockRects();

  for (const rect of rects) {
    const isPark = Math.abs(rect.cx) < 1 && Math.abs(rect.cz - 120) < 1;
    const isBeachBlock = rect.cz > 180;
    if (isPark) {
      for (let i = 0; i < 10; i += 1) {
        trees.push({
          x: range(rand, rect.x0 + 4, rect.x1 - 4),
          z: range(rand, rect.z0 + 4, rect.z1 - 4),
        });
      }
      continue;
    }
    if (isBeachBlock) continue;
    // One or two buildings per block, with a gap between them.
    const count = rand() < 0.55 ? 2 : 1;
    for (let b = 0; b < count; b += 1) {
      const w = range(rand, 16, 26);
      const d = range(rand, 14, 22);
      const h = range(rand, 8, 42);
      const bx = count === 1 ? rect.cx : rect.cx + (b === 0 ? -12 : 12);
      const bz = rect.cz + range(rand, -4, 4);
      buildings.push({
        x: bx, z: bz, w, d, h,
        color: pick(rand, BUILDING_COLORS),
        roof: pick(rand, ROOF_COLORS),
        windows: Math.floor(h / 3.2),
      });
    }
    // Palms along the block edge and lamps at two corners.
    for (let i = 0; i < 3; i += 1) {
      trees.push({
        x: range(rand, rect.x0 + 2, rect.x1 - 2),
        z: rect.z0 + 2 + rand() * 3,
      });
    }
    lamps.push({ x: rect.x0, z: rect.z0 }, { x: rect.x1, z: rect.z1 });
  }

  // Parked cars along a few roads, and cash pickups tucked around the map.
  const parked = [
    { x: -236, z: -140, angle: Math.PI / 2, type: 'sedan' },
    { x: -156, z: -100, angle: -Math.PI / 2, type: 'taxi' },
    { x: 84, z: -140, angle: Math.PI / 2, type: 'sedan' },
    { x: 164, z: 20, angle: -Math.PI / 2, type: 'van' },
    { x: -76, z: 100, angle: Math.PI / 2, type: 'sedan' },
    { x: 4, z: -100, angle: -Math.PI / 2, type: 'sports' },
    { x: 244, z: 60, angle: Math.PI / 2, type: 'sedan' },
    { x: -236, z: 140, angle: -Math.PI / 2, type: 'taxi' },
  ];
  for (const p of parked) parkedSpots.push(p);

  const pickups = [
    { x: -200, z: -100, kind: 'cash' }, { x: -120, z: 20, kind: 'cash' },
    { x: 40, z: -140, kind: 'cash' }, { x: 120, z: 100, kind: 'cash' },
    { x: -40, z: 140, kind: 'cash' }, { x: 200, z: -100, kind: 'cash' },
    { x: -160, z: 60, kind: 'cash' }, { x: 200, z: 140, kind: 'cash' },
    { x: 120, z: -140, kind: 'health' }, { x: -200, z: 100, kind: 'health' },
  ];

  return {
    buildings, trees, lamps, parkedSpots, pickups,
    spots: SPOTS, bounds: WORLD,
    // The beach and sea sit along the south edge, past the last road.
    beach: { z0: 196, z1: 224 },
  };
}

/** True when the point is inside a building footprint. */
export function buildingAt(city, x, z) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns true on a hit. */
export function collideBuildings(city, body) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x - b.w / 2, Math.min(body.x, b.x + b.w / 2));
    const nz = Math.max(b.z - b.d / 2, Math.min(body.z, b.z + b.d / 2));
    const dx = body.x - nx;
    const dz = body.z - nz;
    const d2 = dx * dx + dz * dz;
    const r = body.radius || 1;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        body.x = nx + (dx / d) * r;
        body.z = nz + (dz / d) * r;
      } else {
        body.x += r;
      }
    }
  }
  return hit;
}

/** Nearest road centre line to a point, used by the traffic autopilot. */
export function nearestRoadX(x) {
  return ROADS_X.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
}

export function nearestRoadZ(z) {
  return ROADS_Z.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
}
