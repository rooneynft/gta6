// The story of Vice Shores: eight missions for Dante "Dagger" Cole, run in
// order for the fixer Mara Quinn. Each mission is a short list of steps —
// reach a place, steal a car, defeat rivals, buy from the shop, grab the
// cash — and each pays out when its last step is done.

import { SPOTS } from './config.js';

export const MISSION_COUNT = 8;

export const MISSIONS = [
  {
    title: 'First Wheels', brief: 'Mara needs wheels. Steal a car, then bring it to her garage.',
    reward: 300,
    steps: [
      { type: 'stealCar', objective: 'Steal a car — walk up to one and press E' },
      { type: 'goto', spot: 'garage', objective: "Drive to Mara's Garage" },
    ],
  },
  {
    title: 'Courier Run', brief: 'Three drops, one afternoon. The clients do not wait.',
    reward: 450,
    steps: [
      { type: 'gotoMulti', spots: ['docks', 'shop', 'hospital'], timer: 180, objective: 'Deliver the packages' },
    ],
  },
  {
    title: 'Dockside Payback', brief: 'The Harbor Kings shorted Mara. Settle it at the docks.',
    reward: 600, grantsPistol: true,
    steps: [
      { type: 'goto', spot: 'docks', objective: 'Go to the Sunset Docks' },
      { type: 'defeat', count: 4, spawnAt: 'docks', objective: 'Deal with the Harbor Kings (4 left)' },
    ],
  },
  {
    title: 'Hot Wheels', brief: 'A gold Comet GT is parked downtown. Take it, lose the heat, hide it.',
    reward: 800,
    steps: [
      { type: 'stealSports', objective: 'Steal the gold Comet GT downtown' },
      { type: 'goto', spot: 'hideout', objective: 'Deliver the Comet to the Hideout' },
    ],
  },
  {
    title: 'Vice Supplies', brief: 'Mara wants you patched up before the big jobs. Buy a medkit.',
    reward: 500,
    steps: [
      { type: 'goto', spot: 'shop', objective: 'Go to Vice Supplies' },
      { type: 'buy', kind: 'health', objective: 'Buy a medkit at Vice Supplies (press E, then buy)' },
    ],
  },
  {
    title: 'Three Packages', brief: 'Three stashes, three corners of the city. Collect them all.',
    reward: 700,
    steps: [
      { type: 'collect', spots: ['park', 'bank', 'pier'], objective: 'Collect the stashes' },
    ],
  },
  {
    title: 'The Getaway', brief: 'The PD is on you. Lose them and reach the hideout.',
    reward: 1000, setWanted: 3,
    steps: [
      { type: 'escape', spot: 'hideout', objective: 'Reach the Hideout with the PD on your tail' },
    ],
  },
  {
    title: 'The Meridian Job', brief: 'The bank. The vault. The whole city watching. Then vanish.',
    reward: 1500,
    steps: [
      { type: 'goto', spot: 'bank', objective: 'Go to Meridian Bank' },
      { type: 'grab', objective: 'Grab the cash — hold E at the bank' },
      { type: 'escape', spot: 'hideout', objective: 'Escape to the Hideout' },
    ],
  },
];

export function startMission(world, index) {
  const def = MISSIONS[index];
  world.mission = {
    index, step: 0, def, status: 'active',
    timer: def.steps[0].timer || 0, subIndex: 0, grabProgress: 0,
    spawned: false,
  };
  if (def.grantsPistol && !world.player.hasPistol) {
    world.player.hasPistol = true;
    world.player.ammo = Math.max(world.player.ammo, 24);
  }
  if (def.setWanted) world.setWanted(def.setWanted, 'the job');
  updateMissionObjective(world);
  world.banner = { text: `Mission ${index + 1}: ${def.title}`, sub: def.brief, kind: 'mission', until: world.elapsed + 4 };
}

export function updateMissionObjective(world) {
  const m = world.mission;
  if (!m || m.status !== 'active') return;
  const step = m.def.steps[m.step];
  m.objective = step.objective;
  m.marker = markerForStep(world, step, m);
  if (step.type === 'defeat') {
    const left = world.rivals.filter((r) => r.alive).length;
    m.objective = `Deal with the Harbor Kings (${left} left)`;
  }
  if (step.type === 'gotoMulti' || step.type === 'collect') {
    const spots = step.spots;
    const next = spots[m.subIndex];
    m.objective = `${step.objective} (${m.subIndex}/${spots.length}) — next: ${SPOTS[next].label}`;
    m.marker = SPOTS[next];
  }
  if (step.type === 'escape') m.marker = SPOTS[step.spot];
}

function markerForStep(world, step, m) {
  if (step.type === 'goto' || step.type === 'escape') return SPOTS[step.spot];
  if (step.type === 'defeat') return SPOTS[step.spawnAt];
  if (step.type === 'gotoMulti' || step.type === 'collect') return SPOTS[step.spots[m.subIndex]];
  if (step.type === 'grab') return SPOTS.bank;
  if (step.type === 'stealSports') return { x: 4, z: -100, label: 'Comet GT' };
  return null;
}

function advanceStep(world) {
  const m = world.mission;
  m.step += 1;
  m.subIndex = 0;
  m.grabProgress = 0;
  m.spawned = false;
  if (m.step >= m.def.steps.length) {
    completeMission(world);
    return;
  }
  m.timer = m.def.steps[m.step].timer || 0;
  updateMissionObjective(world);
}

function completeMission(world) {
  const m = world.mission;
  m.status = 'done';
  world.player.cash += m.def.reward;
  world.audio.cash();
  world.audio.missionDone();
  world.banner = {
    text: `Mission complete: ${m.def.title}`,
    sub: `+$${m.def.reward} — next job incoming`,
    kind: 'good', until: world.elapsed + 4,
  };
  world.setWanted(0, 'clean getaway');
  world.saveSoon = true;
  if (m.index + 1 >= MISSION_COUNT) {
    world.storyDone = true;
    world.screen = 'win';
    return;
  }
  // The next job starts after a short in-game breather, not a wall-clock
  // timer, so staged scenes never jump ahead while a frame is loading.
  world.pendingMissionIndex = m.index + 1;
  world.pendingMissionAt = world.elapsed + 2;
}

function failMission(world, reason) {
  const m = world.mission;
  if (!m || m.status !== 'active') return;
  m.status = 'failed';
  world.audio.missionFail();
  world.banner = { text: `Mission failed: ${m.def.title}`, sub: reason, kind: 'bad', until: world.elapsed + 4 };
  world.pendingMissionIndex = m.index;
  world.pendingMissionAt = world.elapsed + 2;
}

export function resetMission(world) {
  if (!world.mission) return;
  startMission(world, world.mission.index);
}

/** Advance the active mission one frame; call from the world step. */
export function stepMission(world, input, dt) {
  const m = world.mission;
  if (!m) return;
  if (m.status !== 'active') {
    // A finished mission hands over to the next one after its breather.
    if (world.pendingMissionIndex != null && world.elapsed >= world.pendingMissionAt
      && !world.holdMission) {
      const next = world.pendingMissionIndex;
      world.pendingMissionIndex = null;
      startMission(world, next);
    }
    return;
  }
  const step = m.def.steps[m.step];
  const p = world.player;

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(world, 'Out of time');
      return;
    }
  }

  const near = (spot, dist) =>
    Math.hypot(p.x - spot.x, p.z - spot.z) < dist;

  switch (step.type) {
    case 'stealCar':
      if (p.car) advanceStep(world);
      break;
    case 'stealSports':
      if (p.car && p.car.type === 'sports') {
        world.setWanted(2, 'grand theft auto');
        advanceStep(world);
      }
      break;
    case 'goto':
      if (near(SPOTS[step.spot], 10)) advanceStep(world);
      break;
    case 'gotoMulti': {
      const spot = SPOTS[step.spots[m.subIndex]];
      if (near(spot, 9)) {
        world.audio.pickup();
        m.subIndex += 1;
        if (m.subIndex >= step.spots.length) advanceStep(world);
        else updateMissionObjective(world);
      }
      break;
    }
    case 'collect': {
      const spot = SPOTS[step.spots[m.subIndex]];
      if (near(spot, 8)) {
        world.player.cash += 50;
        world.audio.pickup();
        m.subIndex += 1;
        if (m.subIndex >= step.spots.length) advanceStep(world);
        else updateMissionObjective(world);
      }
      break;
    }
    case 'defeat': {
      if (!m.spawned) {
        world.spawnRivals(SPOTS[step.spawnAt], step.count);
        m.spawned = true;
      }
      const left = world.rivals.filter((r) => r.alive).length;
      updateMissionObjective(world);
      if (left === 0) advanceStep(world);
      break;
    }
    case 'buy':
      if (world.shopBought === step.kind) {
        world.shopBought = null;
        advanceStep(world);
      }
      break;
    case 'grab': {
      if (near(SPOTS.bank, 8) && input.held('action')) {
        m.grabProgress += dt;
        if (m.grabProgress >= 2.5) {
          world.setWanted(4, 'bank robbery');
          advanceStep(world);
        }
      } else {
        m.grabProgress = Math.max(0, m.grabProgress - dt * 2);
      }
      break;
    }
    case 'escape':
      if (near(SPOTS[step.spot], 10)) advanceStep(world);
      break;
    default:
      break;
  }
}
