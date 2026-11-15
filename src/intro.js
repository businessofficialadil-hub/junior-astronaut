// ASTROPHAGE · Day 1 intro cinematic, real-time in three.js (no video file).
// Earth → launch → staging → Earth orbit → translunar coast → lunar orbit → station docking → lander descent →
// touchdown at the game's own landing zone, with the base in view. Artemis-inspired, fictional, not NASA footage.
// Everything is a pure function of the playback time t, so the timeline can be scrubbed: playIntro(..).seek(t).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildBase } from './base.js';
import { sfx } from './sfx.js';
export { sfx };   // the preview page must start the same audio module the intro plays through

const DURATION = 108;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------- textures (canvas, no files)
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
let rnd = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const TX = {};
function makeTextures() {
  TX.foam = canvasTex(256, 1024, (g, w, h) => {          // core-stage orange spray-on foam: mottled, seams, ring bands
    g.fillStyle = '#c8681f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,160,80' : '120,50,10'},${rnd() * .18})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 8, 2 + rnd() * 6); }
    g.fillStyle = 'rgba(70,30,5,.45)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h);
    g.fillStyle = 'rgba(60,25,5,.6)'; for (const y of [0.12, 0.38, 0.62, 0.9]) g.fillRect(0, y * h, w, 6);
  });
  TX.white = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#eceae4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * .04})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  });
  TX.solar = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#0d1d4a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4b6aa8'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  TX.foil = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9971d'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = rnd() < .5 ? `rgba(255,225,130,${rnd() * .45})` : `rgba(80,50,0,${rnd() * .4})`;
      g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + rnd() * 50 - 25, y + rnd() * 50 - 25); g.lineTo(x + rnd() * 50 - 25, y + rnd() * 50 - 25); g.fill(); }
  });
  TX.moon = canvasTex(2048, 1024, (g, w, h) => {           // procedural Moon: highlands, dark maria, craters with rays
    g.fillStyle = '#9b9a96'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { const x = rnd() * w, y = h * (0.25 + rnd() * 0.5), r = 80 + rnd() * 220;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(60,60,62,.75)'); gr.addColorStop(1, 'rgba(60,60,62,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    for (let i = 0; i < 1400; i++) { const x = rnd() * w, y = rnd() * h, r = Math.pow(rnd(), 3) * 40 + 1;
      g.fillStyle = 'rgba(50,50,50,.35)'; g.beginPath(); g.arc(x + r * .2, y + r * .2, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(210,210,205,.35)'; g.beginPath(); g.arc(x - r * .15, y - r * .15, r * .8, 0, 7); g.fill(); }
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},${rnd() * .08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
  TX.ground = canvasTex(512, 512, (g, w, h) => {           // launch-site ground: dry grass and sand
    g.fillStyle = '#6f7b4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8000; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '150,140,90' : '50,60,30'},${rnd() * .3})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
  });
  TX.ground.wrapS = TX.ground.wrapT = THREE.RepeatWrapping; TX.ground.repeat.set(60, 60);
  TX.puff = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const tl = new THREE.TextureLoader();
  TX.earth = tl.load('/textures/Earth/earth.jpg'); TX.earth.colorSpace = THREE.SRGBColorSpace; TX.earth.anisotropy = 8;
  TX.clouds = tl.load('/textures/Earth/clouds.png');
  TX.concrete = tl.load('/textures/Concrete034/color.jpg'); TX.concrete.colorSpace = THREE.SRGBColorSpace;
  TX.concrete.wrapS = TX.concrete.wrapT = THREE.RepeatWrapping; TX.concrete.repeat.set(8, 8);
}

// ---------------------------------------------------------------- model helpers
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...o });
function mesh(geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
const cyl = (rt, rb, h, seg = 32, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const bell = (r0, r1, h) => new THREE.LatheGeometry([...Array(9)].map((_, i) => { const u = i / 8; return new THREE.Vector2(lerp(r0, r1, u * u), -u * h); }), 24);
function glowMat(color) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); }

// engine plume: open cone with a hot core fading to nothing, flickering
function makePlume(radius, length, hot = 0xfff1c0, cool = 0xff7a1a) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uHot: { value: new THREE.Color(hot) }, uCool: { value: new THREE.Color(cool) } },
    vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
#include <logdepthbuf_vertex>
}`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform float uTime, uPower; uniform vec3 uHot, uCool; varying vec2 vUv;
      void main(){
#include <logdepthbuf_fragment>
 float along = vUv.y; float f = 0.85 + 0.15 * sin(uTime * 60.0 + along * 20.0);
        vec3 c = mix(uCool, uHot, pow(along, 4.0)); float a = min(1.0, pow(along, 1.2) * uPower * f * 1.6);
        gl_FragColor = vec4(c * 1.6, a); }`,
  });
  // the cone's apex (uv.y = 1, the hot end) sits at the nozzle, y = 0; the plume widens downwards to y = -length
  const geo = new THREE.ConeGeometry(radius, length, 24, 1, true); geo.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 5; return m;
}

// soft particles (smoke, dust): per-particle size and fade, CPU-updated
class Puffs {
  constructor(n, color, parent) {
    this.n = n; this.next = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.size = new Float32Array(n); this.grow = new Float32Array(n); this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uMap: { value: TX.puff }, uColor: { value: new THREE.Color(color) }, uScale: { value: 600 } },
      vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv;
#include <logdepthbuf_vertex>
}`,
      fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
        void main(){
#include <logdepthbuf_fragment>
 vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
    });
    mat.uniforms.uScale = { value: 600 };
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; parent.add(this.points);
  }
  emit(p, v, life, size, grow) {
    const i = this.next; this.next = (i + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
  }
  update(dt, gravity = 0, drag = 0.5, floorY = -1e9) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = i * 3;
      this.vel[k + 1] -= gravity * dt;
      for (let a = 0; a < 3; a++) { this.vel[k + a] *= 1 - drag * dt; this.pos[k + a] += this.vel[k + a] * dt; }
      if (this.pos[k + 1] < floorY) { this.pos[k + 1] = floorY; this.vel[k + 1] = 0; }
      this.size[i] += this.grow[i] * dt;
      const u = this.life[i] / this.max[i]; this.alpha[i] = Math.min(1, u * 1.5) * 0.55;
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

// ---------------------------------------------------------------- spacecraft
function makeOrion() {
  const o = new THREE.Group(), white = std({ map: TX.white, roughness: .5 }), silver = std({ color: 0xc9ccd2, metalness: .7, roughness: .35 });
  const dark = std({ color: 0x24262a, roughness: .8 });
  mesh(cyl(2.5, 2.5, 4.2), white, o, 0, 2.1);                              // European-style service module
  mesh(cyl(2.52, 2.52, 0.5), dark, o, 0, 4.1);
  mesh(cyl(2.5, 1.05, 3.3, 32), silver, o, 0, 6.0);                        // crew module (capsule)
  mesh(cyl(0.7, 0.7, 0.5), dark, o, 0, 7.9);                              // docking hatch
  for (const [x, z] of [[1.5, 1.3], [-1.6, 1.0]]) mesh(new THREE.BoxGeometry(.35, .25, .05), std({ color: 0x0b1420, metalness: .9, roughness: .1 }), o, x * .6, 6.2, z * .9);
  mesh(bell(0.35, 0.9, 1.6), dark, o, 0, 0);                               // main engine
  const glow = mesh(new THREE.SphereGeometry(.7, 16, 8), glowMat(0x9fd0ff), o, 0, -0.4); glow.castShadow = false;
  const plume = makePlume(1.4, 9, 0xd8ecff, 0x4f8cff); plume.position.y = -1.5; o.add(plume);
  const wings = [];
  for (let i = 0; i < 4; i++) {                                           // X-wing solar arrays, hinged at the module
    const hinge = new THREE.Group(); hinge.position.set(0, 1.4, 0); hinge.rotation.y = i * Math.PI / 2 + Math.PI / 4; o.add(hinge);
    const arm = new THREE.Group(); arm.position.x = 2.5; hinge.add(arm);
    mesh(new THREE.BoxGeometry(7, .06, 2.0), std({ map: TX.solar, metalness: .5, roughness: .25 }), arm, 3.6, 0, 0);
    wings.push(arm);
  }
  o.userData = { glow, plume, wings,
    deploy(d) { wings.forEach((w) => { w.rotation.z = lerp(-Math.PI / 2 + .05, 0, d); }); },   // folded along the side -> straight out
    burn(p, t) { glow.material.opacity = p * .9; plume.material.uniforms.uPower.value = p; plume.material.uniforms.uTime.value = t; } };
  o.userData.deploy(0);
  return o;
}

function makeRocket() {
  const R = new THREE.Group(), core = new THREE.Group(), srbs = [], upper = new THREE.Group();
  R.add(core, upper);
  const orange = std({ map: TX.foam, roughness: .85 }), white = std({ map: TX.white, roughness: .55 }), dark = std({ color: 0x1d1f22, roughness: .7, metalness: .4 });
  mesh(cyl(4.2, 4.2, 64), orange, core, 0, 36);                          // core stage
  mesh(cyl(4.25, 4.25, 4), dark, core, 0, 2);                            // engine section
  const coreBells = [];
  for (const [x, z] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) coreBells.push(mesh(bell(.55, 1.15, 3), dark, core, x, 0, z));
  const corePlume = makePlume(7, 85, 0xfff4d0, 0xff6a10); core.add(corePlume);
  for (const s of [-1, 1]) {                                            // two five-segment boosters
    const b = new THREE.Group(); b.position.x = s * 6.3; R.add(b); srbs.push(b);
    mesh(cyl(1.85, 1.85, 50), white, b, 0, 27);
    for (let k = 1; k < 5; k++) mesh(cyl(1.88, 1.88, .4), dark, b, 0, 2 + k * 10);
    mesh(new THREE.ConeGeometry(1.85, 7, 32), white, b, 0, 55.5);
    mesh(bell(.9, 1.6, 3), dark, b, 0, 2);
    mesh(new THREE.BoxGeometry(.6, .6, 1.6), dark, b, -s * 1.9, 45, 0);   // attach struts
    mesh(new THREE.BoxGeometry(.6, .6, 1.6), dark, b, -s * 1.9, 8, 0);
    const p = makePlume(4.6, 95, 0xfffbe8, 0xff8a20); p.position.y = -1; b.add(p); b.userData.plume = p;
  }
  // upper stage + Orion under its launch abort tower
  mesh(cyl(2.6, 4.2, 8), orange, upper, 0, 72);                          // stage adapter
  mesh(cyl(2.55, 2.55, 9), white, upper, 0, 80.5);                       // upper stage
  const orion = makeOrion(); orion.position.y = 85; upper.add(orion);
  const las = new THREE.Group(); las.position.y = 85; upper.add(las);
  mesh(cyl(1.2, 2.6, 8.5, 32), white, las, 0, 5.2);                      // abort-system fairing over the capsule
  mesh(cyl(.35, .35, 7), white, las, 0, 12.5);
  mesh(new THREE.ConeGeometry(.35, 1.8, 16), dark, las, 0, 16.9);
  R.userData = { core, srbs, upper, orion, las, corePlume, coreBells };
  return R;
}

function makeStation() {
  const S = new THREE.Group(), white = std({ map: TX.white, roughness: .5 }), foil = std({ map: TX.foil, metalness: .8, roughness: .45 });
  const dark = std({ color: 0x2a2c30, roughness: .7 }), ring = std({ color: 0xb8bdc4, metalness: .8, roughness: .3 });
  const Z = (geo, mat, x, y, z) => mesh(geo, mat, S, x, y, z, 0, 0, Math.PI / 2);   // modules lie along X
  Z(cyl(2.2, 2.2, 7.5), white, 0, 0, 0);                                  // habitation module
  Z(cyl(2.3, 2.3, 6), foil, -7.2, 0, 0);                                  // power & propulsion module
  Z(cyl(2.0, 2.0, 5), white, 6.6, 0, 0);                                  // second habitat
  Z(cyl(1.0, 1.0, 1.6), dark, 10.0, 0, 0);                                // Orion docking port (+X)
  Z(new THREE.TorusGeometry(1.0, .12, 8, 24), ring, 10.8, 0, 0).rotation.set(0, Math.PI / 2, 0);
  mesh(cyl(1.1, 1.1, 1.8), dark, S, 0, -2.9, 0);                          // lander port (nadir)
  mesh(new THREE.TorusGeometry(1.1, .12, 8, 24), ring, S, 0, -3.8, 0, Math.PI / 2);
  for (const s of [-1, 1]) {                                              // big roll-out arrays on booms
    mesh(cyl(.12, .12, 9), dark, S, -7.2, 0, s * 6.8, Math.PI / 2);
    mesh(new THREE.BoxGeometry(5.5, .08, 18), std({ map: TX.solar, metalness: .5, roughness: .25 }), S, -7.2, 0, s * 20);
  }
  mesh(cyl(.08, .08, 3), dark, S, 2, 2.6, 0);                             // comms mast + dish
  const dish = mesh(new THREE.SphereGeometry(1.2, 24, 8, 0, Math.PI * 2, 0, .9), white, S, 2, 4.2, 0, Math.PI, 0, 0); dish.scale.y = .5;
  const lights = [];
  for (const p of [[-10.3, 0, 0], [8.8, 1.8, 0], [0, 2.3, 0], [8.8, -1.8, 0]]) {
    const l = mesh(new THREE.SphereGeometry(.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }), S, ...p); l.castShadow = false; lights.push(l);
  }
  S.userData = { lights, dockPort: V(11.0, 0, 0), landerPort: V(0, -3.9, 0) };
  return S;
}

// the same lander for the game world: it stays on the landing pad after the intro
export function makeGameLander() { if (!TX.foil) makeTextures(); const L = makeLander(); L.userData.burn(0, 0); return L; }

function makeLander() {
  const L = new THREE.Group(), foil = std({ map: TX.foil, metalness: .8, roughness: .45 }), white = std({ map: TX.white, roughness: .5 });
  const dark = std({ color: 0x232528, roughness: .7, metalness: .4 }), metal = std({ color: 0xaab0b8, metalness: .9, roughness: .3 });
  mesh(cyl(3, 3, 3, 8), foil, L, 0, 4.2);                                // descent stage (octagonal)
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; mesh(new THREE.SphereGeometry(.9, 16, 10), metal, L, Math.cos(a) * 2.3, 4.4, Math.sin(a) * 2.3); }
  mesh(bell(.6, 1.3, 1.8), dark, L, 0, 2.7);                             // descent engine
  const legs = [];
  for (let i = 0; i < 4; i++) {                                          // landing legs with footpads
    const a = i * Math.PI / 2, leg = new THREE.Group(); leg.position.set(Math.cos(a) * 2.6, 3.4, Math.sin(a) * 2.6); leg.rotation.y = -a; L.add(leg);
    const strut = mesh(cyl(.13, .13, 4.2), metal, leg, 1.15, -1.75, 0, 0, 0, .58);
    mesh(cyl(.65, .75, .22), metal, leg, 2.35, -3.3, 0);
    mesh(cyl(.07, .07, 2.6), metal, leg, .5, -1.6, 0, 0, 0, -.35);
    legs.push(leg); strut.userData.leg = true;
  }
  mesh(cyl(2.1, 2.3, 3.2, 12), white, L, 0, 7.3);                        // ascent stage / crew cabin
  mesh(new THREE.SphereGeometry(2.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), white, L, 0, 8.9);
  for (const a of [-.35, .35]) mesh(new THREE.BoxGeometry(.7, .55, .1), std({ color: 0x0b1420, metalness: .9, roughness: .1 }), L, Math.sin(a) * 2.25, 8.0, Math.cos(a) * 2.25, 0, a, 0);
  mesh(new THREE.BoxGeometry(1.1, 1.6, .12), dark, L, 0, 6.9, -2.25);    // hatch
  mesh(cyl(.8, .8, .6), dark, L, 0, 11.2);                               // docking interface
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; mesh(new THREE.BoxGeometry(.4, .4, .4), dark, L, Math.cos(a) * 2.4, 8.4, Math.sin(a) * 2.4); }  // RCS quads
  const plume = makePlume(1.3, 10, 0xffffff, 0x9cc4ff); plume.position.y = .9; L.add(plume);
  const light = new THREE.PointLight(0xffe2b0, 0, 60, 1.5); light.position.y = -1; L.add(light);
  L.userData = { plume, light, legs, burn(p, t) { plume.material.uniforms.uPower.value = p; plume.material.uniforms.uTime.value = t; light.intensity = p * 400; } };
  return L;
}

function makeEarth(r, parent) {
  const e = new THREE.Group(); parent.add(e);
  const ground = mesh(new THREE.SphereGeometry(r, 96, 48), std({ map: TX.earth, roughness: .8, metalness: 0 }), e);
  const clouds = mesh(new THREE.SphereGeometry(r * 1.008, 96, 48), std({ map: TX.clouds, transparent: true, opacity: .9, depthWrite: false }), e);
  const rim = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 96, 48), new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
varying vec3 vN; varying vec3 vV; void main(){
#include <logdepthbuf_fragment>
 float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(0.35, 0.62, 1.0, f); }`,
  }));
  e.add(rim); ground.castShadow = clouds.castShadow = false;
  e.userData = { ground, clouds };
  return e;
}
const makeMoon = (r, parent) => { const m = mesh(new THREE.SphereGeometry(r, 128, 64), std({ map: TX.moon, bumpMap: TX.moon, bumpScale: 2, roughness: 1 }), parent); m.castShadow = false; return m; };

function makeStars(parent) {
  const n = 6000, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = V().randomDirection().multiplyScalar(4e6); p.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0xffffff })); s.frustumCulled = false;
  parent.add(s); return s;
}

// ---------------------------------------------------------------- the cinematic
export async function playIntro({ renderer, onDone, overlay }) {
  makeTextures();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 2e7);
  const sun = new THREE.DirectionalLight(0xfff4e2, 3.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 120, bottom: -40, near: 1, far: 800 });
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x8899bb, 0x222222, .3));
  const stars = makeStars(scene);

  // sets, shown one at a time (each has its own scale, like separate film sets)
  const sets = {}; for (const k of ['earth', 'pad', 'ascent', 'orbit', 'transit', 'lunar', 'surface']) { sets[k] = new THREE.Group(); scene.add(sets[k]); }
  // 1 Earth from space
  const earthBig = makeEarth(100, sets.earth);
  // 2 launch pad
  const padGround = mesh(new THREE.PlaneGeometry(4000, 4000), std({ map: TX.ground, roughness: 1 }), sets.pad, 0, 0, 0, -Math.PI / 2);
  mesh(new THREE.BoxGeometry(60, 1, 60), std({ map: TX.concrete, color: 0x9a9893, roughness: 1 }), sets.pad, 0, .5, 0);
  const mlp = mesh(new THREE.BoxGeometry(46, 5, 38), std({ color: 0x3a3d42, roughness: .8, metalness: .3 }), sets.pad, 0, 2.5, 0);
  for (const [x, z] of [[6.3, 1.4], [6.3, -1.4], [-6.3, 1.4], [-6.3, -1.4]]) mesh(cyl(.5, .7, 4), std({ color: 0x2a2c30, metalness: .5 }), sets.pad, x, 7, z);   // hold-down posts
  mlp.userData.deck = 5;
  { // lattice launch tower, with an access arm to the capsule
    const g = new THREE.BoxGeometry(.5, 1, .5), m = std({ color: 0x5b5f66, metalness: .6, roughness: .5 });
    const beams = []; const T = (x, y, z, h, rx = 0, rz = 0) => beams.push({ x, y, z, h, rx, rz });
    for (const [x, z] of [[-14, -6], [-14, 6], [-26, -6], [-26, 6]]) T(x, 62, z, 116);
    for (let y = 8; y < 120; y += 6) { T(-20, y, -6, 12, 0, Math.PI / 2); T(-20, y, 6, 12, 0, Math.PI / 2); T(-14, y, 0, 12, Math.PI / 2); T(-26, y, 0, 12, Math.PI / 2);
      T(-20, y + 3, -6, 13.4, 0, .9); T(-20, y + 3, 6, 13.4, 0, -.9); }
    const im = new THREE.InstancedMesh(g, m, beams.length); const o = new THREE.Object3D();
    beams.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.rotation.set(b.rx, 0, b.rz); o.scale.set(1, b.h, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = im.receiveShadow = true; sets.pad.add(im);
    mesh(new THREE.BoxGeometry(9, 1.6, 2.4), m, sets.pad, -9.5, 96, 0);  // crew access arm
    mesh(new THREE.BoxGeometry(8, 1, 1.6), m, sets.pad, -10, 60, 0);     // umbilical arm
  }
  const padRocket = makeRocket(); padRocket.position.y = 11; sets.pad.add(padRocket);   // engines clear the deck
  const smoke = new Puffs(900, 0xd9d6cf, sets.pad);
  const padLight = new THREE.PointLight(0xffb060, 0, 300, 1.2); padLight.position.set(0, 4, 0); sets.pad.add(padLight);
  // 3 ascent above Earth's curve
  const earthAscent = makeEarth(20000, sets.ascent); earthAscent.position.set(0, -26000, -12000);
  const ascRocket = makeRocket(); sets.ascent.add(ascRocket);
  // 4 Earth orbit
  const earthOrbit = makeEarth(60000, sets.orbit); earthOrbit.position.set(0, -60400, 0);
  const orbOrion = makeOrion(); sets.orbit.add(orbOrion);
  const icps = new THREE.Group(); sets.orbit.add(icps);
  mesh(cyl(2.55, 2.55, 9), std({ map: TX.white }), icps, 0, -4.5); mesh(bell(.5, 1.0, 1.8), std({ color: 0x222 }), icps, 0, -9);
  // 5 translunar coast
  const earthT = makeEarth(6371, sets.transit), moonT = makeMoon(1737, sets.transit);
  const trOrion = makeOrion(); trOrion.userData.deploy(1); sets.transit.add(trOrion);
  // 6-8 lunar orbit, station, docking, lander undock
  const moonL = makeMoon(17370, sets.lunar); moonL.position.set(0, -17700, 0);
  const station = makeStation(); station.position.set(0, 60, 0); sets.lunar.add(station);
  const lnOrion = makeOrion(); lnOrion.userData.deploy(1); sets.lunar.add(lnOrion);
  const lnLander = makeLander(); sets.lunar.add(lnLander);
  // 9-10 surface: the game's own terrain, landing zone and base
  const surf = await buildSurface(sets.surface);
  const lander = makeLander(); sets.surface.add(lander);
  const dust = new Puffs(1200, 0xb7b3ab, sets.surface);
  const earthSky = makeEarth(40, sets.surface); earthSky.position.set(600, 700, -900);

  // ---- overlay text
  const TITLES = [
    [2, 8.5, 'ASTROPHAGE — DAY 01', 'LUNAR EXPEDITION', 'big'],
    [9.5, 14.5, 'LAUNCH COMPLEX', 'Artemis-inspired heavy-lift rocket'],
    [42.5, 48.5, 'EARTH ORBIT ACHIEVED', ''],
    [52, 58.5, 'TRANSLUNAR TRANSIT', 'DESTINATION: LUNAR ORBIT'],
    [64.5, 68, 'LUNAR ORBIT ACHIEVED', ''],
    [76.5, 80, 'RENDEZVOUS COMPLETE', ''],
    [80.3, 82.8, 'DOCKING CONFIRMED', ''],
    [83, 87.5, 'LUNAR DESCENT PREPARATION', ''],
    [100.2, 104, 'LUNAR TOUCHDOWN CONFIRMED', ''],
    [104.2, 108, 'ASTROPHAGE — SURFACE ARRIVAL', 'Your 7-sol mission begins', 'big'],
  ];
  overlay.innerHTML = `<div class="in-black"></div><div class="in-title"><b></b><span></span></div><div class="in-count"></div>
    <div class="in-note">Artemis-inspired fictional animation · not NASA footage</div><button class="in-skip">Skip intro ▶▶</button>`;
  const black = overlay.querySelector('.in-black'), title = overlay.querySelector('.in-title'), count = overlay.querySelector('.in-count');
  overlay.querySelector('.in-skip').onclick = () => finish();

  // ---- sound cues, fired once when the playhead passes them
  const pad = (l) => () => sfx.pad(l);
  const CUES = [
    [0.3, pad(.6)], [2, () => sfx.radio()], [9.5, () => sfx.radio()],
    [18, () => sfx.beep()], [19, () => sfx.beep()], [20, () => sfx.beep()], [21, () => sfx.beep()], [22, () => sfx.beep()],   // T-5 .. T-1
    [20.5, pad(.25)], [21, () => sfx.rumble(.5)], [23, () => sfx.rumble(1)], [26, () => sfx.radio()],
    [33.5, () => sfx.bang()], [35.5, () => sfx.bang()], [38, () => sfx.rumble(.4)], [39, () => sfx.bang()],
    [42, () => sfx.rumble(0)], [42.2, pad(.7)], [42.6, () => sfx.radio()], [43.5, () => sfx.bang()], [45, () => sfx.hiss()], [46.2, () => sfx.hiss()],
    [49, () => sfx.rumble(.35)], [51, () => sfx.rumble(0)], [52, () => sfx.radio()], [54.5, () => sfx.hiss()], [57, () => sfx.hiss()], [59.5, () => sfx.hiss()],
    [64, () => sfx.rumble(.3)], [64.6, () => sfx.radio()], [66, () => sfx.rumble(0)],
    [70, () => sfx.hiss()], [73, () => sfx.hiss()], [76, () => sfx.hiss()], [76.6, () => sfx.radio()], [78.2, () => sfx.hiss()],
    [80, () => sfx.clunk()], [80.6, () => sfx.success()], [83, () => sfx.radio()], [84, () => sfx.bang()], [85.2, () => sfx.hiss()], [86.4, () => sfx.hiss()],
    [88, () => sfx.rumble(.45)], [88.2, pad(.35)], [98.6, () => sfx.land()], [99.3, () => sfx.rumble(0)],
    [100.2, () => sfx.radio()], [100.5, pad(.8)], [104.2, () => sfx.fanfare()], [107, pad(0)]].sort((a, b) => a[0] - b[0]);
  let cueAt = 0;

  function show(name) { for (const k in sets) sets[k].visible = k === name; }
  const look = (p, t) => { camera.position.copy(p); camera.lookAt(t); };
  const shake = (amt, t) => { camera.position.x += Math.sin(t * 47) * amt; camera.position.y += Math.sin(t * 61 + 1) * amt; };

  // ---------------------------------------------------------------- the timeline: everything from t
  let lastT = 0, warming = false;
  function frame(t, dt) {
    scene.updateMatrixWorld();
    // black fade at the start and the end
    black.style.opacity = t < 2 ? 1 - t / 2 : t > 106.5 ? (t - 106.5) / 1.5 : 0;
    const tt = TITLES.find(([a, b]) => t >= a && t < b);
    title.style.opacity = tt ? Math.min(1, (t - tt[0]) * 2, (tt[1] - t) * 2) : 0;
    if (tt) { title.querySelector('b').textContent = tt[2]; title.querySelector('span').textContent = tt[3]; title.className = 'in-title' + (tt[4] ? ' big' : ''); }
    count.textContent = t >= 17 && t < 23 ? (t < 22.8 ? `T – ${Math.max(0, Math.ceil(23 - t) - 1)}` : 'LIFTOFF') : '';
    stars.visible = !(t >= 9 && t < 31);

    if (t < 9) {                                                        // 1 · Earth reveal
      show('earth'); scene.background = new THREE.Color(0);
      sun.position.set(-400, 60, 200); sun.target.position.set(0, 0, 0);
      earthBig.rotation.y = 1.4 + t * 0.03; earthBig.userData.clouds.rotation.y = t * 0.01;
      look(V(lerp(70, 30, smooth(0, 9, t)), 25, lerp(420, 230, smooth(0, 9, t))), V(-20, 0, 0));
    } else if (t < 31) {                                                // 2 · launch pad, countdown, ignition, liftoff
      show('pad'); scene.background = new THREE.Color().setHSL(.58, .55, lerp(.62, .35, smooth(23, 31, t)));
      sun.position.set(200, 260, 140); sun.target.position.set(0, 40, 0);
      const ign = smooth(20.5, 23, t), lift = Math.max(0, t - 23), y = 11 + 2.2 * lift * lift;   // gentle then accelerating
      padRocket.position.y = y;
      const R = padRocket.userData;
      R.corePlume.material.uniforms.uPower.value = ign; R.corePlume.material.uniforms.uTime.value = t;
      for (const b of R.srbs) { b.userData.plume.material.uniforms.uPower.value = smooth(22.6, 23.2, t); b.userData.plume.material.uniforms.uTime.value = t; }
      padLight.intensity = ign * 6000 * (0.9 + Math.random() * .2); padLight.position.y = Math.max(7, y - 6);
      if (ign > 0 && dt > 0) for (let k = 0; k < (t < 26 ? 14 : 5); k++) {   // exhaust deflected along the ground, then rising behind
        const a = Math.random() * Math.PI * 2, sp = 18 + Math.random() * 30 * ign;
        smoke.emit(V(Math.cos(a) * 6, 6 + Math.random() * 3, Math.sin(a) * 6), V(Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp), 7 + Math.random() * 4, 14, 14);
      }
      if (lift > 0 && dt > 0) for (let k = 0; k < 6; k++) {          // the exhaust column left behind the climbing rocket
        const h = 6 + Math.random() * (y - 6);
        smoke.emit(V((Math.random() - .5) * 6, h, (Math.random() - .5) * 6), V((Math.random() - .5) * 3, 1, (Math.random() - .5) * 3), 6 + Math.random() * 3, 12, 6);
      }
      smoke.update(dt, -0.6, 0.35, 5.5);
      if (t < 15) { const a = t * .05; look(V(Math.cos(a) * 210, 45, Math.sin(a) * 210 + 40), V(0, 50, 0)); }
      else if (t < 19) look(V(lerp(30, 24, smooth(15, 19, t)), 3, 34), V(0, 70, 0));
      else if (t < 23) { look(V(20, 8, 24), V(0, 12, 0)); if (t > 21) shake(.12 * ign, t); }
      else { const cy = Math.max(30, y * .55); look(V(95, cy, 110), V(0, y + 40, 0)); shake(.25 * smooth(23, 25, t) * (1 - smooth(28, 31, t)), t); }
    } else if (t < 42) {                                                // 3 · ascent and staging over Earth's curve
      show('ascent'); scene.background = new THREE.Color().setHSL(.6, .5, lerp(.12, 0, smooth(31, 36, t)));
      sun.position.set(300, 200, 400); sun.target.position.set(0, 0, 0);
      const R = ascRocket.userData, u = t - 31;
      ascRocket.position.set(0, u * 6, 0); ascRocket.rotation.z = -0.25;           // pitching over downrange
      R.corePlume.material.uniforms.uPower.value = 1 - smooth(37.6, 38.2, t); R.corePlume.material.uniforms.uTime.value = t;
      const sep = Math.max(0, t - 33.5);
      R.srbs.forEach((b, i) => {
        const s = i ? 1 : -1;
        b.userData.plume.material.uniforms.uPower.value = t < 33.4 ? 1 : 0; b.userData.plume.material.uniforms.uTime.value = t;
        b.position.set(s * (6.3 + sep * 4 + sep * sep * .6), -sep * sep * 2.2, sep * 1.5); b.rotation.set(sep * .25, 0, s * sep * .35);
      });
      R.las.visible = t < 35.5;
      if (t > 35.5) R.las.position.y = 85 + (t - 35.5) * 60;
      const csep = Math.max(0, t - 39);                                           // core stage falls away, upper stage continues
      R.core.position.y = -csep * csep * 3; R.core.rotation.x = csep * .08;
      R.srbs.forEach((b) => { b.visible = t < 37; });
      R.upper.position.y = csep * 4;
      R.orion.userData.burn(t > 39.4 ? .6 : 0, t);
      ascRocket.updateMatrixWorld(true);
      const focus = ascRocket.localToWorld(V(0, t < 39 ? 45 : 75 + csep * 4, 0));
      look(focus.clone().add(V(t < 37 ? 120 : 70, 20, 90)), focus);
    } else if (t < 51) {                                                // 4 · Earth orbit: upper stage separates, arrays deploy, TLI burn
      show('orbit'); scene.background = new THREE.Color(0);
      sun.position.set(-200, 120, 150); sun.target.position.set(0, 0, 0);
      earthOrbit.rotation.y = t * .004; earthOrbit.userData.clouds.rotation.y = t * .006;
      const sepu = Math.max(0, t - 43.5);
      orbOrion.position.set(0, 0, 0); icps.position.set(0, -sepu * 1.6 - sepu * sepu * .05, 0); icps.rotation.x = sepu * .06;
      orbOrion.rotation.z = lerp(0, -.35, smooth(44, 49, t));
      orbOrion.userData.deploy(smooth(44.5, 47.5, t));
      orbOrion.userData.burn(smooth(48.8, 49.2, t) * (1 - smooth(50.6, 51, t)), t);
      if (t < 46) look(V(lerp(60, 30, smooth(42, 46, t)), 8, 40), V(0, 0, 0));
      else look(V(lerp(16, 11, smooth(46, 51, t)), 6, lerp(12, 9, smooth(46, 51, t))), V(0, 3, 0));
    } else if (t < 61) {                                                // 5 · translunar coast: Earth shrinks, Moon grows
      show('transit'); scene.background = new THREE.Color(0);
      sun.position.set(-500, 200, 300); sun.target.position.set(0, 0, 0);
      const u = smooth(51, 61, t);
      earthT.position.set(-6000, -3000, lerp(30000, 160000, u)); earthT.rotation.y = t * .02;
      moonT.position.set(9000, 2500, lerp(-140000, -30000, u)); moonT.rotation.y = 1.2;
      trOrion.rotation.set(0, Math.sin(t * .4) * .2, -.2);
      // first half: looking back past Orion at the shrinking Earth; second half: over its shoulder at the Moon
      const target = t < 56 ? earthT.position : moonT.position, away = V(0, 3, 0).sub(target).normalize();
      const side = V(-away.z, 0, away.x).multiplyScalar(6 + Math.sin(t * .5) * 3);
      look(V(0, 3, 0).add(away.multiplyScalar(22)).add(side).add(V(0, 5, 0)), V(0, 3, 0).lerp(target, 0.0001));
    } else if (t < 88) {                                                // 6-8 · lunar orbit, station, docking, lander undock
      show('lunar'); scene.background = new THREE.Color(0);
      sun.position.set(300, 250, 200); sun.target.position.copy(station.position);
      moonL.rotation.y = t * .002;
      const port = station.localToWorld(station.userData.dockPort.clone());
      // Orion: lunar flyby and orbit insertion (61-68), then a slow approach and soft dock (68-80)
      const dockT = clamp01((t - 68) / 12), e = 1 - Math.pow(1 - dockT, 3);   // closing fast, then creeping in to contact
      const approach = port.clone().add(V(260, 40, -120).multiplyScalar(1 - e));
      if (t < 68) { const u = smooth(61, 68, t); lnOrion.position.set(lerp(-1400, 400, u), lerp(400, 120, u), lerp(-300, -150, u)); lnOrion.rotation.set(0, 0, Math.PI / 2 * u); }
      else { lnOrion.position.copy(approach); lnOrion.rotation.set(0, 0, Math.PI / 2); }
      lnOrion.position.x += t >= 68 ? 7.9 + 0.25 : 0;                          // capsule nose (local +Y = world -X when rotated) meets the port
      lnOrion.userData.burn(t > 64 && t < 66 ? .8 : (t > 76 && t < 77 ? .2 : 0), t);
      const docked = t >= 80;
      station.userData.lights.forEach((l, i) => l.material.color.setHex(docked ? 0x30ff60 : (Math.sin(t * 6 + i) > 0 ? 0xff3020 : 0x330805)));
      // lander: berthed under the station, undocks at 84 and drops away
      const ld = Math.max(0, t - 84);
      lnLander.position.copy(station.localToWorld(station.userData.landerPort.clone())).add(V(0, -11.5 - ld * 1.2 - ld * ld * .6, ld * 2));
      lnLander.rotation.x = ld * .05;
      lnLander.userData.burn(0, t);
      if (t < 64.5) look(lnOrion.position.clone().add(V(-70, 25, 60)), lnOrion.position);
      else if (t < 68) look(lnOrion.position.clone().add(V(28, 9, 22)), lnOrion.position);
      else if (t < 74) { const u = smooth(68, 74, t); look(V(lerp(260, 45, u), lerp(90, 18, u), lerp(220, 60, u)).add(station.position), station.position); }
      else if (t < 82) look(port.clone().add(V(18, 9, 26)), port.clone().add(V(6, 0, 0)));
      else look(station.position.clone().add(V(-30, -8, 40)), lnLander.position);
    } else {                                                            // 9-10 · descent and touchdown at the landing zone
      show('surface'); scene.background = new THREE.Color(0);
      sun.position.copy(surf.lz).add(V(-300, 140, 80)); sun.target.position.copy(surf.lz);
      const TD = 98.5, u = smooth(88, TD, t);
      const start = surf.lz.clone().add(V(-420, 260, 180));
      const p = start.clone().lerp(surf.lz, 1 - (1 - u) * (1 - u));   // braking: fast at first, slowing to touchdown
      p.y = lerp(start.y, surf.lz.y, 1 - Math.pow(1 - u, 1.6));
      const settle = t > TD ? Math.sin(Math.min(1, (t - TD) * 3) * Math.PI) * -0.12 : 0;
      lander.position.set(p.x, Math.max(p.y, surf.lz.y) + settle, p.z);
      lander.rotation.z = lerp(.9, 0, smooth(88, 95, t));            // pitched for braking, then upright
      const burn = t < 99.3 ? lerp(1, .55, smooth(94, 98.5, t)) : 0;
      lander.userData.burn(burn, t);
      const alt = lander.position.y - surf.lz.y;
      if (burn > 0 && alt < 30 && dt > 0) for (let k = 0; k < 12; k++) {   // regolith blown out in flat, ballistic sheets (no air)
        const a = Math.random() * Math.PI * 2, sp = 14 + Math.random() * 22;
        dust.emit(surf.lz.clone().add(V(Math.cos(a) * 3, .3, Math.sin(a) * 3)), V(Math.cos(a) * sp, Math.random() * 2, Math.sin(a) * sp), 2.5 + Math.random() * 2, 3, 5);
      }
      dust.update(dt, 1.62, 0.05, surf.lz.y);
      if (t < 95) look(lander.position.clone().add(V(40, -8, 60)), lander.position.clone().add(V(0, 4, 0)));
      else if (t < 100) look(surf.lz.clone().add(V(28, 3, 34)), lander.position.clone().add(V(0, 5, 0)));
      else {   // pull back behind the lander: the base on the horizon, Earth in the black sky
        const toBase = surf.base.clone().sub(surf.lz).setY(0).normalize(), u = smooth(100, 108, t);
        const cam = surf.lz.clone().addScaledVector(toBase, -lerp(22, 48, u)).add(V(0, lerp(6, 16, u), 0)).addScaledVector(V(-toBase.z, 0, toBase.x), lerp(8, 14, u));
        look(cam, surf.lz.clone().lerp(surf.base, .35).add(V(0, 6, 0)));
      }
    }
    // sound cues
    while (cueAt < CUES.length && t >= CUES[cueAt][0]) { if (dt > 0 && !warming) CUES[cueAt][1](); cueAt++; }
    lastT = t;
  }

  // ---- playback
  let t0 = performance.now(), paused = false, done = false, offset = 0;
  const clock = () => offset + (performance.now() - t0) / 1000;
  function finish() {
    if (done) return; done = true; sfx.rumble(0); sfx.pad(0); renderer.setAnimationLoop(null); overlay.innerHTML = '';
    removeEventListener('resize', resize);
    onDone?.();
  }
  const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); };
  addEventListener('resize', resize); resize();
  const loop = () => {
    const t = clock();
    if (t >= DURATION) return finish();
    frame(t, Math.min(t - lastT, 0.05)); renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(loop);
  return {
    // test hook: jump to a time and draw it; hold = stop there. warm = simulate the seconds before it (particles)
    seek(t, hold = false, warm = 0) {
      cueAt = CUES.findIndex((c) => c[0] > t - warm); if (cueAt < 0) cueAt = CUES.length;
      warming = true; for (let w = t - warm; w < t; w += 1 / 30) frame(w, 1 / 30); warming = false;
      offset = t; t0 = performance.now(); lastT = t; frame(t, 0); renderer.render(scene, camera);
      renderer.setAnimationLoop(hold ? null : loop);
    },
    finish, camera, scene,
  };
}

// the game's terrain, landing zone and base, so the intro lands exactly where the game begins
async function buildSurface(parent) {
  const sites = await fetch('/models/sites.json').then((r) => r.json());
  const gltf = await new GLTFLoader().loadAsync('/models/lunar_terrain.glb');
  parent.add(gltf.scene); gltf.scene.updateMatrixWorld(true);
  const ter = []; gltf.scene.traverse((o) => { if (o.isMesh) { ter.push(o); o.receiveShadow = true;
    o.material = new THREE.MeshStandardMaterial({ color: 0x8e8c88, roughness: 1 });
    const tl = new THREE.TextureLoader(), x = tl.load('/textures/Ground022/color.jpg'); x.colorSpace = THREE.SRGBColorSpace; x.wrapS = x.wrapT = THREE.RepeatWrapping;
    const pos = o.geometry.attributes.position, uv = new Float32Array(pos.count * 2), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); uv[i * 2] = v.x / 4; uv[i * 2 + 1] = v.z / 4; }
    o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); o.material.map = x;
    o.material.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n diffuseColor.rgb = vec3(dot(diffuseColor.rgb, vec3(0.3,0.59,0.11))) * 1.25;'); };
  } });
  const ray = new THREE.Raycaster(), groundY = (x, z) => { ray.set(V(x, 1000, z), V(0, -1, 0)); return ray.intersectObjects(ter, false)[0]?.point.y ?? 0; };
  const b2t = (x, y, z = 0) => V(x, z, -y);
  // the outpost's surroundings exactly as in the game: landing pad, solar field, comms, rocks (old habitat removed)
  const site = await new GLTFLoader().loadAsync('/models/lunar_base.glb');
  const oldHab = site.scene.getObjectByName('HAB_Root'); if (oldHab) oldHab.parent.remove(oldHab);
  parent.add(site.scene); site.scene.updateMatrixWorld(true);
  const pad = []; site.scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (/^LZ_|Landing/i.test(o.name) || /^LZ_|Landing/i.test(o.parent?.name)) pad.push(o); } });
  // touch down on the centre of the landing pad, on its surface (not the bare ground under it)
  const lz = b2t(sites.lz.x, sites.lz.y);
  ray.set(V(lz.x, 1000, lz.z), V(0, -1, 0));
  lz.y = ray.intersectObjects(pad, false)[0]?.point.y ?? groundY(lz.x, lz.z);
  // the base, placed exactly as in the game (same maths as main.js)
  const base = sites.base, c = Math.cos(base.yaw), s = Math.sin(base.yaw);
  const rootX = base.x - 10 * c, rootY = base.y - 10 * s;
  const hab = (lx, ly, z = 0) => b2t(rootX + lx * c - ly * s, rootY + lx * s + ly * c, base.floor_z + z);
  const hq = buildBase({ addSign: () => {}, groundY: (lx, ly) => { const p = hab(lx, ly); return groundY(p.x, p.z) - base.floor_z; } });
  hq.group.position.copy(hab(0, 0)); hq.group.rotation.y = base.yaw; parent.add(hq.group);
  return { lz, base: hab(10, 0, 2) };
}
