// A tiny seeded random generator, so the city, traffic and screenshot
// scenes come out the same from the same seed.

export function makeRandom(seed) {
  let state = seed >>> 0 || 1;
  return function rand() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

export function range(rand, min, max) {
  return min + rand() * (max - min);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function distance(x1, z1, x2, z2) {
  return Math.hypot(x2 - x1, z2 - z1);
}
