// Procedural lunar EVA astronaut (NPCs) and first-person gloves.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TEX } from './textures.js';

const mats = {};
function M() {
  if (mats.suit) return mats;
  mats.suit = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, map: TEX.fabric, bumpMap: TEX.fabric, bumpScale: 0.6, roughness: 0.85 });
  mats.hard = new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.35, metalness: 0.05 });
  mats.metal = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, roughness: 0.25, metalness: 1 });
  mats.dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7 });
  mats.boot = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, map: TEX.fabric, roughness: 0.9 });
  mats.sole = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
  mats.visor = new THREE.MeshStandardMaterial({ color: 0xd9a520, roughness: 0.05, metalness: 1 });
  mats.glove = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, map: TEX.fabric, roughness: 0.75 });
  mats.palm = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 });
  mats.screen = new THREE.MeshStandardMaterial({ color: 0x0a1a24, emissive: 0x2fb8ff, emissiveIntensity: 0.8 });
  mats.lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 3 });
  return mats;
}
const accentMat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6 });

const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
};
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);
const ring = (r, tube) => new THREE.TorusGeometry(r, tube, 8, 24);

// One gloved hand, fingers along -Z, palm facing down (-Y). curl: 0 open .. 1 fist
export function makeGlove(curl = 0.35, side = 1) {
  const m = M(), hand = new THREE.Group();
  add(hand, new RoundedBoxGeometry(0.09, 0.035, 0.1, 3, 0.015), m.glove, 0, 0, -0.04);
  add(hand, new THREE.BoxGeometry(0.075, 0.006, 0.08), m.palm, 0, -0.019, -0.04);       // grip pad
  add(hand, new THREE.CylinderGeometry(0.052, 0.05, 0.05, 18), m.glove, 0, 0, 0.02, Math.PI / 2);
  [-0.03, -0.01, 0.01, 0.03].forEach((x, i) => {
    const f = new THREE.Group(); f.position.set(x * side, 0, -0.09); hand.add(f);
    const len = [0.032, 0.038, 0.036, 0.028][i];
    f.rotation.x = -curl * 0.9;
    add(f, capsule(0.0105, len), m.glove, 0, 0, -len / 2 - 0.006, Math.PI / 2);
    const tip = new THREE.Group(); tip.position.z = -len - 0.012; tip.rotation.x = -curl * 1.1; f.add(tip);
    add(tip, capsule(0.0098, len * 0.8), m.glove, 0, 0, -len * 0.4, Math.PI / 2);
  });
  // thumb on the inner side: right hand (side 1) palm-down has it on -X
  const th = new THREE.Group(); th.position.set(-0.047 * side, -0.004, -0.03); th.rotation.set(-0.2, -0.7 * side, -0.4 * side); hand.add(th);
  add(th, capsule(0.012, 0.035), m.glove, 0, 0, -0.025, Math.PI / 2);
  return hand;
}

// accent: role colour for arm/leg stripes and the helmet ID band
export function makeAstronaut(accent = 0x2f6fd0) {
  const m = M(), acc = accentMat(accent), root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  for (const s of [-1, 1]) {                                   // legs
    const hip = new THREE.Group(); hip.position.set(0.11 * s, 0.95, 0); body.add(hip);
    add(hip, capsule(0.085, 0.3), m.suit, 0, -0.2, 0);
    add(hip, ring(0.088, 0.012), m.metal, 0, -0.42, 0, Math.PI / 2);                  // knee bearing
    add(hip, ring(0.087, 0.018), acc, 0, -0.12, 0, Math.PI / 2);                       // thigh stripe
    add(hip, capsule(0.078, 0.3), m.suit, 0, -0.62, 0);
    add(hip, new RoundedBoxGeometry(0.15, 0.13, 0.28, 3, 0.04), m.boot, 0, -0.86, -0.04);
    add(hip, new THREE.BoxGeometry(0.16, 0.035, 0.3), m.sole, 0, -0.93, -0.04);
  }
  add(body, ring(0.17, 0.025), m.metal, 0, 1.0, 0, Math.PI / 2);                       // waist bearing
  add(body, new THREE.CylinderGeometry(0.18, 0.16, 0.16, 24), m.suit, 0, 1.06, 0);
  const torso = new THREE.LatheGeometry([[0.0, 0], [0.19, 0], [0.22, 0.12], [0.24, 0.3], [0.2, 0.42], [0.1, 0.46], [0, 0.46]]
    .map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const hut = add(body, torso, m.hard, 0, 1.12, 0); hut.scale.set(1.05, 1, 0.78);
  add(body, new RoundedBoxGeometry(0.2, 0.12, 0.09, 3, 0.02), m.hard, 0, 1.36, -0.2);  // chest control unit
  add(body, new THREE.PlaneGeometry(0.1, 0.05), m.screen, 0, 1.38, -0.246, 0, Math.PI);
  [-0.06, 0, 0.06].forEach((x, i) => add(body, new THREE.CylinderGeometry(0.012, 0.012, 0.015, 10),
    i === 1 ? acc : m.dark, x, 1.33, -0.25, Math.PI / 2));
  add(body, new RoundedBoxGeometry(0.44, 0.55, 0.22, 4, 0.05), m.hard, 0, 1.36, 0.25);  // life-support backpack
  add(body, new RoundedBoxGeometry(0.4, 0.12, 0.05, 3, 0.02), m.dark, 0, 1.18, 0.37);
  add(body, new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), m.metal, 0.17, 1.42, 0.37);
  add(body, ring(0.13, 0.02), m.metal, 0, 1.58, 0, Math.PI / 2);                        // neck ring

  const arms = [];
  for (const s of [-1, 1]) {                                   // arms hang from the shoulders
    const sh = new THREE.Group(); sh.position.set(0.27 * s, 1.47, 0); body.add(sh);
    add(sh, new THREE.SphereGeometry(0.085, 16, 12), m.hard, 0, 0, 0);
    add(sh, capsule(0.065, 0.2), m.suit, 0, -0.16, 0);
    add(sh, ring(0.068, 0.016), acc, 0, -0.1, 0, Math.PI / 2);
    const el = new THREE.Group(); el.position.y = -0.3; el.rotation.x = -0.35; sh.add(el);
    add(el, ring(0.064, 0.011), m.metal, 0, 0, 0, Math.PI / 2);
    add(el, capsule(0.058, 0.2), m.suit, 0, -0.14, 0);
    add(el, ring(0.06, 0.014), m.metal, 0, -0.27, 0, Math.PI / 2);                     // wrist disconnect
    const g = makeGlove(0.5, s); g.rotation.set(-Math.PI / 2, 0, -s * Math.PI / 2);   // fingers down, palm to the thigh
    g.position.y = -0.29; g.scale.setScalar(0.95); el.add(g);
    sh.rotation.z = 0.12 * s;
    arms.push(sh);
  }
  const head = new THREE.Group(); head.position.y = 1.7; body.add(head);              // helmet
  add(head, new THREE.SphereGeometry(0.19, 32, 24), m.hard, 0, 0, 0.02);
  const visor = add(head, new THREE.SphereGeometry(0.192, 32, 24, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.28, Math.PI * 0.42),
    m.visor, 0, 0, 0.02, 0, Math.PI, 0);
  visor.scale.set(1.01, 1.01, 1.01);
  add(head, ring(0.125, 0.014), acc, 0, 0.15, 0.02, Math.PI / 2); // role-colour ring on the crown, clear of the visor
  for (const s of [-1, 1]) add(head, new THREE.BoxGeometry(0.05, 0.03, 0.05), m.lamp, 0.16 * s, 0.08, -0.06);

  root.userData = { body, head, arms, t: Math.random() * 10 };
  return root;
}

// idle animation: breathing, small sway, arms drifting
export function animateAstronaut(a, dt) {
  const u = a.userData; u.t += dt;
  u.body.position.y = Math.sin(u.t * 1.6) * 0.006;
  u.head.rotation.y = Math.sin(u.t * 0.5) * 0.15;
  u.arms.forEach((s, i) => { s.rotation.x = Math.sin(u.t * 0.9 + i) * 0.06; });
}
