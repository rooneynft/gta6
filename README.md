# Vice Shores — an open-world crime game

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/rooneynft/gta6/rank.svg)](https://make.fun/bounty/gta6-01)

An entry for the make.fun bounty [gta6-01 — "Make GTA 6"](https://make.fun/bounty/gta6-01).

**Vice Shores** is a complete top-down 2D open-world crime game that runs offline in a
desktop browser from static files — no network requests, no libraries, no build step.
You are a small-time hustler in Vice Shores, a fictional sun-soaked coastal city:
steal cars, dodge the cops, run five story missions and own the streets.

Everything is original: the city, characters, vehicles, story, art and sound are all
invented for this game. No Rockstar Games name, logo, character, map or asset is used.

## What's in the game

- **A city to explore** — a seeded 3200×2400 coastal city: a road grid with lane
  markings and crosswalks, building blocks, a park with a pond, a canal with bridges,
  and a beach with palms and open water. `?seed=N` generates a different city.
- **On foot and by car** — walk with WASD/arrows, press **E** near a parked or
  moving car to steal it, drive with WASD (W gas, S brake/reverse). Exit with E.
- **Traffic and pedestrians** — AI cars follow the roads and turn at intersections;
  pedestrians stroll the sidewalks and flee from speeding cars.
- **Stealing cars & wanted level** — jacking a car raises your wanted level (1–5
  stars). Police cars chase you along the streets and ram you; foot cops chase you
  down and arrest you. Lay low and the heat fades, one star at a time.
- **Missions & story** — five missions in order, with a marker on the map and the
  minimap: Hot Wheels (steal a car), Parcel Run, Pick Up Rico, Cash Grab, and Lose
  the Heat. Each pays cash; progress and money are saved to localStorage.
- **Combat** — punch with **Space** (pedestrians go down, cops take three hits).
  Ramming pedestrians or crashing at speed has consequences.
- **HUD & minimap** — money, health, wanted stars, speed, mission tracker, and a
  live minimap showing roads, the mission marker, cash bags and police.
- **Screens & save** — title, pause, busted/game-over screens, mission-complete
  toasts, and a save (money + missions done + best haul) in localStorage.
- **Sound** — procedural WebAudio only: engine hum, two-tone siren, punch/cash/
  mission jingles. No audio files. **M** mutes.

## How to play

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk, or drive (W gas, S brake/reverse, A/D steer) |
| E | Enter / exit a car |
| Space | Punch (on foot) / start |
| P / Esc | Pause |
| M | Mute sound |

## Run it locally

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` directly from any static file server. The game needs no
network access.

## Screenshots

The four screenshots in `screenshots/` are staged by the game's own `?shot=` scenes
(`game/src/shots.js`): the autopilot walks to a car, steals it and drives the mission
route, so every frame is real gameplay from seed 1.

## License

MIT — see [LICENSE](LICENSE).
