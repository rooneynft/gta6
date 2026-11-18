// Vice Shores — tuning numbers and colours in one place. The city is a
// fixed 560 by 440 metre grid of roads and blocks; nothing below depends on
// the screen size, so the same world plays the same on any desktop window.

export const WORLD = { halfX: 280, halfZ: 220, roadWidth: 16, blockGap: 64 };

/** Road centre lines, east-west roads run along x, north-south along z. */
export const ROADS_X = [-240, -160, -80, 0, 80, 160, 240];
export const ROADS_Z = [-180, -120, -60, 0, 60, 120, 180];

/** Named places on the map; every mission marker points at one of these. */
export const SPOTS = {
  garage: { x: -240, z: -180, label: "Mara's Garage" },
  docks: { x: 240, z: 180, label: 'Sunset Docks' },
  bank: { x: 80, z: 0, label: 'Meridian Bank' },
  hideout: { x: -240, z: 180, label: 'Hideout' },
  shop: { x: 160, z: -60, label: 'Vice Supplies' },
  hospital: { x: -80, z: 180, label: 'Shores Hospital' },
  park: { x: 0, z: 120, label: 'Palm Park' },
  pier: { x: 0, z: 205, label: 'South Pier' },
};

export const PLAYER = {
  walkSpeed: 6, runSpeed: 9.5, radius: 0.7, maxHp: 100,
  punchDamage: 25, punchRange: 2.2, punchCooldown: 0.45,
};

export const CAR = {
  accel: 16, brake: 26, reverseMax: 9, drag: 0.55, steer: 1.9,
  radius: 2.1, maxHp: 100,
};

export const CAR_TYPES = {
  sedan: { maxSpeed: 23, color: 0x7a8a99, name: 'Sedan' },
  taxi: { maxSpeed: 25, color: 0xe8b93a, name: 'Taxi' },
  sports: { maxSpeed: 33, color: 0xd8a018, name: 'Comet GT' },
  van: { maxSpeed: 19, color: 0x5a7a5a, name: 'Van' },
  police: { maxSpeed: 30, color: 0x223344, name: 'PD Cruiser' },
};

export const WANTED = {
  maxStars: 5, decayIdleSeconds: 10, decayStepSeconds: 6,
  policeCarsPerStar: 1, heliAtStars: 3,
};

export const COMBAT = {
  pistolDamage: 34, pistolRange: 55, pistolCooldown: 0.28, pistolAmmoStart: 24,
  rivalHp: 68, rivalDamage: 7, rivalRange: 42, rivalShotCooldown: 1.1,
};

export const ECONOMY = {
  startCash: 50, pistolPrice: 250, ammoPrice: 50, ammoAmount: 24,
  healthPrice: 100, armorPrice: 150, pickupCash: 25,
};

export const RADIO_STATIONS = [
  { name: 'VICE 98.5', genre: 'Synthwave', bpm: 112, root: 57, scale: [0, 3, 5, 7, 10] },
  { name: 'ROCK 101', genre: 'Guitar Rock', bpm: 132, root: 45, scale: [0, 3, 5, 6, 7, 10] },
  { name: 'SUNSET 88.2', genre: 'Chill', bpm: 84, root: 60, scale: [0, 2, 4, 7, 9] },
];

export const PALETTE = {
  sky: 0x8ec8e8, sun: 0xfff2d8, ground: 0x6f9e5a, sand: 0xe8d29a,
  water: 0x2e7fa8, asphalt: 0x3a3f46, sidewalk: 0x9aa0a8,
  buildingGlass: 0x9fd4e8, text: '#f2ede4', muted: '#b9b2a4',
  accent: '#ffb03a', danger: '#e5534b', good: '#5ec97a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'vice-shores-v3-save';
export const SHOT_PARAM = 'shot';
