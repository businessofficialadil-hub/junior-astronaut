import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { makeTextures, boxUV, TEX } from './textures.js';
import { makeAstronaut, animateAstronaut } from './astronaut.js';
import { makePlayer } from './player.js';
import { buildBase } from './base.js';
import { makeRover } from './rover.js';
import { sfx } from './sfx.js';
import { makeMission } from './mission.js';
import { openTasks, allTasks } from './tasks.js';
import { fit } from './sim.js';
import { IS_TOUCH, makeTouch } from './touch.js';
import { playIntro, makeGameLander } from './intro.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ---------------------------------------------------------------- tuning
const GRAVITY = 1.62, JUMP = 2.6, WALK = 3.2, RUN = 6.5;
const EYE = 1.6, RADIUS = 0.35, STEP = 0.5, REACH = 2.6;   // knee-high step: thresholds and the ramp, not tables

// Blender (x, y, z) Z-up -> three.js (x, z, -y) Y-up, same as the glTF exporter.
const b2t = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

// habitat rooms in habitat-local metres (same table as ASTROPHAGE_Blender_Builder.py ROOMS)
const ROOMS = {
  'Airlock': [-5.0, -2.4, -1.8, 2.4], 'Main Hub': [0.0, -3.5, 7.0, 3.5], 'Command Room': [0.0, 5.0, 7.0, 10.5],
  'Power Room': [0.0, -10.5, 7.0, -5.0], 'Life Support': [8.5, -3.5, 14.0, 3.5], 'Water Laboratory': [8.5, 5.0, 14.0, 10.5],
  'Food Storage': [8.5, -10.5, 14.0, -5.0], 'Science Lab': [15.5, -3.5, 21.0, 3.5], 'Crew Quarters': [15.5, 5.0, 21.0, 10.5],
};

// ---------------------------------------------------------------- scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.25 : 2));   // phones: fewer pixels, cooler phone
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
makeTextures();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;          // soft reflections on metal, visor and painted panels
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 3000);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x9aa8c8, 0x302c28, 0.5); hemi.layers.enableAll();
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e6, 3.4);
const SUN_DIR = new THREE.Vector3(-300, 140, 80).normalize();
sun.castShadow = true; sun.layers.enableAll();   // light the arms layer too
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 250 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
{ // stars + Earth
  const n = 4000, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1500);
    if (v.y < -100) v.y = -v.y;
    p.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false })));
  // Earth: day map + a slower cloud layer + a thin blue atmosphere rim (textures: three.js examples, NASA imagery)
  const tl = new THREE.TextureLoader();
  const day = tl.load('/textures/Earth/earth.jpg'); day.colorSpace = THREE.SRGBColorSpace; day.anisotropy = 8;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32),
    // the sun is behind Earth from the base, so it also glows faintly with its own map (earthshine look)
    new THREE.MeshStandardMaterial({ map: day, roughness: 0.75, metalness: 0, emissiveMap: day, emissive: 0xffffff, emissiveIntensity: 0.55 }));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(40.5, 64, 32),
    new THREE.MeshStandardMaterial({ map: tl.load('/textures/Earth/clouds.png'), transparent: true, opacity: 0.8, depthWrite: false,
      emissive: 0xffffff, emissiveIntensity: 0.25 }));
  const rim = new THREE.Mesh(new THREE.SphereGeometry(41.6, 64, 32), new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(0.35, 0.6, 1.0, f * 0.6); }',
  }));
  earth.add(clouds, rim);
  earth.rotation.set(0.41, 2.2, 0);                 // axial tilt, Africa/Europe facing the base
  earth.position.set(600, 700, -900); scene.add(earth);
  scene.userData.earth = earth; scene.userData.clouds = clouds;
}

const controls = new PointerLockControls(camera, document.body);
const TEST = new URLSearchParams(location.search).has('test');   // dev only: play without pointer lock
// freeRun: right after the intro the game runs before the first click (pointer lock needs one); keys work, the mouse waits
let freeRun = false;
const active = () => controls.isLocked || TEST || freeRun;
const solids = [];          // meshes the player collides with
const loader = new GLTFLoader();
// title-screen loading bar: models and textures all go through the default loading manager
THREE.DefaultLoadingManager.onProgress = (_url, done, total) => { $('loadbar').firstElementChild.style.width = `${(done / total) * 100}%`; };
let started = false, attractT = 0, spawnEye = 0, spawnLook = null;
let introState = 'none';
let padSpawn = null, padLook = null;   // where the player starts after the intro: beside the lander on the pad   // none -> playing -> landed (then START enters the base)   // before the first START the camera orbits the base behind the title
const load = (f) => loader.loadAsync(`/models/${f}`);

// ---------------------------------------------------------------- HUD
const $ = (id) => document.getElementById(id);
const ui = { objective: $('objective'), prompt: $('prompt'), dialogue: $('dialogue'), speaker: $('speaker'),
  line: $('line'), choices: $('choices'), more: $('more'), tablet: $('tablet'), steps: $('steps'), room: $('room'), arrow: $('arrow'), dist: $('dist'),
  drive: $('drive'), speed: $('speed'), edge: $('edge') };

// ---------------------------------------------------------------- crew tasks (decisions, see tasks.js)
const NAMES = { commander: 'Mission Commander', engineer: 'Systems Engineer', science: 'Science Officer',
  panel: 'Life Support Panel', monolith: 'Regolith sample' };
const IDLE = { commander: 'Keep going. Press Tab to open Mission Control and plan the sol.',
  engineer: 'The power systems are my job. Follow the blue beam if you are lost.',
  science: 'Science never sleeps. The arrow at the top of your screen points to your next task.' };

let talking = null;          // { id, lines, task?, choosing? }
const targets = {};         // id -> { pos: Vector3, obj? }
let hudKey = '';
const current = () => (mission ? openTasks(mission.state)[0] : null);

function refreshHud() {
  if (!mission) return;
  const m = mission.state, open = openTasks(m), all = allTasks(m), cur = open[0];
  hudKey = `${m.sol}|${m.done.length}|${m.forecastKnown}|${!!m.over}`;
  ui.objective.textContent = m.over ? '✔ Mission over. Feel free to explore.'
    : cur ? `▶ ${cur.title}` : `▶ End sol ${m.sol} in Mission Control (Tab)`;
  const row = (t) => {
    const done = m.done.includes(t.id), now = t === cur || (cur && t.id === cur.id), later = t.sol > m.sol;
    return `<li class="${done ? 'done' : now ? 'now' : ''}">${done ? '✔' : now ? '▶' : later ? '🔒' : '○'} ${later ? `Sol ${t.sol}: ` : ''}${t.title}</li>`;
  };
  const rows = all.map(row).join('') + (cur || m.over ? '' : `<li class="now">▶ End sol ${m.sol} in Mission Control (Tab)</li>`);
  ui.steps.innerHTML = rows;
  $('tl-items').innerHTML = rows;
  $('tl-count').textContent = `Sol ${m.sol} · ${all.filter((t) => m.done.includes(t.id)).length}/${all.length}`;
  if (cur) marker.position.copy(targets[cur.who].pos).setY(targets[cur.who].pos.y - 1.5);
  const want = new Set(open.map((t) => t.who));
  for (const n of npcs) n.userData.tag.material.map = tagTexture(n.userData.label, want.has(n.userData.id));
  if (targets.panel) targets.panel.obj.material.emissive.setHex(m.done.includes('filter') ? 0x22ff66 : 0xff2a1a);
  if (targets.monolith) targets.monolith.obj.visible = !m.done.includes('sample');
}

function interact(id) {
  const t = openTasks(mission.state).find((x) => x.who === id);
  if (t) talking = { id, lines: [...t.say], task: t };
  else if (IDLE[id]) talking = { id, lines: [IDLE[id]] };
  else return;
  nextLine();
}
function showLine(id, text) {
  ui.speaker.textContent = NAMES[id];
  ui.line.innerHTML = text;
  ui.choices.innerHTML = ''; ui.more.style.display = '';
  ui.dialogue.style.display = 'block';
  sfx.blip();
}
function nextLine() {
  if (talking.choosing) return;                      // waiting for 1 / 2
  const line = talking.lines.shift();
  if (line !== undefined) return showLine(talking.id, line);
  const t = talking.task;
  if (t && !talking.finished) {
    if (t.choices) {                                   // ask: the player must pick
      talking.choosing = true;
      ui.more.style.display = 'none';
      ui.choices.innerHTML = t.choices.map((c, i) => `<button data-c="${i}"><kbd>${i + 1}</kbd> ${c.label}</button>`).join('');
      return;
    }
    return finish(t, null);
  }
  talking = null; ui.dialogue.style.display = 'none';
}
function choose(i) {
  const t = talking?.task, c = t?.choices?.[i];
  if (!talking?.choosing || !c) return;
  talking.choosing = false;
  finish(t, c);
}
function finish(t, c) {
  const m = mission.state;
  (c ? c.apply : t.apply)?.(m, mission.bonus);
  fit(m);   // a task that takes power today shrinks the plan to what is left
  m.done.push(t.id);
  talking.finished = true;
  talking.lines = [...(c ? [c.result] : []), `🧑‍🚀 <b>Real fact:</b> ${t.fact[0]} <small class="src">Source: ${t.fact[1]}</small>`];
  mission.refresh(); refreshHud();
  openTasks(m).length ? sfx.success() : sfx.fanfare();
  nextLine();
}
addEventListener('keydown', (e) => { if (talking?.choosing && (e.code === 'Digit1' || e.code === 'Digit2')) choose(+e.code.slice(-1) - 1); });
document.getElementById('choices').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) choose(+b.dataset.c); });

// objective marker: a tall light beam
const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 60, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x33aaff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
marker.geometry.translate(0, 30, 0);
scene.add(marker);

// floating name tag over an NPC; yellow "!" when they are the current task
function tagTexture(label, now) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = now ? 'rgba(255,190,0,.9)' : 'rgba(10,20,40,.75)'; g.beginPath(); g.roundRect(16, 24, 480, 80, 20); g.fill();
  g.fillStyle = now ? '#111' : '#cfe3ff'; g.font = 'bold 44px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((now ? '! ' : '') + label, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- world
const doors = [];
let hands, tablet, habAt, toLocal, player, rover, mission;
let driving = false, mastView = false, nearRover = false;
let bounds = null, spawnPoint = null;   // walkable area (terrain minus a margin) and where to respawn
const orbit = { yaw: 0, pitch: 0.32 };
const npcs = [];

// Swap the flat exported colours for textured materials. Keys are the habitat builder's MATS names.
function styleWorld(root) {
  const looks = {
    HAB_MAT_wh: { map: TEX.panel, color: 0xeeeeea, roughness: 0.55, tile: 1.4 },
    HAB_MAT_wp: { map: TEX.panel, color: 0xdde3e8, roughness: 0.6, tile: 1.2 },
    HAB_MAT_gr: { map: TEX.panel, color: 0x8c939b, roughness: 0.5, tile: 1.2 },
    HAB_MAT_fl: { map: TEX.floor, color: 0xffffff, roughness: 0.8, tile: 1.0 },
    HAB_MAT_ins: { map: TEX.foil, color: 0xffffff, roughness: 0.35, metalness: 0.7, tile: 0.8 },
    HAB_MAT_warn: { map: TEX.hazard, color: 0xffffff, roughness: 0.6, tile: 0.4 },
    HAB_MAT_solar: { map: TEX.solar, color: 0xffffff, roughness: 0.25, metalness: 0.4, tile: 0.6 },
    SolarCell: { map: TEX.solar, color: 0xffffff, roughness: 0.25, metalness: 0.4, tile: 0.6 },
    HAB_MAT_cargo: { map: TEX.panel, color: 0x6c7a88, roughness: 0.6, tile: 1.0 },
    HAB_Pad: { map: TEX.regolith, color: 0x77746f, roughness: 1, tile: 3 },
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const look = looks[o.material.name];
    if (!look) return;
    if (!o.material.userData.styled) {
      Object.assign(o.material, { map: look.map, bumpMap: look.map, bumpScale: 0.4, roughness: look.roughness,
        metalness: look.metalness ?? o.material.metalness });
      o.material.color.setHex(look.color);
      o.material.userData.styled = true; o.material.needsUpdate = true;
    }
    boxUV(o, look.tile);
  });
}

// The lunar_map boulders are 438 copies of 6 meshes in one flat grey. Give each its own shape (seeded noise,
// squash, turn), a CC0 rock texture (ambientCG Rocks011, greyed), a shade of its own, and sink it into the dust.
function styleRocks(rocks) {
  const tl = new THREE.TextureLoader(), t = (m, srgb) => {
    const x = tl.load(`/textures/Rocks011/${m}.jpg`); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8;
    if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x;
  };
  const map = t('color', true), normalMap = t('normalgl'), roughnessMap = t('roughness');
  const mats = [0xc8c5bf, 0xb3b0aa, 0xd6d3cd, 0xa29f9a].map((c) => {
    const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, color: c, roughness: 1 });
    m.normalScale.set(1.5, 1.5);
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n  diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));'); };
    return m;
  });
  const v = new THREE.Vector3();
  rocks.forEach((o, i) => {
    // a fresh, finer boulder the same size as the original low-poly one (whose silhouette read as a hexagon)
    o.geometry.computeBoundingSphere(); const R = (o.geometry.boundingSphere.radius || 1) * 0.8;
    let g = new THREE.IcosahedronGeometry(R, 4); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);                               // shared corners, so the noise can't crack the surface
    const p = g.attributes.position, a = i * 1.37, b = i * 2.11, c = i * 0.73;
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const u = v.clone().divideScalar(R);
      const n = 1 + 0.26 * Math.sin(u.x * 2.3 + a) * Math.sin(u.y * 2.1 + b) * Math.sin(u.z * 2.6 + c)
                  + 0.12 * Math.sin(u.x * 5.1 + b) * Math.sin(u.y * 4.7 + c) * Math.sin(u.z * 5.5 + a)
                  + 0.05 * Math.sin(u.x * 11.0 + c) * Math.sin(u.z * 12.0 + b);
      v.multiplyScalar(n);
      if (v.y < -0.35 * R) v.y = -0.35 * R + (v.y + 0.35 * R) * 0.3;   // flatter underside, sits on the ground
      p.setXYZ(k, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    // box-projected UVs, about one texture tile per 1.5 m of rock
    const nor = g.attributes.normal, uv = new Float32Array(p.count * 2), sc = o.scale.x / 1.5;
    for (let k = 0; k < p.count; k++) {
      const ax = Math.abs(nor.getX(k)), ay = Math.abs(nor.getY(k)), az = Math.abs(nor.getZ(k));
      const [x, y] = ay >= ax && ay >= az ? [p.getX(k), p.getZ(k)] : ax >= az ? [p.getZ(k), p.getY(k)] : [p.getX(k), p.getY(k)];
      uv[k * 2] = x * sc + i * 0.31; uv[k * 2 + 1] = y * sc + i * 0.17;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    o.geometry = g; o.material = mats[i % mats.length];
    o.scale.y *= 0.75 + ((i * 37) % 10) / 30;           // some lower, some taller boulders
    o.rotation.y += i * 2.4;
    o.position.y -= R * o.scale.y * 0.12;              // bedded into the regolith
    o.updateMatrixWorld(true);
    g.computeBoundsTree();
  });
}

// regolith texture + broad light/dark patches (highlands vs. mare) on the terrain
function styleTerrain(mesh) {
  const g = mesh.geometry, pos = g.attributes.position;
  // the decimated export has no UVs: project from above, one texture tile per 4 m
  const uvs = new Float32Array(pos.count * 2), col = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    uvs[i * 2] = v.x / 4; uvs[i * 2 + 1] = v.z / 4;
    const patch = 0.5 + 0.25 * Math.sin(v.x * 0.013 + Math.sin(v.z * 0.021) * 2) + 0.25 * Math.sin(v.z * 0.017 + v.x * 0.004);
    const k = 0.62 + 0.38 * patch + THREE.MathUtils.clamp(v.y * 0.03, -0.1, 0.1);
    col.set([k, k * 0.985, k * 0.96], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  // CC0 ground scan (ambientCG Ground022), greyed to lunar regolith; the vertex colours add mare/highland patches
  const tl = new THREE.TextureLoader(), t = (m, srgb) => {
    const x = tl.load(`/textures/Ground022/${m}.jpg`); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8;
    if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x;
  };
  mesh.material = new THREE.MeshStandardMaterial({ map: t('color', true), normalMap: t('normalgl'), roughnessMap: t('roughness'),
    color: 0xb4b8c0, vertexColors: true, roughness: 1, metalness: 0 });
  mesh.material.normalScale.set(1.6, 1.6);
  mesh.material.onBeforeCompile = (sh) => {
    // grey the brownish scan to moon regolith, and multiply in two larger, offset copies (~14 m, ~55 m)
    // so the 4 m tile does not visibly repeat across the plains
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 L = vec3(0.3, 0.59, 0.11);
      float d0 = dot(texture2D(map, vMapUv).rgb, L);
      float d1 = dot(texture2D(map, vMapUv * 0.29 + vec2(0.37, 0.11)).rgb, L);
      float d2 = dot(texture2D(map, vMapUv * 0.073 + vec2(0.71, 0.53)).rgb, L);
      float grey = d0 * (0.55 + 0.9 * d1) * (0.6 + 0.8 * d2);
      diffuseColor.rgb *= vec3(grey * 1.35);`);
  };
  mesh.receiveShadow = true; mesh.castShadow = true;
}

async function build() {
  const sites = await fetch('/models/sites.json').then((r) => r.json());
  const base = sites.base, yaw = base.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  const rootX = base.x - 10 * c, rootY = base.y - 10 * s;
  // habitat-local metres (Blender) -> world three.js position, height = floor + z
  const hab = (lx, ly, z = 0) => b2t(rootX + lx * c - ly * s, rootY + lx * s + ly * c, base.floor_z + z);
  toLocal = (p) => { const bx = p.x - rootX, by = -p.z - rootY; return [bx * c + by * s, -bx * s + by * c]; };
  habAt = hab;

  const [terrain, baseG, monolith, roverG] = await Promise.all(
    ['lunar_terrain.glb', 'lunar_base.glb', 'lunar_monolith.glb', 'perseverance.glb'].map(load));

  // the old Blender habitat is replaced by the code-built base (base.js); keep solar field, comms, rocks, landing zone
  const oldHab = baseG.scene.getObjectByName('HAB_Root');
  if (oldHab) oldHab.parent.remove(oldHab);

  for (const g of [terrain, baseG, monolith]) {
    scene.add(g.scene);
    g.scene.updateMatrixWorld(true);
  }

  for (const g of [terrain, baseG, monolith]) {
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'MoonSurface') styleTerrain(o);
      if (o.name.startsWith('MON_Dust')) {     // dust mound: regolith, sunk into the ground so it reads as a drift, not a disc
        o.material = new THREE.MeshStandardMaterial({ map: TEX.regolith, color: 0xb5b2ac, roughness: 1 });
        o.position.y -= 0.35; o.updateMatrixWorld(true); boxUV(o, 3);
      }
      o.geometry.computeBoundsTree();
      solids.push(o);
    });
    if (g !== terrain) styleWorld(g.scene);
  }
  styleRocks(solids.filter((o) => /^Rock_\d+$/.test(o.name)));

  // map edge: an invisible wall 8 m inside the terrain's edge, so nobody walks or drives off the world
  const tb = new THREE.Box3().setFromObject(terrain.scene);
  bounds = { x0: tb.min.x + 8, x1: tb.max.x - 8, z0: tb.min.z + 8, z1: tb.max.z - 8, low: tb.min.y };

  // the drivable rover (Perseverance), parked off the pad beside the airlock, nose pointing away from the base
  // the Day 1 lander stays on the landing pad, and after the intro the player starts beside it
  {
    const lz = b2t(sites.lz.x, sites.lz.y); lz.y = groundAt(lz, 50) ?? lz.y;
    const lander = makeGameLander(); lander.position.copy(lz); scene.add(lander); lander.updateMatrixWorld(true);
    lander.traverse((o) => { if (o.isMesh && !o.material.isShaderMaterial) { o.castShadow = true; o.geometry.computeBoundsTree(); solids.push(o); } });
    // invisible wall round the engine: the bell's faces point inwards, so without it you walk into the nozzle and get trapped
    const fence = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 4.5, 24, 1, true), new THREE.MeshBasicMaterial({ visible: false }));
    fence.position.copy(lz).setY(lz.y + 2.25); scene.add(fence); fence.updateMatrixWorld(true);
    fence.geometry.computeBoundsTree(); solids.push(fence);
    const toBase = hab(-8, 0).sub(lz).setY(0).normalize();
    padSpawn = lz.clone().addScaledVector(toBase, 7.5); padLook = hab(-5, 0, 1.6);
  }
  rover = makeRover(roverG);
  const away = hab(-1, 0).sub(hab(0, 0));
  const rp = hab(-9.0, -5.0);
  rover.place(rp, Math.atan2(away.x, away.z));
  rover.root.position.y = groundAt(rp, 50) ?? rp.y;
  scene.add(rover.root, rover.dust);
  rover.root.updateMatrixWorld(true);
  rover.hull.geometry.computeBoundsTree(); solids.push(rover.hull);

  // the moon base: same layout as the Blender habitat, built in code with PBR textures
  const hq = buildBase({ addSign,
    groundY: (lx, ly) => (groundAt(hab(lx, ly), 50) ?? base.floor_z) - base.floor_z });
  hq.group.position.copy(hab(0, 0)); hq.group.rotation.y = yaw;
  scene.add(hq.group); hq.group.updateMatrixWorld(true);
  hq.group.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundsTree(); solids.push(o); } });
  for (const l of hq.lights) l.layers.enableAll();   // room lights also light the arms layer
  for (const d of hq.doors) { d.centre = hq.group.localToWorld(d.localCentre.clone()); doors.push(d); }

  // crew: procedural EVA suits, colour-coded by role like the original scripts
  const place = (id, label, accent, lx, ly) => {
    const a = makeAstronaut(accent);
    a.position.copy(hab(lx, ly));
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(label, false) }));
    tag.scale.set(0.9, 0.225, 1); tag.position.y = 2.1; a.add(tag);
    Object.assign(a.userData, { id, label, tag });
    scene.add(a); npcs.push(a);
    targets[id] = { pos: a.position.clone().setY(a.position.y + 1.0) };
  };
  place('commander', 'COMMANDER', 0x2f6fd0, 3.5, 1.5);
  place('engineer', 'SYSTEMS ENGINEER', 0xd9781a, 2.0, -7.0);
  place('science', 'SCIENCE OFFICER', 0x1f8f94, 18.25, 1.5);

  // power panel on the Power Room's back wall: cabinet + status screen (red = tripped)
  const panel = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.18), new THREE.MeshStandardMaterial({ color: 0x7d858e, map: TEX.panel, roughness: 0.5 }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff2a1a, emissiveIntensity: 2 }));
  scr.position.set(0, 0.25, -0.091); scr.rotation.y = Math.PI;
  for (let i = 0; i < 6; i++) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    sw.position.set(-0.3 + i * 0.12, -0.3, -0.1); panel.add(sw);
  }
  panel.add(cab, scr);
  panel.position.copy(hab(5.0, -10.1, 1.25)); panel.rotation.y = yaw;
  scene.add(panel);
  targets.panel = { pos: panel.position.clone(), obj: scr };

  // regolith sample: a glowing rock on the ground 6 m in front of the monolith, on the base side
  const mono = b2t(sites.monolith.x, sites.monolith.y);
  const toBase = hab(10, 0).sub(mono).setY(0).normalize();
  const sample = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25),
    new THREE.MeshStandardMaterial({ color: 0x9a9894, map: TEX.regolith, emissive: 0x2288ff, emissiveIntensity: 0.5 }));
  sample.position.copy(mono).addScaledVector(toBase, 6);
  sample.position.y = (groundAt(sample.position) ?? 0) + 0.2;
  scene.add(sample);
  targets.monolith = { pos: sample.position.clone(), obj: sample };

  // first-person suit arms and tablet ride on the camera
  player = makePlayer(await load('player_astronaut.glb'), camera);   // your astronaut: arms in view, body below
  hands = player.arms; scene.add(player.body);
  hands.traverse((o) => { o.layers.set(2); if (o.isMesh) o.receiveShadow = true; });   // drawn after AO, see draw()
  tablet = (await load('inventory_tablet.glb')).scene;
  tablet.traverse((m) => { if (m.isMesh && /_Ground$/.test(m.name)) m.visible = false; });
  camera.add(tablet); tablet.visible = false;
  tablet.position.set(0, -0.02, -0.3); tablet.rotation.set(Math.PI / 2, 0, 0);

  // spawn outside the outer airlock hatch, facing the base
  const spawn = hab(-8.0, 0); spawnPoint = spawn.clone();
  camera.position.copy(spawn);
  camera.position.y = (groundAt(spawn) ?? spawn.y) + EYE;
  camera.lookAt(hab(3.5, 0, 1.6));
  spawnEye = camera.position.y; spawnLook = hab(3.5, 0, 1.6);
  // the outpost trade-off game; the dashboard needs a free mouse, so pointer lock is released while it is open
  mission = makeMission({
    onOpen: () => { document.exitPointerLock?.(); sfx.blip(); },
    onClose: () => { if (!TEST && !IS_TOUCH) controls.lock(); },
    tasksHtml: () => ui.steps.innerHTML,
  });
  refreshHud();
}

// a lit name plate above a doorway, in the room frame. dir: +1/-1 along the wall normal n; gap: metres
// from the wall centre plane to the plate.
const SIGN_LABEL = { 'Lunar surface': 'EXIT · LUNAR SURFACE' };
function addSign(parent, room, centre, n, a, dir, gap) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1824'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = room === 'Lunar surface' ? '#ff5a3c' : '#2f9bff'; g.fillRect(0, 0, 12, 128); g.fillRect(500, 0, 12, 128);
  g.strokeStyle = '#3a4a5c'; g.lineWidth = 4; g.strokeRect(2, 2, 508, 124);
  g.fillStyle = '#eaf4ff'; g.font = 'bold 50px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((SIGN_LABEL[room] || room).toUpperCase(), 256, 68, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  s.position.copy(centre); s.position.y = 2.42; s.position[n] += dir * gap;
  s.rotation.y = n === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);   // plane faces +Z
  parent.add(s);
}

const _p = new THREE.Vector3();
// slide vector for a door, to the left of whoever is opening it
function slideFor(d) {
  _p.copy(camera.position); d.mesh.parent.worldToLocal(_p);
  const side = Math.sign(_p[d.n] - d.localCentre[d.n]) || 1;  // which side of the wall the player is on
  const f = new THREE.Vector3(); f[d.n] = -side;             // player faces the door
  return new THREE.Vector3(f.z, 0, -f.x).multiplyScalar(1.3); // left of f (= up × f), along the wall
}

// ---------------------------------------------------------------- collision helpers
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
function cast(from, dir, far, skip) {
  ray.set(from, dir); ray.far = far;
  return ray.intersectObjects(solids, false).find((h) => !skip || !isChild(h.object, skip));
}
const isChild = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
function groundAt(p, fromAbove = 500, skip) {
  const h = cast(new THREE.Vector3(p.x, p.y + fromAbove, p.z), DOWN, fromAbove + 1000, skip);
  return h ? h.point.y : null;
}
function blocked(feet, dir, dist) {
  for (const hgt of [STEP + 0.05, 1.0, 1.5]) {
    if (cast(feet.clone().setY(feet.y + hgt), dir, dist + RADIUS)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- input
const keys = {};
let vy = 0, grounded = false, stepDist = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Tab') { e.preventDefault(); if (mission && !driving) mission.toggle(); }
  if (mission?.open) return;   // keys belong to the dashboard while it is open
  if (e.code === 'KeyE' && active()) {
    if (talking) nextLine();
    else if (driving) exitRover();
    else if (nearest) interact(nearest);
    else if (nearRover) enterRover();
  }
  if (e.code === 'KeyV' && driving) mastView = !mastView;
  if (e.code === 'KeyJ') $('tasklist').classList.toggle('mini');
  if (e.code === 'Space' && grounded && !driving) { vy = JUMP; grounded = false; }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
// phones and tablets: joystick, drag-to-look and buttons that send the same key codes
const _eul = new THREE.Euler(0, 0, 0, 'YXZ');
const touch = IS_TOUCH && makeTouch({
  keys,
  canPlay: () => started && freeRun && !mission?.open,
  look(dx, dy) {
    if (driving) { orbit.yaw -= dx * 0.006; orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.004, 0.08, 1.1); return; }
    _eul.setFromQuaternion(camera.quaternion); _eul.y -= dx * 0.005; _eul.x = THREE.MathUtils.clamp(_eul.x - dy * 0.005, -1.5, 1.5);
    camera.quaternion.setFromEuler(_eul);
  },
  press(code) {
    if (code === 'pause') return pauseTouch();
    dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code }));
  },
});
if (touch) $('tasklist').classList.add('mini');   // small screens: the task list starts folded (Tasks button opens it)
function pauseTouch() {
  freeRun = false;
  $('start').style.display = 'flex'; $('start').classList.add('paused');
  $('st-eyebrow').textContent = 'PAUSED'; $('play').textContent = '▶ RESUME'; $('play').disabled = false;
}
// tap the dialogue box to go on (phones have no E key; also handy with a free mouse)
ui.dialogue.addEventListener('click', (e) => { if (talking && !talking.choosing && !e.target.closest('button')) nextLine(); });
// while driving, the mouse orbits the chase camera around the rover
addEventListener('mousemove', (e) => {
  if (!driving || !controls.isLocked) return;
  orbit.yaw -= e.movementX * 0.003;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + e.movementY * 0.002, 0.08, 1.1);
});

function enterRover() {
  sfx.roverOn(true);
  driving = true; mastView = false; orbit.yaw = 0; orbit.pitch = 0.32;
  player.body.visible = false; hands.visible = false; ui.drive.style.display = 'block';
}
function exitRover() {
  sfx.roverOn(false);
  // step out on the left side (or the right if something is in the way), facing where the rover faces
  const f = rover.forward().clone(), left = new THREE.Vector3(f.z, 0, -f.x);
  let spot = null;
  for (const side of [1, -1]) {
    const p = rover.root.position.clone().addScaledVector(left, 2.3 * side);
    const from = rover.root.position.clone().setY(rover.root.position.y + 1);
    if (!cast(from, left.clone().multiplyScalar(side), 2.3, rover.root)) { spot = p; break; }
  }
  spot ||= rover.root.position.clone().addScaledVector(f, -3.0);
  spot.y = groundAt(spot, 20, rover.root) ?? spot.y;
  camera.position.copy(spot).setY(spot.y + EYE);
  camera.lookAt(camera.position.clone().add(f));
  vy = 0; driving = false;
  player.body.visible = true; hands.visible = true; ui.drive.style.display = 'none';
}
$('play').onclick = () => {
  sfx.start();
  if (!TEST && introState === 'none') return runIntro();      // first START: the Day 1 cinematic, then the base
  if (IS_TOUCH) { startPlaying(); $('start').style.display = 'none'; freeRun = true; try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* iPhone: no fullscreen */ } return; }
  startPlaying(); TEST ? ($('start').style.display = 'none') : controls.lock();
};
// Day 1 intro: its own canvas and renderer (it needs a logarithmic depth buffer for Earth-to-Moon scales);
// the game loop pauses while it plays. When it ends the game starts on the landing pad without another screen.
async function runIntro() {
  introState = 'playing';
  $('play').disabled = true; $('play').textContent = 'LOADING INTRO…';
  const r = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  r.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.25 : 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.domElement.id = 'introGL';
  const ov = document.createElement('div'); ov.id = 'introOv';
  document.body.append(r.domElement, ov);
  try {
    await playIntro({ renderer: r, overlay: ov, onDone: () => {
      r.dispose(); r.domElement.remove(); ov.remove(); introState = 'landed';
      startPlaying(true);                                       // straight into the game, on the pad
    } });
    $('start').style.display = 'none';
  } catch (e) {                                                // never block the game on the cinematic
    console.error('intro failed', e); r.dispose(); r.domElement.remove(); ov.remove();
    introState = 'landed'; startPlaying(true);
  }
}
function startPlaying(fromPad = false) {
  if (started) return;
  started = true;
  if (fromPad && padSpawn) {
    camera.position.copy(padSpawn); camera.position.y = (groundAt(padSpawn, 20) ?? padSpawn.y) + EYE; camera.lookAt(padLook);
  } else { camera.position.copy(spawnPoint).setY(spawnEye); camera.lookAt(spawnLook); }
  hands.visible = true; $('hud').style.visibility = 'visible'; marker.visible = true;
  if (fromPad && !TEST) { $('start').style.display = 'none'; freeRun = true; $('lookHint').style.display = IS_TOUCH ? 'none' : 'block'; }
}
// first click on the game after the intro takes the mouse (pointer lock can only start from a click)
renderer.domElement.addEventListener('click', () => { if (started && !controls.isLocked && !mission?.open && !TEST && !IS_TOUCH) controls.lock(); });
controls.addEventListener('lock', () => { $('start').style.display = 'none'; freeRun = false; $('lookHint').style.display = 'none'; });
controls.addEventListener('unlock', () => {
  if (mission?.open) return;
  $('start').style.display = 'flex'; $('start').classList.add('paused');
  $('st-eyebrow').textContent = 'PAUSED'; $('play').textContent = '▶ RESUME'; $('play').disabled = false;   // it was disabled while the intro loaded
});
// ambient occlusion: soft contact shadows in corners, under furniture and along trims
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
ao.blendIntensity = 1.0;
composer.addPass(ao);
if (IS_TOUCH) ao.enabled = false;   // ambient occlusion is the heaviest pass: skip it on phones
composer.addPass(new OutputPass());
// First-person arms sit centimetres from the camera, so ambient occlusion would smear dark halos around them.
// They live on layer 2: the scene (+AO) is drawn without them, then they are drawn on top with a fresh depth buffer.
const ARMS = 2;
function draw() {
  camera.layers.disable(ARMS);
  composer.render();
  camera.layers.set(ARMS);
  const bg = scene.background; scene.background = null;   // keep the composed frame underneath
  renderer.autoClear = false; renderer.clearDepth();
  renderer.render(scene, camera);
  renderer.autoClear = true; scene.background = bg;
  camera.layers.set(0);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- loop
let nearest = null;
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();

function roomName(p) {
  const [lx, ly] = toLocal(p);
  for (const [n, [x0, y0, x1, y1]] of Object.entries(ROOMS)) if (lx > x0 && lx < x1 && ly > y0 && ly < y1) return n;
  return lx > -5.5 && lx < 21.5 && ly > -11 && ly < 11 ? 'Corridor' : 'Lunar surface';
}

// one frame of driving: rover physics, then the chase (or Mastcam) camera. Returns the "feet" point (rover position).
const _cam = new THREE.Vector3(), _look = new THREE.Vector3(), _n = new THREE.Vector3();
function drive(dt) {
  const input = { throttle: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), steer: (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0), boost: keys.ShiftLeft };
  rover.update(dt, input,
    (x, z) => groundAt(new THREE.Vector3(x, rover.root.position.y, z), 20, rover.root),
    (from, dir, dist) => {
      // rocks, buildings and the monolith stop the rover; terrain only if steeper than ~41° (it climbs the rest)
      const h = cast(from, dir, dist, rover.root);
      if (!h) return false;
      if (h.object.name !== 'MoonSurface' || !h.face) return true;
      return _n.copy(h.face.normal).transformDirection(h.object.matrixWorld).y < 0.75;
    });
  const f = rover.forward(), at = rover.root.position;
  if (keepInside(at)) rover.state.speed = 0;   // hit the edge of the map
  if (mastView) {                                  // from the Mastcam-Z head, looking ahead
    rover.mastPosition(_cam).addScaledVector(f, 0.35);
    camera.position.copy(_cam);
    camera.lookAt(_look.copy(_cam).addScaledVector(f, 10).setY(_cam.y - 1.2));
  } else {                                         // chase camera behind, orbit with the mouse
    const a = Math.atan2(-f.x, -f.z) + orbit.yaw, dist = 7.5;
    _cam.set(at.x + Math.sin(a) * Math.cos(orbit.pitch) * dist, at.y + 1.2 + Math.sin(orbit.pitch) * dist, at.z + Math.cos(a) * Math.cos(orbit.pitch) * dist);
    const gy = groundAt(_cam, 30, rover.root);
    if (gy !== null) _cam.y = Math.max(_cam.y, gy + 0.6);
    camera.position.lerp(_cam, 1 - Math.exp(-dt * 8));
    camera.lookAt(_look.copy(at).setY(at.y + 1.3));
  }
  ui.speed.textContent = `${Math.abs(rover.state.speed * 3.6).toFixed(0)} km/h`;
  return at.clone();
}

// clamp a position to the walkable area; true if it had to be moved
function keepInside(p) {
  const x = THREE.MathUtils.clamp(p.x, bounds.x0, bounds.x1), z = THREE.MathUtils.clamp(p.z, bounds.z0, bounds.z1);
  const moved = x !== p.x || z !== p.z; p.x = x; p.z = z; return moved;
}

function update(dt) {
  if (!player) return;   // world still loading (test mode runs the loop before build() finishes)
  let feet = camera.position.clone(); feet.y -= EYE;
  if (driving) feet = drive(dt);
  else {

  // walk
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, UP);
  move.set(0, 0, 0);
  if (!talking && !mission?.open) {
    if (keys.KeyW) move.add(fwd); if (keys.KeyS) move.sub(fwd);
    if (keys.KeyD) move.add(right); if (keys.KeyA) move.sub(right);
  }
  if (move.lengthSq()) {
    move.normalize().multiplyScalar((keys.ShiftLeft ? RUN : WALK) * dt);
    for (const axis of [new THREE.Vector3(move.x, 0, 0), new THREE.Vector3(0, 0, move.z)]) { // slide along walls
      const d = axis.length(); if (!d) continue;
      if (!blocked(feet, axis.clone().normalize(), d)) feet.add(axis);
    }
  }

  keepInside(feet);

  // gravity + ground (step up small ledges, fall in 1/6 g)
  const wasGrounded = grounded, fallV = vy;
  vy -= GRAVITY * dt; feet.y += vy * dt;
  const g = cast(feet.clone().setY(feet.y + STEP + 0.3), DOWN, 50);
  // stick to the ground when walking down slopes; only jumps leave the surface
  if (g && (feet.y <= g.point.y + 0.02 || (grounded && vy <= 0 && feet.y - g.point.y < 0.5))) { feet.y = g.point.y; vy = 0; grounded = true; } else grounded = false;
  if (vy > 0 && cast(feet.clone().setY(feet.y + EYE), UP, 0.25)) vy = 0;   // head hits ceiling
  camera.position.copy(feet).setY(feet.y + EYE);
  player.update(feet, move.lengthSq() > 0, keys.ShiftLeft, clock.elapsedTime);
  // footsteps every ~1 m (longer strides when running), and a thud after a jump
  const inside = roomName(feet) !== 'Lunar surface';
  if (grounded) stepDist += move.length();
  if (stepDist > (keys.ShiftLeft ? 1.5 : 1.0)) { stepDist = 0; sfx.step(inside); }
  if (grounded && !wasGrounded && fallV < -1.2) sfx.land();
  }
  sfx.rover(driving ? Math.abs(rover.state.speed) + 0.001 : 0);
  sfx.ambient(!driving && roomName(feet) !== 'Lunar surface');
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();

  // sun shadow box follows the player
  sun.target.position.copy(feet); sun.position.copy(feet).addScaledVector(SUN_DIR, 120);

  // doors open when you're close
  for (const d of doors) {
    const want = d.centre.distanceTo(camera.position) < 2.6 ? 1 : 0;
    if (want && d.t === 0) { d.slide.copy(slideFor(d)); sfx.door(true); }
    if (!want && d.t === 1) sfx.door(false);
    d.t += Math.sign(want - d.t) * Math.min(Math.abs(want - d.t), dt * 1.8);
    const e = d.t * d.t * (3 - 2 * d.t);
    d.mesh.position.copy(d.closed).addScaledVector(d.slide, e);
    d.lamp.color.setHex(d.t > 0.05 ? 0x22ff55 : 0xff2a1a);
    d.mesh.updateMatrixWorld(true);
  }

  // crew turn to face you and breathe
  for (const n of npcs) {
    const t = camera.position.clone(); t.y = n.position.y;
    if (t.distanceTo(n.position) < 8) { n.lookAt(t); n.rotateY(Math.PI); }   // suit front is -Z, lookAt aims +Z
    animateAstronaut(n, dt);
  }

  // what can I interact with?
  nearest = null; let best = REACH;
  nearRover = !driving && rover.root.position.distanceTo(feet) < 3.4;
  if (!driving) for (const [id, t] of Object.entries(targets)) {
    const d = t.pos.distanceTo(camera.position.clone().setY(camera.position.y - 0.6));
    if (d < best && (IDLE[id] || openTasks(mission.state).some((x) => x.who === id))) { best = d; nearest = id; }
  }
  ui.prompt.textContent = talking || driving ? '' : nearest ? `Press E — ${NAMES[nearest]}` : nearRover ? 'Press E — Drive the rover' : '';

  // HUD: where am I, and which way is the next task?
  ui.room.textContent = '📍 ' + roomName(feet);
  mission.tick(dt, driving || roomName(feet) === 'Lunar surface');
  const edgeDist = Math.min(feet.x - bounds.x0, bounds.x1 - feet.x, feet.z - bounds.z0, bounds.z1 - feet.z);
  if (edgeDist < 25 && ui.edge.style.display !== 'block') sfx.warn();
  ui.edge.style.display = edgeDist < 25 ? 'block' : 'none';
  if (!driving && feet.y < bounds.low - 30) {   // safety net: fell through something -> back to the airlock
    camera.position.copy(spawnPoint).setY((groundAt(spawnPoint) ?? spawnPoint.y) + EYE); vy = 0;
  }
  const m = mission.state;
  if (`${m.sol}|${m.done.length}|${m.forecastKnown}|${!!m.over}` !== hudKey) refreshHud();   // new sol or forecast
  const s = current();
  if (s) {
    const to = targets[s.who].pos.clone().sub(camera.position); to.y = 0;
    const ang = Math.atan2(to.x, -to.z) - Math.atan2(fwd.x, -fwd.z);
    ui.arrow.style.transform = `rotate(${ang}rad)`;
    ui.dist.textContent = `${Math.round(to.length())} m`;
  } else { ui.dist.textContent = ''; ui.arrow.style.transform = 'scale(0)'; }

  // arms bob while walking
  if (hands) hands.position.y = move.lengthSq() ? Math.sin(clock.elapsedTime * (keys.ShiftLeft ? 11 : 7)) * 0.012 : 0;
  marker.material.opacity = 0.18 + Math.sin(clock.elapsedTime * 3) * 0.08;
  scene.userData.earth.rotation.y += dt * 0.01; scene.userData.clouds.rotation.y += dt * 0.004;
  marker.visible = !!s && marker.position.distanceTo(feet) > 6;   // the beam guides from afar; up close it would hide the target
}

// title screen: slow orbit around the base, astronaut's arms hidden
function attract(dt) {
  attractT += dt * 0.06;
  hands.visible = false; marker.visible = false;
  camera.position.copy(habAt(9 + Math.cos(attractT) * 34, Math.sin(attractT) * 34, 11));
  camera.lookAt(habAt(9, 0, 1.5));
  sun.target.position.copy(habAt(9, 0)); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 120);
}

renderer.setAnimationLoop(() => {
  if (introState === 'playing') return;   // the intro has the GPU
  const dt = Math.min(clock.getDelta(), 0.05);
  if (active()) update(dt);
  if (touch) { touch.show(started && freeRun && !mission?.open); touch.driving(driving); }
  else if (!started && player) attract(dt);
  draw();
});

build().then(() => {
  if (TEST) window.game = { mission, player, rover, get driving() { return driving; }, enterRover, exitRover, camera, targets, hab: (...a) => habAt(...a), solids, doors, npcs, update, draw, ao, renderer, scene, sun, composer,
    tick: (n = 1) => { for (let i = 0; i < n; i++) update(1 / 60); draw(); }, tasks: () => openTasks(mission.state), choose, touch, get talking() { return talking; } };
  $('loading').textContent = ''; $('loadbar').style.display = 'none'; $('play').disabled = false; })
  .catch((e) => { $('loading').textContent = 'Failed to load models: ' + e.message; console.error(e); });
