// The three.js renderer for Vice Shores: a sun-soaked procedural city
// drawn from the world state every frame. The simulation lives in world.js;
// this file only builds meshes and copies the state onto them.

import * as THREE from 'three';
import { PALETTE } from './config.js';
import { SPOTS } from './config.js';

function groundTexture(city) {
  const W = 1024;
  const H = 800;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const sx = W / 560;
  const sz = H / 440;
  const X = (x) => (x + 280) * sx;
  const Z = (z) => (z + 220) * sz;
  ctx.fillStyle = '#6f9e5a';
  ctx.fillRect(0, 0, W, H);
  // The park block, greener than the rest.
  ctx.fillStyle = '#5d8f4c';
  ctx.fillRect(X(-56), Z(64), 112 * sx, 56 * sz);
  // Beach sand and the sea along the south edge.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, Z(196), W, (224 - 196) * sz);
  ctx.fillStyle = '#2e7fa8';
  ctx.fillRect(0, Z(212), W, (220 - 212) * sz);
  ctx.fillStyle = '#3a9ac0';
  ctx.fillRect(0, Z(212), W, 3);
  // Roads: asphalt with pale sidewalks and dashed centre lines.
  ctx.fillStyle = '#9aa0a8';
  const roadW = 16;
  for (const rx of [-240, -160, -80, 0, 80, 160, 240]) {
    ctx.fillRect(X(rx - roadW / 2 - 2), 0, (roadW + 4) * sx, H);
  }
  for (const rz of [-180, -120, -60, 0, 60, 120, 180]) {
    ctx.fillRect(0, Z(rz - roadW / 2 - 2), W, (roadW + 4) * sz);
  }
  ctx.fillStyle = '#3a3f46';
  for (const rx of [-240, -160, -80, 0, 80, 160, 240]) {
    ctx.fillRect(X(rx - roadW / 2), 0, roadW * sx, H);
  }
  for (const rz of [-180, -120, -60, 0, 60, 120, 180]) {
    ctx.fillRect(0, Z(rz - roadW / 2), W, roadW * sz);
  }
  ctx.fillStyle = '#e8e4d8';
  for (const rx of [-240, -160, -80, 0, 80, 160, 240]) {
    for (let z = -210; z < 220; z += 16) {
      ctx.fillRect(X(rx) - 1, Z(z), 2, 7 * sz);
    }
  }
  for (const rz of [-180, -120, -60, 0, 60, 120, 180]) {
    for (let x = -270; x < 280; x += 16) {
      ctx.fillRect(X(x), Z(rz) - 1, 7 * sx, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#2a3a4a';
  for (let y = 8; y < 120; y += 16) {
    for (let x = 8; x < 56; x += 16) {
      ctx.fillRect(x, y, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(0x9ecfe8, 120, 420);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 30, 40);

  scene.add(new THREE.HemisphereLight(0xbbddff, 0x8a7a5a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.position.set(60, 90, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const city = world.city;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 440),
    new THREE.MeshStandardMaterial({ map: groundTexture(city), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // The sea beyond the beach, a flat blue sheet that catches the sun.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 60),
    new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, 250);
  scene.add(sea);

  const winTex = windowTexture();
  const buildingMats = new Map();
  for (const b of city.buildings) {
    const key = `${b.color}-${Math.round(b.h / 8)}`;
    if (!buildingMats.has(key)) {
      const map = winTex.clone();
      map.needsUpdate = true;
      map.repeat.set(Math.max(1, Math.round(b.w / 12)), Math.max(1, Math.round(b.h / 9)));
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      buildingMats.set(key, new THREE.MeshStandardMaterial({
        color: b.color, roughness: 0.85, map,
      }));
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), buildingMats.get(key));
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(b.w * 0.9, 0.6, b.d * 0.9),
      new THREE.MeshStandardMaterial({ color: b.roof, roughness: 0.9 }),
    );
    roof.position.set(b.x, b.h + 0.3, b.z);
    roof.castShadow = true;
    scene.add(roof);
    if (b.h > 26) {
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x888888 }),
      );
      antenna.position.set(b.x, b.h + 3.4, b.z);
      scene.add(antenna);
    }
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 1 });
  for (const t of city.trees) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.4, 6), trunkMat);
    trunk.position.set(t.x, 1.7, t.z);
    trunk.castShadow = true;
    scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 0), leafMat);
    leaves.position.set(t.x, 4.4, t.z);
    leaves.castShadow = true;
    scene.add(leaves);
  }

  const lampMat = new THREE.MeshStandardMaterial({ color: 0x333a44, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.8 });
  for (const l of city.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), lampMat);
    pole.position.set(l.x, 2.5, l.z);
    scene.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
    bulb.position.set(l.x, 5.1, l.z);
    scene.add(bulb);
  }

  // A few soft clouds drifting high above the city.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const clouds = [];
  for (let i = 0; i < 7; i += 1) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(9 + (i % 3) * 4, 8, 6), cloudMat);
    cloud.scale.y = 0.35;
    cloud.position.set(-240 + i * 80, 70 + (i % 3) * 8, -160 + (i * 53) % 320);
    scene.add(cloud);
    clouds.push(cloud);
  }

  const state = {
    renderer, scene, camera, sun, clouds,
    carMeshes: new Map(), pedMeshes: new Map(), rivalMeshes: new Map(),
    officerMeshes: new Map(), pickupMeshes: new Map(),
    playerMesh: null, heliMesh: null, markerMesh: null, tracerLine: null,
  };
  state.playerMesh = buildPersonMesh(0x2a9d8f, 0x222222, 0xd8a070);
  scene.add(state.playerMesh);

  Object.assign(window, { renderer, scene, THREE });
  return state;
}

function buildPersonMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.45), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skinMat);
  head.position.y = 1.95;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.75, 0.32), pantsMat);
  legL.position.set(-0.22, 0.38, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.22;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.24), shirtMat);
  armL.position.set(-0.58, 1.15, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.58;
  group.add(armR);
  group.userData = { legL, legR, armL, armR, torso };
  return group;
}

function buildCarMesh(car) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: car.dead ? 0x222222 : car.color, roughness: 0.35, metalness: 0.55,
  });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.15, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.7 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), wheelMat);
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    wheel.add(tyre);
    wheel.add(hub);
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  for (const lx of [-0.7, 0.7]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    light.position.set(lx, 0.6, 2.22);
    group.add(light);
  }
  if (car.type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4 }));
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.4 }));
    red.position.set(-0.28, 1.56, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1.4 }));
    blue.position.set(0.28, 1.56, -0.2);
    group.add(blue);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.3, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }));
    door.position.set(0, 0.62, 0.4);
    group.add(door);
  }
  if (car.type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xffe14d, emissive: 0xcc9900, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.5, -0.2);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  group.userData.bodyMat = bodyMat;
  return group;
}

function buildHeliMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a44, roughness: 0.4, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 5), bodyMat);
  body.castShadow = true;
  group.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.15, metalness: 0.6 }));
  glass.position.set(0, 0.2, 1.8);
  group.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.4), bodyMat);
  tail.position.set(0, 0.3, -4.2);
  group.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rotor.position.y = 1.1;
  group.add(rotor);
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), skidMat);
    skid.position.set(sx, -1.0, 0);
    group.add(skid);
  }
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 42, 20, 1, true), coneMat);
  cone.position.y = -21;
  group.add(cone);
  group.userData.rotor = rotor;
  return group;
}

function buildMarkerMesh() {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 30, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffb03a, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  pillar.position.y = 15;
  group.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xffb03a }),
  );
  arrow.rotation.x = Math.PI;
  arrow.position.y = 9;
  group.add(arrow);
  group.userData = { ring, arrow };
  return group;
}

function syncPerson(state, map, list, builder, scene, dt, time) {
  const seen = new Set();
  for (const person of list) {
    if (person.hp !== undefined && person.hp <= 0) continue;
    if (person.alive === false) continue;
    seen.add(person);
    let mesh = map.get(person);
    if (!mesh) {
      mesh = builder(person);
      map.set(person, mesh);
      scene.add(mesh);
    }
    mesh.position.set(person.x, 0, person.z);
    mesh.rotation.y = person.angle || 0;
    const phase = person.walkPhase || 0;
    const swing = Math.sin(phase) * 0.5;
    const u = mesh.userData;
    if (u.legL) {
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
    }
  }
  for (const [person, mesh] of [...map.entries()]) {
    if (!seen.has(person)) {
      scene.remove(mesh);
      map.delete(person);
    }
  }
}

/** Copy the world onto the meshes, move the camera, and render. */
export function syncWorld(state, world, dt) {
  const { scene, camera, sun, renderer } = state;
  const p = world.player;

  // Cars.
  const seenCars = new Set();
  for (const car of world.cars) {
    seenCars.add(car);
    let mesh = state.carMeshes.get(car);
    if (!mesh) {
      mesh = buildCarMesh(car);
      state.carMeshes.set(car, mesh);
      scene.add(mesh);
    }
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.angle;
    if (car.dead) mesh.userData.bodyMat.color.set(0x1c1c1c);
    const spin = car.speed * dt * 2.4;
    for (const w of mesh.userData.wheels) w.rotation.x += spin;
  }
  for (const [car, mesh] of [...state.carMeshes.entries()]) {
    if (!seenCars.has(car)) {
      scene.remove(mesh);
      state.carMeshes.delete(car);
    }
  }

  // People: the player, pedestrians, rivals and officers.
  const playerMesh = state.playerMesh;
  playerMesh.visible = !p.car;
  if (!p.car) {
    playerMesh.position.set(p.x, 0, p.z);
    playerMesh.rotation.y = p.angle;
    const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
    const u = playerMesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = p.hasPistol ? -1.2 : -swing * 0.7;
    u.armR.rotation.x = p.hasPistol ? -1.2 : swing * 0.7;
    if (p.hasPistol) {
      u.armL.rotation.x = -1.2;
      u.armR.rotation.x = -1.2;
    }
  }
  syncPerson(state, state.pedMeshes, world.peds,
    () => buildPersonMesh([0xc96a3a, 0x5a7aa8, 0x8a5a9a, 0x3a8a6a][Math.floor(Math.random() * 4)], 0x2a2a33, 0xd8a070),
    scene, dt, world.elapsed);
  syncPerson(state, state.rivalMeshes, world.rivals,
    () => buildPersonMesh(0xa02020, 0x222222, 0xc89070), scene, dt, world.elapsed);
  const officers = world.police.filter((c) => !c.isPolice);
  syncPerson(state, state.officerMeshes, officers,
    () => buildPersonMesh(0x1a2a44, 0x141824, 0xd8a070), scene, dt, world.elapsed);

  // Pickups: spinning cash and health crates.
  const seenPickups = new Set();
  for (const pickup of world.pickups) {
    if (pickup.taken) continue;
    seenPickups.add(pickup);
    let mesh = state.pickupMeshes.get(pickup);
    if (!mesh) {
      const color = pickup.kind === 'cash' ? 0x2a9d4a : 0xf2f2f2;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
      mesh.castShadow = true;
      state.pickupMeshes.set(pickup, mesh);
      scene.add(mesh);
    }
    mesh.position.set(pickup.x, 1 + Math.sin(world.elapsed * 2 + pickup.x) * 0.2, pickup.z);
    mesh.rotation.y += dt * 2;
  }
  for (const [pickup, mesh] of [...state.pickupMeshes.entries()]) {
    if (!seenPickups.has(pickup)) {
      scene.remove(mesh);
      state.pickupMeshes.delete(pickup);
    }
  }

  // The helicopter.
  const heli = world.heli;
  if (heli.active) {
    if (!state.heliMesh) {
      state.heliMesh = buildHeliMesh();
      scene.add(state.heliMesh);
    }
    state.heliMesh.visible = true;
    state.heliMesh.position.set(heli.x, heli.y, heli.z);
    state.heliMesh.rotation.y = heli.angle;
    state.heliMesh.userData.rotor.rotation.y = heli.rotor;
  } else if (state.heliMesh) {
    state.heliMesh.visible = false;
  }

  // The mission marker.
  const marker = world.mission && world.mission.status === 'active' ? world.mission.marker : null;
  if (marker) {
    if (!state.markerMesh) {
      state.markerMesh = buildMarkerMesh();
      scene.add(state.markerMesh);
    }
    state.markerMesh.visible = true;
    state.markerMesh.position.set(marker.x, 0, marker.z);
    const pulse = 1 + Math.sin(world.elapsed * 3) * 0.12;
    state.markerMesh.scale.set(pulse, 1, pulse);
    state.markerMesh.userData.arrow.position.y = 9 + Math.sin(world.elapsed * 2.4) * 1.2;
  } else if (state.markerMesh) {
    state.markerMesh.visible = false;
  }

  // A tracer line for the last shot.
  if (world.tracer && world.elapsed < world.tracer.until) {
    if (!state.tracerLine) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(0, 0, 1),
      ]);
      state.tracerLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe14d }));
      scene.add(state.tracerLine);
    }
    const pos = state.tracerLine.geometry.attributes.position;
    pos.setXYZ(0, world.tracer.from.x, 1.4, world.tracer.from.z);
    pos.setXYZ(1, world.tracer.to.x, 1.2, world.tracer.to.z);
    pos.needsUpdate = true;
    state.tracerLine.visible = true;
  } else if (state.tracerLine) {
    state.tracerLine.visible = false;
  }

  // The sun's shadow follows the player.
  sun.position.set(p.x + 60, 90, p.z + 30);
  sun.target.position.set(p.x, 0, p.z);
  sun.target.updateMatrixWorld();

  // Clouds drift.
  for (const cloud of state.clouds) {
    cloud.position.x += dt * 1.2;
    if (cloud.position.x > 300) cloud.position.x = -300;
  }

  // Third-person camera: behind the player or their car — or, on the title
  // screen, a slow orbit above the city.
  if (world.attract) {
    const t = world.elapsed * 0.06;
    camera.position.set(Math.cos(t) * 170, 65, Math.sin(t) * 170);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return;
  }
  const yaw = world.cameraYaw;
  const dist = p.car ? 15 : 11;
  const height = p.car ? 7 : 6.2;
  const cx = p.x - Math.sin(yaw) * dist;
  const cz = p.z - Math.cos(yaw) * dist;
  camera.position.set(cx, height, cz);
  camera.lookAt(p.x + Math.sin(yaw) * 6, 1.6, p.z + Math.cos(yaw) * 6);

  renderer.render(scene, camera);
}

/** Clear every dynamic mesh so a fresh world can reuse this scene. */
export function resetScene(state) {
  const { scene } = state;
  for (const map of [state.carMeshes, state.pedMeshes, state.rivalMeshes, state.officerMeshes, state.pickupMeshes]) {
    for (const mesh of map.values()) scene.remove(mesh);
    map.clear();
  }
  if (state.heliMesh) state.heliMesh.visible = false;
  if (state.markerMesh) state.markerMesh.visible = false;
  if (state.tracerLine) state.tracerLine.visible = false;
  state.playerMesh.visible = true;
}

export function resizeRenderer(state) {
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
}

export { SPOTS };
