// Saving to localStorage: cash, mission progress, health, ammo and where
// the player was standing. A save is written after every mission and from
// the pause menu, and offered back as Continue on the title screen.

import { SAVE_KEY } from './config.js';

export function saveGame(world) {
  try {
    const data = {
      version: 3,
      cash: world.player.cash,
      hp: world.player.hp,
      armor: world.player.armor || 0,
      ammo: world.player.ammo,
      hasPistol: world.player.hasPistol,
      missionIndex: world.mission ? world.mission.index : 0,
      x: world.player.x,
      z: world.player.z,
      clockMinutes: world.clockMinutes,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 3) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* best effort */ }
}
