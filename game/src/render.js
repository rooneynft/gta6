// Drawing only: the world's state and the current screen in, pixels out. A 1280x720
// camera view follows the player through the 3200x2400 city; the HUD (money, health,
// wanted stars, mission tracker, speed, minimap) is drawn in screen space on top.
// Flat shapes, warm sun-soaked colours, canvas text. Nothing here allocates per frame
// except short strings.
import { CANAL, CAR, FONT, MISSIONS, PALETTE, PARK, ROADS_H, ROADS_V, ROAD_W, SHORE, VIEW, WORLD, WANTED_MAX } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = { x: VIEW.width - 216, y: 16, w: 200, h: 150 };

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align, baseline) {
    if (!fonts.has(`p${size}`)) fonts.set(`p${size}`, `${size}px ${FONT}`);
    context.font = fonts.get(`p${size}`);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    context.beginPath();
    if (typeof context.roundRect === 'function') context.roundRect(x, y, w, h, r);
    else context.rect(x, y, w, h);
    context.fill();
  }

  function wrapLines(value, maxWidth, size) {
    if (!fonts.has(`p${size}`)) fonts.set(`p${size}`, `${size}px ${FONT}`);
    context.font = fonts.get(`p${size}`);
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---- world drawing (camera space) ----

  function drawGround() {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Beach sand and ocean along the south edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, SHORE.sandY0, WORLD.width, SHORE.waterY0 - SHORE.sandY0);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, SHORE.waterY0, WORLD.width, WORLD.height - SHORE.waterY0);
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(0, SHORE.waterY0 + 46, WORLD.width, WORLD.height - SHORE.waterY0 - 46);
    // Canal.
    context.fillStyle = PALETTE.water;
    context.fillRect(0, CANAL.y0, WORLD.width, CANAL.y1 - CANAL.y0);
    // Park.
    context.fillStyle = PALETTE.grassDark;
    context.fillRect(PARK.x0, PARK.y0, PARK.x1 - PARK.x0, PARK.y1 - PARK.y0);
    context.fillStyle = PALETTE.parkPath;
    context.fillRect(PARK.x0 + (PARK.x1 - PARK.x0) / 2 - 14, PARK.y0, 28, PARK.y1 - PARK.y0);
    context.fillRect(PARK.x0, PARK.y0 + (PARK.y1 - PARK.y0) / 2 - 14, PARK.x1 - PARK.x0, 28);
    // Park pond.
    context.fillStyle = PALETTE.water;
    context.beginPath();
    context.ellipse(1300, 700, 130, 75, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.waterDeep;
    context.beginPath();
    context.ellipse(1300, 700, 96, 52, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawRoads() {
    // Sidewalks.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_V) context.fillRect(rx - ROAD_W / 2 - 14, 0, ROAD_W + 28, WORLD.height);
    for (const ry of ROADS_H) context.fillRect(0, ry - ROAD_W / 2 - 14, WORLD.width, ROAD_W + 28);
    // Asphalt.
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS_V) context.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROADS_H) context.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    // Water over the road where the canal cuts it (bridges redrawn below).
    context.fillStyle = PALETTE.water;
    for (const rx of ROADS_V) context.fillRect(rx - ROAD_W / 2, CANAL.y0, ROAD_W, CANAL.y1 - CANAL.y0);
    // Lane dashes.
    context.fillStyle = PALETTE.lane;
    for (const rx of ROADS_V) {
      for (let y = 20; y < WORLD.height; y += 56) {
        if (y > CANAL.y0 - 40 && y < CANAL.y1 + 20) continue;
        context.fillRect(rx - 3, y, 6, 28);
      }
    }
    for (const ry of ROADS_H) {
      for (let x = 20; x < WORLD.width; x += 56) context.fillRect(x, ry - 3, 28, 6);
    }
    // Bridges over the canal.
    for (const rx of ROADS_V) {
      context.fillStyle = PALETTE.road;
      context.fillRect(rx - ROAD_W / 2, CANAL.y0 - 6, ROAD_W, CANAL.y1 - CANAL.y0 + 12);
      context.fillStyle = PALETTE.roadEdge;
      context.fillRect(rx - ROAD_W / 2, CANAL.y0 - 6, 8, CANAL.y1 - CANAL.y0 + 12);
      context.fillRect(rx + ROAD_W / 2 - 8, CANAL.y0 - 6, 8, CANAL.y1 - CANAL.y0 + 12);
      context.fillStyle = PALETTE.lane;
      for (let y = CANAL.y0; y < CANAL.y1; y += 56) context.fillRect(rx - 3, y, 6, 28);
    }
    // Crosswalk stripes at the central intersections.
    context.fillStyle = 'rgba(244, 241, 232, 0.75)';
    for (const rx of ROADS_V) {
      for (const ry of ROADS_H) {
        for (let i = -3; i <= 3; i += 1) context.fillRect(rx + i * 16 - 5, ry - ROAD_W / 2 + 6, 10, 18);
      }
    }
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      context.fillStyle = 'rgba(0, 0, 0, 0.22)';
      context.fillRect(b.x + 7, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255, 255, 255, 0.16)';
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      context.fillStyle = 'rgba(0, 0, 0, 0.14)';
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
      if (b.pool) {
        context.fillStyle = PALETTE.water;
        context.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.5, b.w * 0.3, b.h * 0.32);
      } else if (b.detail === 1) {
        context.fillStyle = 'rgba(0, 0, 0, 0.25)';
        context.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.22, b.h * 0.22);
        context.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.6, b.w * 0.18, b.h * 0.18);
      } else if (b.detail === 2) {
        context.fillStyle = 'rgba(255, 255, 255, 0.28)';
        context.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, b.w * 0.4, b.h * 0.4);
      }
    }
  }

  function drawTrees(state) {
    for (const t of state.trees) {
      if (t.palm) {
        context.strokeStyle = '#8a6b46';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(t.x, t.y);
        context.lineTo(t.x + 4, t.y - 16);
        context.stroke();
        context.fillStyle = '#4e9b47';
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2;
          context.beginPath();
          context.ellipse(t.x + 4 + Math.cos(a) * 11, t.y - 16 + Math.sin(a) * 8, 12, 5, a, 0, Math.PI * 2);
          context.fill();
        }
      } else {
        context.fillStyle = '#6b4f2e';
        context.fillRect(t.x - 2, t.y - 2, 4, 8);
        context.fillStyle = '#3f7d3a';
        context.beginPath();
        context.arc(t.x, t.y - 8, 13, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#57a04e';
        context.beginPath();
        context.arc(t.x - 5, t.y - 12, 8, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawCar(car, time, isPlayerCar) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0, 0, 0, 0.28)';
    rr(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 8);
    // Wheels.
    context.fillStyle = '#14161c';
    context.fillRect(-16, -CAR.width / 2 - 2, 12, 5);
    context.fillRect(6, -CAR.width / 2 - 2, 12, 5);
    context.fillRect(-16, CAR.width / 2 - 3, 12, 5);
    context.fillRect(6, CAR.width / 2 - 3, 12, 5);
    // Body.
    context.fillStyle = car.wrecked ? '#3c3f46' : car.color;
    rr(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    if (car.kind === 'police') {
      context.fillStyle = '#14161c';
      context.fillRect(-6, -CAR.width / 2, 12, CAR.width);
      context.fillStyle = '#f4f1e8';
      context.fillRect(-CAR.length / 2, -CAR.width / 2, 10, CAR.width);
    }
    // Windshield and roof.
    context.fillStyle = 'rgba(20, 30, 46, 0.85)';
    context.fillRect(8, -CAR.width / 2 + 4, 8, CAR.width - 8);
    context.fillStyle = 'rgba(255, 255, 255, 0.22)';
    context.fillRect(-8, -CAR.width / 2 + 4, 12, CAR.width - 8);
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 3, 3, 5);
    context.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 8, 3, 5);
    // Police light bar, flashing.
    if (car.kind === 'police') {
      const phase = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = phase ? '#ff2e2e' : '#2e7bff';
      context.fillRect(-4, -CAR.width / 2 - 2, 8, 6);
      context.fillStyle = phase ? '#2e7bff' : '#ff2e2e';
      context.fillRect(-4, CAR.width / 2 - 4, 8, 6);
    }
    if (car.wrecked) {
      context.fillStyle = 'rgba(120, 120, 120, 0.5)';
      context.beginPath();
      context.arc(-8, -6, 12, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    if (isPlayerCar) {
      context.strokeStyle = 'rgba(46, 196, 182, 0.9)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(car.x, car.y, 34, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawPed(ped, isCop) {
    if (ped.down > 0) {
      context.fillStyle = isCop ? '#2f6fd0' : ped.color;
      context.save();
      context.translate(ped.x, ped.y);
      context.rotate(ped.angle + Math.PI / 2);
      context.beginPath();
      context.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
    context.beginPath();
    context.ellipse(ped.x + 2, ped.y + 3, 11, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = isCop ? '#2f6fd0' : ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    context.fill();
    if (isCop) {
      context.fillStyle = '#16233d';
      context.beginPath();
      context.arc(ped.x, ped.y - 2, 6, Math.PI, 0);
      context.fill();
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.inCar) return;
    if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) return;
    const bob = Math.sin(p.walkPhase) * 1.5;
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.beginPath();
    context.ellipse(p.x + 2, p.y + 4, 12, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x, p.y + bob * 0.4, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.arc(p.x, p.y + bob * 0.4, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 4, p.y + Math.sin(p.angle) * 4 + bob * 0.4, 6, 0, Math.PI * 2);
    context.fill();
    // Direction nose.
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 14, p.y + Math.sin(p.angle) * 14, 4, 0, Math.PI * 2);
    context.fill();
    // Punch swing.
    if (p.punchTimer > 0) {
      context.strokeStyle = '#f4f1e8';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(p.x, p.y, 26, p.angle - 0.7, p.angle + 0.7);
      context.stroke();
    }
    void time;
  }

  function drawMissionMarker(state) {
    const target = state._target;
    if (!target) return;
    const pulse = 1 + Math.sin(state.elapsed * 4) * 0.15;
    const x = target.x;
    const y = target.y;
    context.fillStyle = 'rgba(242, 201, 76, 0.25)';
    context.beginPath();
    context.arc(x, y, 46 * pulse, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.gold;
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    const s = 13 * pulse;
    context.fillRect(-s / 2, -s / 2, s, s);
    context.restore();
    context.strokeStyle = 'rgba(242, 201, 76, 0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 22 * pulse, 0, Math.PI * 2);
    context.stroke();
    text(target.label, x, y - 34, 17, PALETTE.gold, 'center');
  }

  function drawCashBags(state) {
    for (const bag of state.cashBags) {
      if (bag.taken) continue;
      const bob = Math.sin(state.elapsed * 3 + bag.x) * 2;
      context.fillStyle = '#2e7d32';
      rr(bag.x - 10, bag.y - 9 + bob, 20, 18, 5);
      context.fillStyle = PALETTE.gold;
      text('$', bag.x, bag.y + 6 + bob, 15, PALETTE.gold, 'center');
    }
  }

  function drawWorld(state, camera, time) {
    context.setTransform(view.scale, 0, 0, view.scale, view.x - camera.x * view.scale, view.y - camera.y * view.scale);
    drawGround();
    drawRoads();
    drawBuildings(state);
    drawTrees(state);
    drawCashBags(state);
    drawMissionMarker(state);
    for (const car of state.cars) {
      if (car.kind === 'player') continue;
      drawCar(car, time, false);
    }
    for (const ped of state.peds) drawPed(ped, false);
    for (const cop of state.footCops) drawPed(cop, true);
    const playerCar = state.player.inCar;
    if (playerCar) drawCar(playerCar, time, true);
    drawPlayer(state, time);
  }

  // ---- HUD (screen space, 1280x720) ----

  function drawHud(state, screen) {
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const p = state.player;
    const mission = state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;

    // Top-left: money + mission tracker.
    context.fillStyle = PALETTE.hudPanel;
    rr(16, 14, 350, 118, 10);
    text(`$ ${state.money.toLocaleString('en-US')}`, 30, 48, 30, PALETTE.gold, 'left');
    if (mission) {
      text(mission.title, 30, 74, 17, PALETTE.text, 'left');
      const lines = wrapLines(mission.text, 320, 13);
      for (let i = 0; i < Math.min(2, lines.length); i += 1) plainText(lines[i], 30, 94 + i * 15, 13, PALETTE.muted, 'left');
      if (mission.id === 'cash') plainText(`Bags ${state.bagsCollected}/5`, 30, 94 + Math.min(2, lines.length) * 15, 13, PALETTE.gold, 'left');
      if (mission.id === 'pickup' && state.passenger) plainText('Rico is riding with you', 30, 94 + Math.min(2, lines.length) * 15, 13, PALETTE.gold, 'left');
    } else {
      text('All missions complete!', 30, 74, 17, PALETTE.gold, 'left');
      plainText('Vice Shores is yours. Free roam!', 30, 94, 13, PALETTE.muted, 'left');
    }

    // Wanted stars, top-centre.
    const starW = 30;
    const starX0 = VIEW.width / 2 - (WANTED_MAX * starW) / 2;
    for (let i = 0; i < WANTED_MAX; i += 1) {
      text('★', starX0 + i * starW + 15, 46, 30, i < state.wanted ? PALETTE.starOn : PALETTE.starOff, 'center');
    }
    if (state.wanted > 0) plainText('WANTED', VIEW.width / 2, 66, 13, '#ff8a7a', 'center');

    // Minimap, top-right.
    const mm = MINIMAP;
    const sx = mm.w / WORLD.width;
    const sy = mm.h / WORLD.height;
    context.fillStyle = PALETTE.minimapBg;
    rr(mm.x - 4, mm.y - 4, mm.w + 8, mm.h + 8, 8);
    context.save();
    context.beginPath();
    context.rect(mm.x, mm.y, mm.w, mm.h);
    context.clip();
    context.fillStyle = PALETTE.grass;
    context.fillRect(mm.x, mm.y, mm.w, mm.h);
    context.fillStyle = PALETTE.water;
    context.fillRect(mm.x, mm.y + SHORE.waterY0 * sy, mm.w, (WORLD.height - SHORE.waterY0) * sy);
    context.fillRect(mm.x, mm.y + CANAL.y0 * sy, mm.w, (CANAL.y1 - CANAL.y0) * sy);
    context.fillStyle = PALETTE.grassDark;
    context.fillRect(mm.x + PARK.x0 * sx, mm.y + PARK.y0 * sy, (PARK.x1 - PARK.x0) * sx, (PARK.y1 - PARK.y0) * sy);
    context.strokeStyle = '#565c6b';
    context.lineWidth = 2;
    for (const rx of ROADS_V) {
      context.beginPath();
      context.moveTo(mm.x + rx * sx, mm.y);
      context.lineTo(mm.x + rx * sx, mm.y + mm.h);
      context.stroke();
    }
    for (const ry of ROADS_H) {
      context.beginPath();
      context.moveTo(mm.x, mm.y + ry * sy);
      context.lineTo(mm.x + mm.w, mm.y + ry * sy);
      context.stroke();
    }
    const target = state._target;
    if (target) {
      context.fillStyle = PALETTE.gold;
      context.save();
      context.translate(mm.x + target.x * sx, mm.y + target.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    if (mission && mission.id === 'cash') {
      context.fillStyle = '#58d68d';
      for (const bag of state.cashBags) {
        if (!bag.taken) context.fillRect(mm.x + bag.x * sx - 2, mm.y + bag.y * sy - 2, 4, 4);
      }
    }
    context.fillStyle = '#ff5a4e';
    for (const car of state.cars) {
      if (car.kind === 'police') context.fillRect(mm.x + car.x * sx - 2, mm.y + car.y * sy - 2, 4, 4);
    }
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(mm.x + p.x * sx, mm.y + p.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(mm.x + p.x * sx, mm.y + p.y * sy, 6, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    context.fillStyle = PALETTE.minimapBg;
    rr(mm.x + mm.w / 2 - 52, mm.y + mm.h + 4, 104, 18, 9);
    plainText('VICE SHORES', mm.x + mm.w / 2, mm.y + mm.h + 17, 11, PALETTE.muted, 'center');

    // Bottom-left: health bar.
    context.fillStyle = PALETTE.hudPanel;
    rr(16, VIEW.height - 52, 220, 36, 8);
    plainText('HEALTH', 28, VIEW.height - 28, 12, PALETTE.muted, 'left');
    context.fillStyle = '#222835';
    rr(92, VIEW.height - 40, 128, 12, 6);
    context.fillStyle = p.health > 35 ? PALETTE.health : PALETTE.healthLow;
    rr(92, VIEW.height - 40, Math.max(0, 128 * p.health / 100), 12, 6);

    // Bottom-right: speed or nearby-car hint.
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.24);
      context.fillStyle = PALETTE.hudPanel;
      rr(VIEW.width - 216, VIEW.height - 52, 200, 36, 8);
      text(`${mph}`, VIEW.width - 96, VIEW.height - 18, 26, PALETTE.text, 'right');
      plainText('mph', VIEW.width - 88, VIEW.height - 22, 13, PALETTE.muted, 'left');
      plainText('E — exit car', VIEW.width - 200, p.inCar.hp < 100 ? VIEW.height - 78 : VIEW.height - 62, 12, PALETTE.muted, 'right');
      if (p.inCar.hp < 100) {
        context.fillStyle = '#222835';
        rr(VIEW.width - 216, VIEW.height - 66, 200, 6, 3);
        context.fillStyle = p.inCar.hp > 35 ? '#f2c94c' : '#e5534b';
        rr(VIEW.width - 216, VIEW.height - 66, Math.max(0, 200 * p.inCar.hp / 100), 6, 3);
      }
    } else {
      let near = null;
      let bestD = 58;
      for (const car of state.cars) {
        if (car.kind !== 'parked' && car.kind !== 'traffic') continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < bestD) { bestD = d; near = car; }
      }
      if (near) {
        context.fillStyle = PALETTE.hudPanel;
        rr(VIEW.width - 236, VIEW.height - 52, 220, 36, 8);
        text('E — get in the car', VIEW.width - 126, VIEW.height - 27, 17, PALETTE.gold, 'center');
      }
    }

    // Mission toast, centre-top.
    if (state.toastText && state.elapsed < state.toastUntil) {
      const tw = 460;
      context.fillStyle = PALETTE.panel;
      rr(VIEW.width / 2 - tw / 2, 78, tw, 40, 10);
      text(state.toastText, VIEW.width / 2, 106, 19, PALETTE.gold, 'center');
    }

    // Controls hint, bottom-centre.
    if (screen === SCREEN_PLAY) {
      plainText('WASD / arrows — move & drive · E — enter / exit car · Space — punch · P — pause · M — mute', VIEW.width / 2, VIEW.height - 12, 12, 'rgba(244, 241, 232, 0.55)', 'center');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34 + 70;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    rr(x, y, width, height, 14);
    context.strokeStyle = accent || 'rgba(242, 201, 76, 0.5)';
    context.lineWidth = 2;
    context.beginPath();
    context.rect(x, y, width, height);
    context.stroke();
    text(title, VIEW.width / 2, y + 78, 52, accent === '#e5534b' ? '#ff6b5e' : PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      plainText(lines[index], VIEW.width / 2, y + 128 + index * 34, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 36, 22, PALETTE.gold, 'center');
  }

  /** Paint one frame: the city through the camera, then the HUD or a panel for the screen. */
  function draw(state, screen, best, target) {
    state._target = target || null;
    const time = state.elapsed;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    let camera;
    if (screen === SCREEN_TITLE) {
      camera = {
        x: clamp(1600 + Math.sin(time * 0.07) * 500 - VIEW.width / 2, 0, WORLD.width - VIEW.width),
        y: clamp(1200 + Math.cos(time * 0.05) * 300 - VIEW.height / 2, 0, WORLD.height - VIEW.height),
      };
    } else {
      camera = {
        x: clamp(state.player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width),
        y: clamp(state.player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height),
      };
    }
    drawWorld(state, camera, time);
    if (screen === SCREEN_TITLE) {
      context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
      context.fillStyle = 'rgba(10, 14, 24, 0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('VICE SHORES', [
        'An open-world crime story in a sun-soaked coastal city.',
        'Steal cars, dodge the cops, run five missions, own the streets.',
        `WASD — move & drive · E — enter car · Space — punch`,
        `Best haul: $ ${best.toLocaleString('en-US')}`,
      ], 'Press Space or click to start');
      return;
    }
    drawHud(state, screen);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The streets will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const missionsDone = state.missionIndex;
      drawPanel('BUSTED', [
        `The Vice Shores police finally caught up with you.`,
        `Money: $ ${state.money.toLocaleString('en-US')} · Missions done: ${missionsDone} / ${MISSIONS.length}`,
        `Best haul: $ ${best.toLocaleString('en-US')}`,
      ], 'Press Space or click to play again', '#e5534b');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
