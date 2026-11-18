// The HUD: cash, health, wanted stars, the game clock, a live minimap,
// the mission tracker, the radio readout and the speedometer — all as DOM
// over the 3D canvas, so every system reads in a single screenshot.

import { ROADS_X, ROADS_Z } from './config.js';

export function grabHud() {
  const byId = (id) => document.getElementById(id);
  return {
    hud: byId('hud'),
    cash: byId('cash'),
    healthFill: byId('health-fill'),
    healthText: byId('health-text'),
    armorFill: byId('armor-fill'),
    armorRow: byId('armor-row'),
    stars: byId('stars'),
    clock: byId('clock'),
    minimap: byId('minimap'),
    speed: byId('speed'),
    speedUnit: byId('speed-unit'),
    radioName: byId('radio-name'),
    radioGenre: byId('radio-genre'),
    missionTitle: byId('mission-title'),
    missionObjective: byId('mission-objective'),
    missionReward: byId('mission-reward'),
    missionTimer: byId('mission-timer'),
    prompt: byId('prompt'),
    banner: byId('banner'),
    bannerTitle: byId('banner-title'),
    bannerSub: byId('banner-sub'),
    grabBar: byId('grab-bar'),
    grabFill: byId('grab-fill'),
  };
}

function formatClock(minutes) {
  const total = Math.floor(minutes) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function updateHud(world, els, audio) {
  const p = world.player;
  els.cash.textContent = `$${Math.floor(p.cash).toLocaleString('en-US')}`;
  els.healthFill.style.width = `${Math.max(0, p.hp)}%`;
  els.healthText.textContent = `${Math.ceil(p.hp)}`;
  els.armorRow.style.display = p.armor > 0 ? 'flex' : 'none';
  els.armorFill.style.width = `${Math.max(0, Math.min(100, p.armor))}%`;
  const stars = '★'.repeat(world.wanted) + '☆'.repeat(5 - world.wanted);
  els.stars.textContent = stars;
  els.stars.classList.toggle('hot', world.wanted > 0);
  els.clock.textContent = formatClock(world.clockMinutes);
  const kmh = Math.round(Math.abs(p.speed || 0) * 3.6);
  els.speed.textContent = p.car ? String(kmh) : '—';
  els.speedUnit.textContent = p.car ? 'km/h' : 'on foot';
  els.radioName.textContent = audio.stationName();
  els.radioGenre.textContent = audio.muted ? 'muted — M to unmute' : 'R to change station';

  const m = world.mission;
  if (m && m.status === 'active') {
    els.missionTitle.textContent = `Mission ${m.index + 1}/8 — ${m.def.title}`;
    els.missionObjective.textContent = m.objective || '';
    els.missionReward.textContent = `Reward $${m.def.reward}`;
    els.missionTimer.textContent = m.timer > 0 ? `${Math.ceil(m.timer)}s left` : '';
  } else if (world.storyDone) {
    els.missionTitle.textContent = 'Story complete';
    els.missionObjective.textContent = 'Vice Shores is yours. Free roam.';
    els.missionReward.textContent = '';
    els.missionTimer.textContent = '';
  } else {
    els.missionTitle.textContent = 'No active mission';
    els.missionObjective.textContent = '';
    els.missionReward.textContent = '';
    els.missionTimer.textContent = '';
  }

  // The context prompt: what E does right here, right now.
  let prompt = '';
  if (world.shopOpen) prompt = 'Shop open — click an item or press E to close';
  else if (world.nearShop) prompt = 'Press E — Vice Supplies';
  else if (world.nearCar) prompt = `Press E — Steal the ${world.nearCar.name}`;
  else if (p.car) prompt = 'Space — handbrake · E — get out';
  else if (m && m.status === 'active' && m.def.steps[m.step].type === 'grab') prompt = 'Hold E at the bank to grab the cash';
  else if (!p.hasPistol) prompt = 'WASD — move · Shift — run · E — enter car';
  els.prompt.textContent = prompt;
  els.prompt.style.display = prompt ? 'block' : 'none';

  // Grab progress bar for the bank job.
  if (m && m.status === 'active' && m.def.steps[m.step].type === 'grab' && m.grabProgress > 0) {
    els.grabBar.style.display = 'block';
    els.grabFill.style.width = `${Math.min(100, (m.grabProgress / 2.5) * 100)}%`;
  } else {
    els.grabBar.style.display = 'none';
  }

  // Banner: mission news, wanted news, shop news — newest wins.
  const b = world.banner;
  if (b && world.elapsed < b.until) {
    els.banner.style.display = 'block';
    els.bannerTitle.textContent = b.text;
    els.bannerSub.textContent = b.sub || '';
    els.banner.className = `banner ${b.kind || ''}`;
  } else {
    els.banner.style.display = 'none';
  }

  drawMinimap(world, els.minimap);
}

export function drawMinimap(world, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const scale = W / 560;
  const yOff = (H - 440 * scale) / 2;
  const X = (x) => (x + 280) * scale;
  const Z = (z) => (z + 220) * scale + yOff;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#20261f';
  ctx.fillRect(0, 0, W, H);
  // Beach and sea.
  ctx.fillStyle = '#c9b078';
  ctx.fillRect(0, Z(196), W, (224 - 196) * scale);
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(0, Z(212), W, (220 - 212) * scale);
  // Blocks.
  ctx.fillStyle = '#3d4a38';
  for (let i = 0; i < ROADS_X.length - 1; i += 1) {
    for (let j = 0; j < ROADS_Z.length - 1; j += 1) {
      ctx.fillRect(X(ROADS_X[i] + 11), Z(ROADS_Z[j] + 11),
        (ROADS_X[i + 1] - ROADS_X[i] - 22) * scale,
        (ROADS_Z[j + 1] - ROADS_Z[j] - 22) * scale);
    }
  }
  // Roads.
  ctx.strokeStyle = '#6a7078';
  ctx.lineWidth = 16 * scale;
  for (const rx of ROADS_X) {
    ctx.beginPath(); ctx.moveTo(X(rx), 0); ctx.lineTo(X(rx), H); ctx.stroke();
  }
  for (const rz of ROADS_Z) {
    ctx.beginPath(); ctx.moveTo(0, Z(rz)); ctx.lineTo(W, Z(rz)); ctx.stroke();
  }
  const dot = (x, z, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(X(x), Z(z), r, 0, Math.PI * 2); ctx.fill();
  };
  // Traffic and police.
  for (const car of world.cars) {
    if (car.isPlayerCar) continue;
    dot(car.x, car.z, car.isPolice ? '#4da3ff' : '#c9c9c9', car.isPolice ? 3.5 : 2);
  }
  for (const cop of world.police) {
    if (!cop.isPolice) dot(cop.x, cop.z, '#4da3ff', 3);
  }
  if (world.heli.active) dot(world.heli.x, world.heli.z, '#ff4d4d', 4);
  // Mission marker, pulsing.
  const marker = world.mission && world.mission.status === 'active' ? world.mission.marker : null;
  if (marker) {
    const pulse = 4 + Math.sin(world.elapsed * 4) * 1.5;
    ctx.fillStyle = '#ffb03a';
    ctx.beginPath();
    ctx.moveTo(X(marker.x), Z(marker.z) - pulse - 3);
    ctx.lineTo(X(marker.x) + pulse, Z(marker.z));
    ctx.lineTo(X(marker.x), Z(marker.z) + pulse + 3);
    ctx.lineTo(X(marker.x) - pulse, Z(marker.z));
    ctx.closePath();
    ctx.fill();
  }
  // The player: a white arrow pointing where they face.
  const p = world.player;
  ctx.save();
  ctx.translate(X(p.x), Z(p.z));
  ctx.rotate(Math.PI - p.angle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // North tick.
  ctx.fillStyle = '#e8e4d8';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('N', 6, 14);
}
