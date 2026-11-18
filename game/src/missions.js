// The story: five missions for the fixer Mara Quinn, then free roam. Each
// mission is a short chain of steps — go somewhere, steal something, fight
// someone, lose the heat — with a briefing, a live objective line, a map
// marker and a cash reward.

import { spawnCash, spawnHealth, spawnPistol, spawnRival } from './combat.js';
import { addHeat } from './police.js';

export const MISSIONS = [
  {
    id: 'wheels-up',
    title: '1 — WHEELS UP',
    briefing: 'Mara Quinn: "Dagger, you\'re out. I need wheels and a driver. Jack any car on the street and bring it to my garage."',
    reward: 150,
  },
  {
    id: 'courier',
    title: '2 — COURIER RUN',
    briefing: 'Mara: "Package job. Grab the parcel at the garage and run it to the Marina drop. Seventy-five seconds — the buyer doesn\'t wait."',
    reward: 300,
  },
  {
    id: 'payback',
    title: '3 — PAYBACK AT THE DOCKS',
    briefing: 'Mara: "The Harbor Kings taxed my crew. Four of their boys are drinking at the docks. Send a message — and bring back their cash."',
    reward: 600,
  },
  {
    id: 'hot-wheels',
    title: '4 — HOT WHEELS',
    briefing: 'Mara: "A Comet GT is parked on Meridian Ave — yellow, can\'t miss it. Take it, shake the heat, and stash it at the hideout."',
    reward: 500,
  },
  {
    id: 'meridian-job',
    title: '5 — THE MERIDIAN JOB',
    briefing: 'Mara: "The big one. Hit Meridian Bank, grab the vault cash, and get to the hideout. The whole PD will be on you. Make it count, Dagger."',
    reward: 2000,
  },
];

export function createMissionState() {
  return {
    index: 0,
    step: 0,
    timer: 0,
    objective: 'Meet Mara Quinn',
    marker: null,
    banner: '',
    bannerTimer: 0,
    done: false,
    rivalsSpawned: false,
    vaultTimer: 0,
    startCash: 0,
    failed: '',
  };
}

function setObjective(world, text, marker) {
  world.mission.objective = text;
  world.mission.marker = marker || null;
}

function showBanner(world, text) {
  world.mission.banner = text;
  world.mission.bannerTimer = 3.2;
}

function completeMission(world) {
  const m = MISSIONS[world.mission.index];
  world.player.cash += m.reward;
  world.stats.missionsDone += 1;
  showBanner(world, `MISSION COMPLETE — ${m.title}  +$${m.reward}`);
  world.audio.jingle();
  world.events.missionDone = m.title;
  world.mission.index += 1;
  world.mission.step = 0;
  world.mission.rivalsSpawned = false;
  if (world.mission.index >= MISSIONS.length) {
    world.mission.done = true;
    setObjective(world, 'Story complete — Port Meridian is yours. Free roam!', null);
    world.events.win = true;
  } else {
    startMission(world, world.mission.index);
  }
}

function failMission(world, reason) {
  const m = MISSIONS[world.mission.index];
  showBanner(world, `FAILED — ${reason}. Restarting: ${m.title}`);
  world.mission.failed = reason;
  world.events.missionFailed = reason;
  startMission(world, world.mission.index);
}

export function startMission(world, index) {
  const m = MISSIONS[index];
  const ms = world.mission;
  ms.index = index;
  ms.step = 0;
  ms.timer = 0;
  ms.rivalsSpawned = false;
  ms.vaultTimer = 0;
  ms.startCash = world.player.cash;
  // Clear leftovers from a failed attempt.
  world.combat.rivals.length = 0;
  showBanner(world, m.title);
  world.events.missionStart = m.title;
  if (index === 0) {
    setObjective(world, 'Steal any car (walk up to one, press E)', null);
  } else if (index === 1) {
    setObjective(world, 'Pick up the parcel at Mara\'s garage', { ...world.city.spots.garage });
    spawnPistol(world, world.city.spots.garage.x + 40, world.city.spots.garage.y);
  } else if (index === 2) {
    setObjective(world, 'Go to the docks', { ...world.city.spots.docks });
  } else if (index === 3) {
    setObjective(world, 'Steal the yellow Comet GT on Meridian Ave', { ...world.city.spots.sportsCar });
  } else if (index === 4) {
    setObjective(world, 'Reach Meridian Bank', { ...world.city.spots.bank });
  }
}

export function updateMissions(world, dt) {
  const ms = world.mission;
  const player = world.player;
  if (ms.done) return;
  if (ms.bannerTimer > 0) ms.bannerTimer -= dt;
  const spots = world.city.spots;
  const near = (spot, radius) => Math.hypot(player.x - spot.x, player.y - spot.y) < radius;

  if (ms.index === 0) {
    // Steal a car, then drive it to the garage.
    if (ms.step === 0 && player.car) {
      ms.step = 1;
      setObjective(world, 'Drive to Mara\'s garage', { ...spots.garage });
    } else if (ms.step === 1 && near(spots.garage, 90)) {
      completeMission(world);
    }
  } else if (ms.index === 1) {
    if (ms.step === 0 && near(spots.garage, 70)) {
      ms.step = 1;
      ms.timer = 75;
      setObjective(world, 'Deliver the parcel to the Marina — 75s!', { ...spots.marina });
    } else if (ms.step === 1) {
      ms.timer -= dt;
      setObjective(world, `Deliver the parcel to the Marina — ${Math.max(0, Math.ceil(ms.timer))}s`, { ...spots.marina });
      if (near(spots.marina, 90)) completeMission(world);
      else if (ms.timer <= 0) failMission(world, 'delivery too slow');
    }
  } else if (ms.index === 2) {
    if (ms.step === 0 && near(spots.docks, 130)) {
      ms.step = 1;
      if (!ms.rivalsSpawned) {
        ms.rivalsSpawned = true;
        spawnRival(world, spots.docks.x - 90, spots.docks.y - 60);
        spawnRival(world, spots.docks.x + 70, spots.docks.y - 90);
        spawnRival(world, spots.docks.x - 40, spots.docks.y + 90);
        spawnRival(world, spots.docks.x + 110, spots.docks.y + 40);
        spawnHealth(world, spots.docks.x, spots.docks.y + 160);
      }
      setObjective(world, 'Take out the Harbor Kings (0/4)', { ...spots.docks });
    } else if (ms.step === 1) {
      const left = world.combat.rivals.length;
      const down = 4 - left;
      setObjective(world, `Take out the Harbor Kings (${down}/4)`, { ...spots.docks });
      if (left === 0) {
        ms.step = 2;
        ms.startCash = player.cash;
        setObjective(world, 'Collect their cash', { ...spots.docks });
      }
    } else if (ms.step === 2) {
      if (player.cash - ms.startCash >= 600) completeMission(world);
      else setObjective(world, `Collect their cash ($${player.cash - ms.startCash} / $600)`, { ...spots.docks });
    }
  } else if (ms.index === 3) {
    if (ms.step === 0 && player.car && player.car.sports) {
      ms.step = 1;
      addHeat(world, 2, 'grand theft auto');
      setObjective(world, 'Lose the heat, then reach the hideout', { ...spots.hideout });
    } else if (ms.step === 1) {
      if (near(spots.hideout, 100)) {
        if (world.police.heat === 0) completeMission(world);
        else setObjective(world, `Lay low at the hideout until the heat cools (${world.police.heat}★)`, { ...spots.hideout });
      } else {
        setObjective(world, 'Reach the hideout — stay out of sight to cool off', { ...spots.hideout });
      }
    }
  } else if (ms.index === 4) {
    if (ms.step === 0 && near(spots.bank, 90)) {
      ms.step = 1;
      ms.vaultTimer = 3;
      setObjective(world, 'Cracking the vault — hold position!', { ...spots.bank });
    } else if (ms.step === 1) {
      if (!near(spots.bank, 110)) {
        ms.step = 0;
        setObjective(world, 'Reach Meridian Bank', { ...spots.bank });
      } else {
        ms.vaultTimer -= dt;
        setObjective(world, `Cracking the vault — ${Math.max(0, Math.ceil(ms.vaultTimer))}s`, { ...spots.bank });
        if (ms.vaultTimer <= 0) {
          ms.step = 2;
          addHeat(world, 3, 'bank robbery');
          spawnCash(world, player.x + 30, player.y, 800);
          spawnCash(world, player.x - 30, player.y + 20, 800);
          setObjective(world, 'Grab the cash and run to the hideout!', { ...spots.hideout });
        }
      }
    } else if (ms.step === 2) {
      if (near(spots.hideout, 100) && world.police.heat === 0) completeMission(world);
      else if (near(spots.hideout, 100)) {
        setObjective(world, `At the hideout — cool off (${world.police.heat}★ left)`, { ...spots.hideout });
      } else {
        setObjective(world, 'Escape to the hideout!', { ...spots.hideout });
      }
    }
  }
}
