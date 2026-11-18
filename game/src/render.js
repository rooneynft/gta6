// The renderer: one canvas, one camera. It paints the city (water, beach,
// roads, parks, buildings, docks), every car, pedestrian, cop and rival, the
// mission marker, particles and pickups, then the HUD with its minimap, and
// the title, pause, game-over and win screens.

import { PALETTE, VIEW, WANTED_MAX } from './config.js';
import { ROADS_H, ROADS_V, ROAD_W, WATER_Y, WORLD, districtAt } from './city.js';
import { MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const len = 46;
  const wid = 22;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 8);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.wreck > 0 ? '#3a3844' : car.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 8);
  ctx.fill();
  if (car.wreck <= 0) {
    // Windshield and roof.
    ctx.fillStyle = 'rgba(20,24,38,0.85)';
    roundRect(ctx, -6, -wid / 2 + 3, 16, wid - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, -len / 2 + 4, -wid / 2 + 3, 6, wid - 6, 3);
    ctx.fill();
    // Headlights.
    ctx.fillStyle = '#fff7c0';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 4);
    ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 4);
    if (car.kind === 'police') {
      ctx.fillStyle = '#f2f2f2';
      roundRect(ctx, -len / 2 + 8, -wid / 2 + 2, 12, wid - 4, 4);
      ctx.fill();
      // Flashing light bar.
      const on = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = on ? '#ff2e2e' : '#2b5cff';
      ctx.fillRect(-4, -wid / 2 + 1, 8, 5);
      ctx.fillStyle = on ? '#2b5cff' : '#ff2e2e';
      ctx.fillRect(-4, wid / 2 - 6, 8, 5);
    }
    if (car.sports) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GT', 0, 3);
    }
  } else {
    // Smoke from a wreck.
    ctx.fillStyle = 'rgba(120,120,130,0.5)';
    ctx.beginPath();
    ctx.arc(-8, -4, 8 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const bob = ped.state === 'flee' ? Math.sin(time * 14) * 2 : Math.sin(time * 6) * 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 + bob * 0.3, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWorld(ctx, world, time) {
  const cam = world.camera;
  const shakeX = world.shake > 0 ? (world.rand() - 0.5) * world.shake * 24 : 0;
  const shakeY = world.shake > 0 ? (world.rand() - 0.5) * world.shake * 24 : 0;
  const vx = cam.x - VIEW.width / 2 + shakeX;
  const vy = cam.y - VIEW.height / 2 + shakeY;
  ctx.save();
  ctx.translate(-vx, -vy);

  // Ground: sand base, grass blocks, water at the south.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(vx - 40, vy - 40, VIEW.width + 80, VIEW.height + 80);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(vx - 40, Math.max(vy - 40, WATER_Y), VIEW.width + 80, VIEW.height + 80);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(vx - 40, Math.max(vy - 40, WATER_Y), VIEW.width + 80, 60);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    const wy = WATER_Y + 14 + i * 16 + Math.sin(time * 1.5 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(vx - 40, wy);
    ctx.lineTo(vx + VIEW.width + 40, wy);
    ctx.stroke();
  }
  // Grass blocks between roads.
  ctx.fillStyle = PALETTE.grass;
  for (let vi = 0; vi < ROADS_V.length - 1; vi += 1) {
    for (let hi = 0; hi < ROADS_H.length - 1; hi += 1) {
      const x0 = ROADS_V[vi] + ROAD_W / 2;
      const x1 = ROADS_V[vi + 1] - ROAD_W / 2;
      const y0 = ROADS_H[hi] + ROAD_W / 2;
      const y1 = Math.min(ROADS_H[hi + 1] - ROAD_W / 2, WATER_Y);
      if (y1 > y0 && x1 > x0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  // Parks.
  for (const park of world.city.parks) {
    ctx.fillStyle = PALETTE.parkGrass;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.strokeStyle = '#5d8a44';
    ctx.lineWidth = 3;
    ctx.strokeRect(park.x, park.y, park.w, park.h);
  }
  for (const tree of world.city.trees) {
    ctx.fillStyle = '#3f7d3a';
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5da244';
    ctx.beginPath();
    ctx.arc(tree.x - 2, tree.y - 2, tree.r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sidewalks and roads.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of ROADS_V) ctx.fillRect(rx - ROAD_W / 2 - 10, vy - 40, ROAD_W + 20, VIEW.height + 80);
  for (const ry of ROADS_H) ctx.fillRect(vx - 40, ry - ROAD_W / 2 - 10, VIEW.width + 80, ROAD_W + 20);
  ctx.fillStyle = PALETTE.road;
  for (const rx of ROADS_V) ctx.fillRect(rx - ROAD_W / 2, vy - 40, ROAD_W, VIEW.height + 80);
  for (const ry of ROADS_H) ctx.fillRect(vx - 40, ry - ROAD_W / 2, VIEW.width + 80, ROAD_W);
  // Lane dashes.
  ctx.strokeStyle = PALETTE.lane;
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 26]);
  for (const rx of ROADS_V) {
    ctx.beginPath();
    ctx.moveTo(rx, vy - 40);
    ctx.lineTo(rx, vy + VIEW.height + 40);
    ctx.stroke();
  }
  for (const ry of ROADS_H) {
    ctx.beginPath();
    ctx.moveTo(vx - 40, ry);
    ctx.lineTo(vx + VIEW.width + 40, ry);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Docks: piers and containers.
  ctx.fillStyle = '#8a7a5a';
  ctx.fillRect(2960, 300, 60, 300);
  ctx.fillRect(2960, 900, 60, 300);
  ctx.fillRect(2960, 1500, 60, 300);
  for (const c of world.city.containers) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.restore();
  }
  // Buildings with shadows and roof detail.
  for (const b of world.city.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = PALETTE.buildingWall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    if (b.tall) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, 10);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let wx = b.x + 14; wx < b.x + b.w - 10; wx += 26) {
      for (let wy = b.y + 16; wy < b.y + b.h - 10; wy += 24) {
        ctx.fillRect(wx, wy, 10, 8);
      }
    }
  }
  // Mission marker: pulsing diamond + beam.
  const marker = world.mission.marker;
  if (marker) {
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.fillStyle = 'rgba(255,210,63,0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, 46 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(0, -52 * pulse);
    ctx.lineTo(10, -34 * pulse);
    ctx.lineTo(-10, -34 * pulse);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Pickups.
  for (const p of world.combat.pickups) {
    const bob = Math.sin(p.bob * 3) * 3;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    if (p.kind === 'cash') {
      ctx.fillStyle = PALETTE.cash;
      roundRect(ctx, -12, -8, 24, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#1d5c2e';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    } else if (p.kind === 'health') {
      ctx.fillStyle = '#fff';
      roundRect(ctx, -11, -11, 22, 22, 5);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
    } else if (p.kind === 'pistol') {
      ctx.fillStyle = '#222';
      roundRect(ctx, -12, -5, 24, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(6, -8, 5, 8);
    }
    ctx.restore();
  }
  // Pedestrians, rivals, officers, traffic, police, player.
  for (const ped of world.peds) drawPed(ctx, ped, time);
  for (const rival of world.combat.rivals) {
    drawPed(ctx, { ...rival, color: PALETTE.rival, state: 'walk' }, time);
    ctx.fillStyle = '#c9184a';
    ctx.fillRect(rival.x - 14, rival.y - 24, 28 * (rival.hp / 3), 4);
  }
  for (const officer of world.police.officers) {
    drawPed(ctx, { ...officer, color: PALETTE.police, state: 'walk' }, time);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', officer.x, officer.y - 12);
  }
  for (const car of world.traffic) drawCarShape(ctx, car, time);
  for (const car of world.police.cars) drawCarShape(ctx, car, time);
  if (world.player.car) drawCarShape(ctx, world.player.car, time);
  else {
    const player = world.player;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (world.invulnerable > 0 && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(1, 4, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(Math.cos(player.angle) * 5, Math.sin(player.angle) * 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (player.hasPistol) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(player.angle) * 10, Math.sin(player.angle) * 10);
      ctx.lineTo(Math.cos(player.angle) * 22, Math.sin(player.angle) * 22);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Bullets and particles.
  for (const b of world.combat.bullets) {
    ctx.strokeStyle = '#ffe66d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const p of world.combat.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  return { vx, vy };
}

function drawMinimap(ctx, world) {
  const mw = 220;
  const mh = 165;
  const mx = VIEW.width - mw - 14;
  const my = VIEW.height - mh - 14;
  const sx = mw / WORLD.width;
  const sy = mh / WORLD.height;
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, mx, my, mw, mh, 4);
  ctx.clip();
  ctx.fillStyle = '#7fb069';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#2e8fa3';
  ctx.fillRect(mx, my + WATER_Y * sy, mw, mh - WATER_Y * sy);
  ctx.fillStyle = '#3a3844';
  for (const rx of ROADS_V) ctx.fillRect(mx + rx * sx - 2, my, 4, mh);
  for (const ry of ROADS_H) ctx.fillRect(mx, my + ry * sy, mw, 4);
  ctx.fillStyle = '#5d5468';
  for (const b of world.city.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  const marker = world.mission.marker;
  if (marker) {
    const pulse = 3 + Math.sin(world.time * 5) * 1.5;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(mx + marker.x * sx, my + marker.y * sy, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff2e2e';
  for (const car of world.police.cars) {
    ctx.beginPath();
    ctx.arc(mx + car.x * sx, my + car.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mx + world.player.x * sx, my + world.player.y * sy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(districtAt(world.player.x, world.player.y), mx, my - 10);
}

function drawHud(ctx, world) {
  const player = world.player;
  ctx.save();
  // Cash + health, top left.
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, 14, 14, 250, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#7ee081';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${player.cash.toLocaleString('en-US')}`, 28, 44);
  ctx.fillStyle = '#333';
  roundRect(ctx, 28, 54, 180, 12, 6);
  ctx.fill();
  ctx.fillStyle = player.hp > 30 ? '#7ee081' : '#ff5d5d';
  roundRect(ctx, 28, 54, 180 * (player.hp / 100), 12, 6);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(`HP ${Math.max(0, Math.ceil(player.hp))}`, 214, 64);
  // Wanted stars, top right.
  const heat = world.police.heat;
  ctx.fillStyle = PALETTE.hudPanel;
  roundRect(ctx, VIEW.width - 14 - 190, 14, 190, 44, 8);
  ctx.fill();
  for (let i = 0; i < WANTED_MAX; i += 1) {
    ctx.fillStyle = i < heat ? PALETTE.star : 'rgba(255,255,255,0.22)';
    ctx.font = '26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', VIEW.width - 176 + i * 34, 46);
  }
  // Mission objective, top centre.
  ctx.fillStyle = PALETTE.hudPanel;
  const obj = world.mission.objective;
  ctx.font = 'bold 14px system-ui, sans-serif';
  const objW = Math.min(560, ctx.measureText(obj).width + 32);
  roundRect(ctx, (VIEW.width - objW) / 2, 14, objW, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.textAlign = 'center';
  ctx.fillText(obj, VIEW.width / 2, 40);
  // Mission title + progress.
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const done = world.mission.done ? MISSIONS.length : world.mission.index;
  ctx.fillText(`MISSION ${done}/${MISSIONS.length}  •  ${world.mission.done ? 'STORY COMPLETE' : MISSIONS[world.mission.index].title}`, 16, VIEW.height - 16);
  // Speed when driving.
  if (player.car) {
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(ctx, 14, VIEW.height - 74, 130, 44, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${Math.round(Math.abs(player.car.speed) * 0.36)} km/h`, 26, VIEW.height - 44);
  }
  // Controls hint.
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('WASD drive/walk  •  E steal car  •  Click shoot  •  F punch  •  P pause  •  M mute', VIEW.width - 16, VIEW.height - 16);
  // Banner.
  if (world.mission.bannerTimer > 0) {
    ctx.globalAlpha = Math.min(1, world.mission.bannerTimer);
    ctx.fillStyle = 'rgba(20,18,30,0.85)';
    const bw = 640;
    roundRect(ctx, (VIEW.width - bw) / 2, 96, bw, 52, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(world.mission.banner, VIEW.width / 2, 129);
    ctx.globalAlpha = 1;
  }
  if (world.events.pickup) {
    ctx.fillStyle = '#7ee081';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(world.events.pickup, VIEW.width / 2, 180);
  }
  drawMinimap(ctx, world);
  ctx.restore();
}

function drawTitle(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(18, 14, 32, 0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('MERIDIAN HEAT', VIEW.width / 2, 210);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('An open-world crime story in Port Meridian', VIEW.width / 2, 252);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Dante "Dagger" Cole is out of prison. Mara Quinn has work.', VIEW.width / 2, 284);
  ctx.fillText('Steal cars. Outrun the Meridian PD. Pull off the Meridian Job.', VIEW.width / 2, 308);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('PRESS ENTER OR CLICK TO START', VIEW.width / 2, 380);
  if (world.saveExists) {
    ctx.fillStyle = '#7ee081';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('SAVE FOUND — press C to continue your story', VIEW.width / 2, 414);
  }
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('WASD walk / drive   •   E steal & enter cars   •   Mouse + click to shoot   •   F punch', VIEW.width / 2, 470);
  ctx.fillText('Space handbrake   •   P pause   •   M mute   •   Progress saves automatically', VIEW.width / 2, 494);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Five story missions  •  Wanted levels 1–5  •  Traffic, pedestrians, police chases', VIEW.width / 2, 540);
  ctx.fillText('Best: $' + (world.best || 0).toLocaleString('en-US'), VIEW.width / 2, 566);
  ctx.restore();
}

function drawPaused(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(18, 14, 32, 0.7)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText('PAUSED', VIEW.width / 2, 300);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('Press P or Esc to keep playing — your progress is saved.', VIEW.width / 2, 344);
  ctx.restore();
}

function drawOver(ctx, world, busted) {
  ctx.save();
  ctx.fillStyle = 'rgba(30, 8, 14, 0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5d5d';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(busted ? 'BUSTED!' : 'WASTED', VIEW.width / 2, 300);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(busted ? 'The Meridian PD caught up with Dagger.' : 'Dagger went down in Port Meridian.', VIEW.width / 2, 344);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(`Cash kept: $${world.player.cash.toLocaleString('en-US')}   •   Missions done: ${world.stats.missionsDone}/5`, VIEW.width / 2, 384);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('PRESS ENTER TO TRY AGAIN', VIEW.width / 2, 440);
  ctx.restore();
}

function drawWin(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(12, 26, 18, 0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ee081';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText('THE MERIDIAN JOB — DONE', VIEW.width / 2, 280);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Dagger and Mara split the vault. Port Meridian is yours now.', VIEW.width / 2, 326);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(`Total cash: $${world.player.cash.toLocaleString('en-US')}   •   Cars stolen: ${world.stats.carsStolen}   •   Rivals down: ${world.stats.kills}`, VIEW.width / 2, 366);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('KEEP CRUISING — FREE ROAM, OR PRESS ENTER TO PLAY AGAIN', VIEW.width / 2, 430);
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW.width * dpr;
    canvas.height = VIEW.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener('resize', fit);

  return {
    draw(world, screen, time) {
      ctx.clearRect(0, 0, VIEW.width, VIEW.height);
      drawWorld(ctx, world, time);
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(ctx, world);
      if (screen === SCREEN_TITLE) drawTitle(ctx, world);
      else if (screen === SCREEN_PAUSED) drawPaused(ctx);
      else if (screen === SCREEN_OVER) drawOver(ctx, world, world.wasBusted);
      else if (screen === SCREEN_WIN) drawWin(ctx, world);
    },
  };
}
