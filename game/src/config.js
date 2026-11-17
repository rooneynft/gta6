// Every tuning number, colour and mission in one place. Vice Shores is a top-down 2D
// open-world crime game: one big city (3200x2400 world units) drawn through a 1280x720
// camera view that follows the player. Everything is original: a fictional sun-soaked
// coastal city, its streets, cars, people and story are all invented here.

export const STEP = 1 / 60;

export const WORLD = { width: 3200, height: 2400 };
export const VIEW = { width: 1280, height: 720 };

/** Road centrelines. Vertical roads run the full height, horizontal roads the full width. */
export const ROADS_V = [400, 1000, 1600, 2200, 2800];
export const ROADS_H = [400, 1000, 1600, 2000];
export const ROAD_W = 120;

/** The canal cuts the city east-west; vertical roads cross it on bridges. */
export const CANAL = { y0: 1720, y1: 1880 };
/** The southern shore: sand, then open water to the bottom edge. */
export const SHORE = { sandY0: 2120, waterY0: 2240 };

/** The park block: between the 1000 and 1600 roads, between the 400 and 1000 roads. */
export const PARK = { x0: 1060, y0: 460, x1: 1540, y1: 940 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  health: 100,
  punchRange: 40,
  punchArc: 1.1,
  punchCooldown: 0.45,
};

export const CAR = {
  length: 48,
  width: 24,
  accel: 300,
  brake: 520,
  maxSpeed: 360,
  maxReverse: 130,
  turnRate: 2.6,
  drag: 0.55,
  health: 100,
};

export const TRAFFIC = { count: 14, speedMin: 110, speedMax: 175 };
export const PEDS = { count: 26, speedMin: 45, speedMax: 75 };

export const WANTED_MAX = 5;
/** Seconds with no police nearby before one star drops off. */
export const WANTED_DECAY_SECONDS = 7;
/** How far a cop has to be to count as "nearby" for the decay timer. */
export const WANTED_NEAR = 620;

/** Police car top speed and foot-cop speed; the player car is a little faster, so escapes are possible. */
export const POLICE = { carSpeed: 305, footSpeed: 252, ramDamage: 26, punchDamage: 12, punchInterval: 1.0 };

export const MISSIONS = [
  {
    id: 'wheels',
    title: '1 · Hot Wheels',
    text: 'Steal a car. Walk up to any parked car and press E.',
    reward: 150,
  },
  {
    id: 'parcel',
    title: '2 · Parcel Run',
    text: 'Drive the package to the Docks, south-east. Follow the yellow marker.',
    reward: 250,
    target: { x: 2680, y: 1970 },
    targetLabel: 'Docks',
  },
  {
    id: 'pickup',
    title: '3 · Pick Up Rico',
    text: 'Pick up Rico at the Park, then drop him at the Marina, south-west.',
    reward: 400,
    targetA: { x: 1300, y: 560 },
    targetB: { x: 700, y: 1970 },
    targetLabel: 'Rico',
  },
  {
    id: 'cash',
    title: '4 · Cash Grab',
    text: 'Collect 5 cash bags stashed around Vice Shores. Drive or walk over them.',
    reward: 500,
    bags: 5,
  },
  {
    id: 'heat',
    title: '5 · Lose the Heat',
    text: 'The whole force is on you. Shake the cops, then reach the Safehouse.',
    reward: 800,
    target: { x: 2200, y: 460 },
    targetLabel: 'Safehouse',
  },
];

export const SAVE_KEY = 'vice-shores.save.v1';
export const BEST_KEY = 'vice-shores.best.v1';
export const START_MONEY = 50;

export const PALETTE = {
  backdrop: '#0e1420',
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  parkPath: '#d9c9a3',
  sand: '#e8d29a',
  water: '#2fa8c9',
  waterDeep: '#1d7fa8',
  road: '#3a3f4a',
  roadEdge: '#565c6b',
  sidewalk: '#9aa0ad',
  lane: '#f2c94c',
  text: '#f4f1e8',
  muted: '#b9c0cc',
  gold: '#f2c94c',
  panel: 'rgba(16, 20, 32, 0.88)',
  hudPanel: 'rgba(16, 20, 32, 0.72)',
  health: '#58d68d',
  healthLow: '#e5534b',
  starOn: '#ffd94a',
  starOff: '#4a5060',
  player: '#2ec4b6',
  playerDark: '#1d8a80',
  cop: '#2f6fd0',
  minimapBg: 'rgba(10, 14, 24, 0.85)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
