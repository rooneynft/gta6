// Every tuning number and colour in one place. The world is a fixed 3200x2400
// city; the renderer scales a 1280x720 view of it to the window, so no rule
// below depends on the screen size.

export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };
export const SAVE_KEY = 'meridian-heat.save.v1';

export const PLAYER = {
  speed: 195,
  radius: 13,
  hp: 100,
  punchRange: 34,
  punchDamage: 1,
  shootCooldown: 0.16,
  bulletSpeed: 780,
};

export const CAR = {
  accel: 430,
  brake: 760,
  reverseMax: 210,
  maxSpeed: 530,
  sportsMax: 680,
  steer: 2.75,
  drag: 0.55,
  length: 46,
  width: 22,
  hp: 12,
};

export const WANTED_MAX = 5;
export const HEAT_DECAY_SECONDS = 18;
export const HEAT_CRIME_WINDOW = 6;

export const PALETTE = {
  sand: '#e9c98d',
  grass: '#8fbf6a',
  parkGrass: '#79ad58',
  road: '#3a3844',
  roadEdge: '#2c2a35',
  sidewalk: '#cbb98f',
  lane: '#f5d76e',
  water: '#2e8fa3',
  waterDeep: '#1f6f84',
  buildingRoof: '#ff8a70',
  buildingRoof2: '#4ecdc4',
  buildingRoof3: '#ffe66d',
  buildingRoof4: '#b388eb',
  buildingRoof5: '#f4a261',
  buildingWall: '#5d5468',
  text: '#fff7e8',
  muted: '#d8c9a3',
  hudPanel: 'rgba(20, 18, 30, 0.72)',
  star: '#ffd23f',
  police: '#2b5cff',
  policeWhite: '#f2f2f2',
  player: '#ff5d8f',
  rival: '#c9184a',
  cash: '#7ee081',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const DISTRICTS = [
  { name: 'NORTH HILLS', x0: 0, y0: 0, x1: 3200, y1: 640 },
  { name: 'THE DOCKS', x0: 2640, y0: 0, x1: 3200, y1: 2240 },
  { name: 'DOWNTOWN', x0: 1040, y0: 640, x1: 1840, y1: 1440 },
  { name: 'SOUTH BEACH', x0: 0, y0: 1840, x1: 3200, y1: 2400 },
  { name: 'OLD PORT', x0: 0, y0: 640, x1: 1040, y1: 1840 },
  { name: 'SUNSET STRIP', x0: 1840, y0: 640, x1: 2640, y1: 1840 },
];

export const CAR_COLORS = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#e9c46a', '#6d6875', '#ffb703', '#8ecae6', '#b5838d', '#90be6d'];
