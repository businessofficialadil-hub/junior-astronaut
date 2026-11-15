// ASTROPHAGE moon base, built in code with CC0 PBR textures (ambientCG).
// Same layout and size as ASTROPHAGE_Blender_Builder.py (9 rooms, 8 corridors, 26 x 21 m), but with
// thick walls under a regolith shield, pocket doors in the wall plane, trims, lights and furnished rooms.
// Units: metres. Habitat-local (Blender) coords (lx, ly, z) map to this group's three.js coords (lx, z, -ly).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const T = 0.30, H = 2.6, SLAB = 0.2, CEIL = 0.2, TOP = 2.88, DW = 1.2, DH = 2.1, CORO = 0.9, SH = 0.3;
export const ROOMS = {
  'Airlock': [-5.0, -2.4, -1.8, 2.4], 'Main Hub': [0.0, -3.5, 7.0, 3.5], 'Command Room': [0.0, 5.0, 7.0, 10.5],
  'Power Room': [0.0, -10.5, 7.0, -5.0], 'Life Support': [8.5, -3.5, 14.0, 3.5], 'Water Laboratory': [8.5, 5.0, 14.0, 10.5],
  'Food Storage': [8.5, -10.5, 14.0, -5.0], 'Science Lab': [15.5, -3.5, 21.0, 3.5], 'Crew Quarters': [15.5, 5.0, 21.0, 10.5],
};
// [lower/left room, upper/right room, axis of travel, centreline]
const CONNS = [
  ['Airlock', 'Main Hub', 'x', 0.0], ['Main Hub', 'Command Room', 'y', 3.5], ['Power Room', 'Main Hub', 'y', 3.5],
  ['Main Hub', 'Life Support', 'x', 0.0], ['Life Support', 'Water Laboratory', 'y', 11.25], ['Food Storage', 'Life Support', 'y', 11.25],
  ['Life Support', 'Science Lab', 'x', 0.0], ['Science Lab', 'Crew Quarters', 'y', 18.25],
];
const WINDOWS = [['Command Room', 'N', 0, 2.4], ['Water Laboratory', 'N', 0, 2.4], ['Crew Quarters', 'N', -1.5, 1.2],
  ['Crew Quarters', 'N', 1.5, 1.2], ['Science Lab', 'E', 0, 2.4]];
const FOOT = [-6.0, -12.0, 26.0, 11.5];

// ---------------------------------------------------------------- materials
const loader = new THREE.TextureLoader();
const texCache = {};
function tex(name, map, srgb) {
  const k = name + map;
  if (!texCache[k]) {
    const t = loader.load(`/textures/${name}/${map}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache[k] = t;
  }
  return texCache[k];
}
function pbr(name, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0xffffff, metalness: o.metalness ?? 0, roughness: o.roughness ?? 1,
    map: o.noColor ? null : tex(name, 'color', true), normalMap: tex(name, 'normalgl'), roughnessMap: tex(name, 'roughness'),
  });
  if (o.metalMap) m.metalnessMap = tex(name, 'metalness');
  m.normalScale.set(o.ns ?? 1, o.ns ?? 1);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

let MAT;
function materials() {
  if (MAT) return MAT;
  const fabric = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, 0, 1, h); }
  });
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  // bump maps for large panels: one canvas = a 2.4 m square of wall (two 1.2 m wide panels, a seam at 2.4 m)
  // and a 1.2 m square of ceiling (four 0.6 m tiles). Grey = flat, dark = groove.
  const seams = (cols, rows, rivets, colour) => {
    const t = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = colour ? '#ffffff' : '#808080'; g.fillRect(0, 0, w, h);
      g.fillStyle = colour ? '#8c9096' : '#202020';
      for (let i = 0; i < cols; i++) g.fillRect(i * w / cols - 3, 0, 6, h);
      for (let j = 0; j < rows; j++) g.fillRect(0, j * h / rows - 3, w, 6);
      g.fillStyle = colour ? '#f4f4f4' : '#9a9a9a';   // slightly raised panel faces with a soft bevel
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) g.fillRect(i * w / cols + 10, j * h / rows + 10, w / cols - 20, h / rows - 20);
      if (rivets) {
        g.fillStyle = colour ? '#b8bcc2' : '#b0b0b0';
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) for (const [u, v] of [[18, 18], [w / cols - 18, 18], [18, h / rows - 18], [w / cols - 18, h / rows - 18]]) {
          g.beginPath(); g.arc(i * w / cols + u, j * h / rows + v, 5, 0, 7); g.fill();
        }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  };
  const panelled = (cols, rows, rivets, color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.82, metalness: o.metalness ?? 0.05,
      map: seams(cols, rows, rivets, true), bumpMap: seams(cols, rows, rivets, false), bumpScale: 10, normalMap: tex('PaintedMetal004', 'normalgl') });   // no roughness map: its low values made the panels mirror-glossy
    m.normalScale.set(0.35, 0.35); return m;
  };
  MAT = {
    wall: panelled(2, 1, true, 0xe9ecef),
    floor: pbr('DiamondPlate001', { color: 0xc8ccd2, metalMap: true, metalness: 1, roughness: 1 }),
    corrFloor: pbr('MetalPlates017A', { metalMap: true, metalness: 1, roughness: 1 }),
    ceiling: panelled(2, 2, false, 0xd3d7dc, { roughness: 0.8 }),
    trim: pbr('Metal009', { metalMap: true, metalness: 1, roughness: 0.9 }),
    darkMetal: pbr('Metal009', { color: 0x4b5058, metalness: 0.8, roughness: 1 }),
    rubber: pbr('Rubber004', { color: 0x777777 }),
    foil: pbr('Foil002', { metalMap: true, metalness: 1, roughness: 0.8, ns: 2 }),
    hazard: pbr('PaintedMetal016', { metalMap: true, metalness: 1, roughness: 1 }),
    red: pbr('PaintedMetal004', { metalMap: true, metalness: 1, roughness: 1 }),
    shield: pbr('Concrete034', { color: 0x9a9893, ns: 2.5 }),
    pad: pbr('Concrete034', { color: 0x6a6865, ns: 2 }),
    door: null,   // set below (panelled, steel grey)
    locker: null,   // set below (panelled, blue-grey)
    white: pbr('MetalPlates004', { noColor: true, color: 0xf2f2f0, metalness: 0.05, roughness: 0.5, ns: 0.3 }),
    tank: pbr('Metal009', { color: 0xeef0f2, metalness: 0.15, roughness: 0.5 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x2f4f7a, map: fabric, roughness: 0.95 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x24282e, map: fabric, roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fc4e0, transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0, depthWrite: false }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x3a8ad8, transparent: true, opacity: 0.55, roughness: 0.05 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e4, emissiveIntensity: 2.2 }),
    ledGreen: new THREE.MeshBasicMaterial({ color: 0x33ff77 }), ledAmber: new THREE.MeshBasicMaterial({ color: 0xffaa22 }),
    ledRed: new THREE.MeshBasicMaterial({ color: 0xff3322 }),
  };
  MAT.door = panelled(1, 2, true, 0x9aa4ae, { metalness: 0.25, roughness: 0.75 });
  MAT.locker = panelled(2, 2, true, 0x5f7590, { metalness: 0.3, roughness: 0.55 });
  // clean painted floor marking (the grungy hazard texture stays on door jambs)
  const stripes = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e2b007'; g.fillRect(0, 0, w, h); g.fillStyle = '#16181b';
    for (let i = -w; i < w * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - h, h); g.lineTo(i - h, h); g.fill(); }
  });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  MAT.stripe = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7, normalMap: tex('PaintedMetal004', 'normalgl') });
  return MAT;
}

// ---------------------------------------------------------------- geometry helpers
// metric box-projected UVs (base frame), so every texture tiles at a real-world size
function uvBox(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const TILE = { wall: 2.4, floor: 1.0, corrFloor: 1.2, ceiling: 1.2, trim: 0.8, darkMetal: 0.8, rubber: 0.5, foil: 0.6,
  hazard: 0.6, stripe: 0.8, red: 0.5, shield: 2.2, pad: 3.0, door: 2.4, locker: 2.4, white: 1.0, tank: 1.0, fabric: 0.5, seat: 0.4 };

class Builder {
  constructor() { this.parts = {}; }
  push(key, g) { g = g.index ? g.toNonIndexed() : g; if (TILE[key]) uvBox(g, TILE[key]); (this.parts[key] ||= []).push(g); }
  // axis-aligned box from habitat-local ranges
  box(key, x0, x1, y0, y1, z0, z1) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    const g = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0);
    g.translate((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2);
    this.push(key, g);
  }
  // any geometry centred on its origin, placed at (lx, ly, z centre), turned by rotY about the vertical
  put(key, g, lx, ly, z, rotY = 0, rotX = 0, rotZ = 0) {
    g = g.clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')));
    g.translate(lx, z, -ly);
    this.push(key, g);
  }
  rbox(key, w, d, h, lx, ly, z0, r = 0.03, rotY = 0) {      // rounded box standing on z0
    this.put(key, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, d / 2, h / 2)), lx, ly, z0 + h / 2, rotY);
  }
  cyl(key, r, h, lx, ly, z0, seg = 24, r2 = r) { this.put(key, new THREE.CylinderGeometry(r2, r, h, seg), lx, ly, z0 + h / 2); }
  // horizontal pipe from (ax, ay) to (bx, by) at height z
  pipe(key, r, ax, ay, bx, by, z) {
    const len = Math.hypot(bx - ax, by - ay);
    this.put(key, new THREE.CylinderGeometry(r, r, len, 12), (ax + bx) / 2, (ay + by) / 2, z,
      Math.atan2(by - ay, bx - ax), 0, Math.PI / 2);
  }
  meshes(mats) {
    return Object.entries(this.parts).map(([k, gs]) => {
      const m = new THREE.Mesh(mergeGeometries(gs), mats[k]);
      m.castShadow = m.receiveShadow = !['glass', 'water', 'lightPanel'].includes(k);
      m.name = 'BASE_' + k;
      return m;
    });
  }
}

// box for a wall side, measured from the room's OUTER face inward (c0..c1); a0..a1 along the wall
function ob(side, rect, a0, a1, z0, z1, c0, c1) {
  const [x0, y0, x1, y1] = rect;
  if (side === 'W') return [x0 + c0, x0 + c1, a0, a1, z0, z1];
  if (side === 'E') return [x1 - c1, x1 - c0, a0, a1, z0, z1];
  if (side === 'S') return [a0, a1, y0 + c0, y0 + c1, z0, z1];
  return [a0, a1, y1 - c1, y1 - c0, z0, z1];
}
// wall segments around openings, as the builder's pieces(): [a0, a1, z0, z1]
function pieces(span, ops, top, bottom = 0) {
  const out = []; let cur = span[0];
  for (const o of [...ops].sort((p, q) => p.c - q.c)) {
    const s = o.c - o.w / 2, e = o.c + o.w / 2;
    if (s > cur + 1e-6) out.push([cur, s, bottom, top]);
    if (o.z0 > bottom + 1e-6) out.push([s, e, bottom, o.z0]);
    if (o.z1 < top - 1e-6) out.push([s, e, o.z1, top]);
    cur = e;
  }
  if (span[1] > cur + 1e-6) out.push([cur, span[1], bottom, top]);
  return out;
}

// ---------------------------------------------------------------- screens
function screenMat(kind) {
  const t = canvasTex(512, 288, (g, w, h) => {
    g.fillStyle = '#04121c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#123247'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#5fd4ff'; g.font = 'bold 22px monospace'; g.fillText({ map: 'LUNAR SOUTH POLE · SECTOR 7', chart: 'O2 / CO2 / PRESSURE',
      status: 'HABITAT STATUS', power: 'POWER BUS', water: 'WATER RECOVERY', science: 'SAMPLE ANALYSIS' }[kind] || 'SYSTEM', 16, 30);
    if (kind === 'map') {
      g.strokeStyle = '#2fa7d8'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(40 + Math.random() * 430, 60 + Math.random() * 200, 6 + Math.random() * 30, 0, 7); g.stroke(); }
      g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(300, 170, 7, 0, 7); g.fill(); g.fillText('BASE', 312, 176);
    } else if (kind === 'chart' || kind === 'science' || kind === 'water') {
      ['#54ff9f', '#5fd4ff', '#ffb347'].forEach((c, k) => {
        g.strokeStyle = c; g.lineWidth = 2; g.beginPath();
        for (let x = 0; x < w - 30; x += 8) g.lineTo(16 + x, 150 + k * 40 + Math.sin(x * 0.03 + k * 2) * 20 + Math.random() * 6);
        g.stroke();
      });
    } else {
      for (let i = 0; i < 6; i++) {
        const v = 0.3 + Math.random() * 0.65, warn = kind === 'power' && i === 2;
        g.fillStyle = '#0f2a3a'; g.fillRect(20, 60 + i * 36, 460, 22);
        g.fillStyle = warn ? '#ff4a3a' : '#2fd88a'; g.fillRect(20, 60 + i * 36, 460 * (warn ? 0.12 : v), 22);
      }
    }
  });
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
}

// ---------------------------------------------------------------- build
// ctx: { groundY(lx, ly) -> terrain height in this frame, addSign(parent, room, centre, n, a, dir, gap) }
export function buildBase(ctx) {
  const M = materials(), B = new Builder();
  const group = new THREE.Group(); group.name = 'ASTROPHAGE_BASE_V2';
  const extra = [];                 // non-merged meshes (screens, doors, lamps)
  const lights = [];

  // openings per (room, side)
  const ops = {};
  const op = (room, side, o) => (ops[room + side] ||= []).push(o);
  for (const [a, b, ax, al] of CONNS) {
    const [sa, sb] = ax === 'x' ? ['E', 'W'] : ['N', 'S'];
    op(a, sa, { c: al, w: DW, z0: 0, z1: DH, kind: 'door', conn: [a, b] });
    op(b, sb, { c: al, w: DW, z0: 0, z1: DH, kind: 'door', conn: [b, a] });
  }
  op('Airlock', 'W', { c: 0, w: DW, z0: 0, z1: DH, kind: 'hatch' });
  for (const [room, side, u, w] of WINDOWS) {
    const r = ROOMS[room], c = (side === 'N' || side === 'S' ? (r[0] + r[2]) / 2 : (r[1] + r[3]) / 2) + u;
    op(room, side, { c, w, z0: 0.9, z1: 1.8, kind: 'window' });
  }

  // ---- shells: floor, ceiling, roof, walls, regolith shield, interior trims
  function shell(rect, sides, isCorr, opsFor) {
    const [x0, y0, x1, y1] = rect;
    B.box(isCorr ? 'corrFloor' : 'floor', x0, x1, y0, y1, -SLAB, 0);
    B.box('ceiling', x0, x1, y0, y1, H, H + CEIL);
    B.box('white', x0, x1, y0, y1, H + CEIL, TOP);
    if (!isCorr) B.box('shield', x0 - SH, x1 + SH, y0 - SH, y1 + SH, TOP, TOP + 0.35);
    else if (sides[0] === 'S') B.box('shield', x0 + SH, x1 - SH, y0 - SH, y1 + SH, TOP, TOP + 0.33);   // 2 cm lower: no coplanar tops
    else B.box('shield', x0 - SH, x1 + SH, y0 + SH, y1 - SH, TOP, TOP + 0.33);
    for (const side of sides) {
      const o = opsFor(side), ns = side === 'W' || side === 'E';
      const span = ns ? [y0, y1] : [x0 + T, x1 - T];
      for (const [a0, a1, z0, z1] of pieces(isCorr ? [ns ? y0 : x0, ns ? y1 : x1] : span, o, H)) {
        B.box('wall', ...ob(side, rect, a0, a1, z0, z1, 0, T));
        if (z0 === 0) B.box('rubber', ...ob(side, rect, a0, a1, 0, 0.14, T, T + 0.015));      // kick plate
        if (z0 === 0 && z1 === H && !isCorr) B.box('trim', ...ob(side, rect, a0, a1, 2.34, 2.42, T, T + 0.1)); // cable tray
        if (z0 === 0 && z1 === H && isCorr) {                                                    // handrail on brackets
          const [bx0, bx1, by0, by1] = ob(side, rect, a0, a1, 0.98, 1.02, T + 0.06, T + 0.1);
          B.box('trim', bx0, bx1, by0, by1, 0.98, 1.02);
        }
      }
      // shield: outside the outer face. Door openings that lead into corridors are left wide (the corridor sits there).
      const so = o.map((x) => (x.kind === 'door' ? { ...x, w: 2 * CORO + 0.02, z1: TOP } : x));
      if (!isCorr) {
        const sspan = ns ? [y0 - SH, y1 + SH] : [x0, x1];
        for (const [a0, a1, z0, z1] of pieces(sspan, so, TOP, -0.22)) B.box('shield', ...ob(side, rect, a0, a1, z0, z1, -SH, 0));
      } else {
        B.box('shield', ...ob(side, rect, ns ? y0 : x0, ns ? y1 : x1, -0.22, TOP, -SH, 0));
      }
    }
  }
  for (const [room, rect] of Object.entries(ROOMS)) shell(rect, ['W', 'E', 'S', 'N'], false, (s) => ops[room + s] || []);
  for (const [a, b, ax, al] of CONNS) {
    const ra = ROOMS[a], rb = ROOMS[b];
    const rect = ax === 'x' ? [ra[2], al - CORO, rb[0], al + CORO] : [al - CORO, ra[3], al + CORO, rb[1]];
    shell(rect, ax === 'x' ? ['S', 'N'] : ['W', 'E'], true, () => []);
    // ribs (structural frames) and a light strip
    const [x0, y0, x1, y1] = rect, L = ax === 'x' ? x1 - x0 : y1 - y0;
    for (const f of [0.1, L / 2 - 0.04, L - 0.18]) {
      if (ax === 'x') {
        B.box('trim', x0 + f, x0 + f + 0.08, y0 + T, y0 + T + 0.04, 0, H); B.box('trim', x0 + f, x0 + f + 0.08, y1 - T - 0.04, y1 - T, 0, H);
        B.box('trim', x0 + f, x0 + f + 0.08, y0 + T, y1 - T, H - 0.06, H);
      } else {
        B.box('trim', x0 + T, x0 + T + 0.04, y0 + f, y0 + f + 0.08, 0, H); B.box('trim', x1 - T - 0.04, x1 - T, y0 + f, y0 + f + 0.08, 0, H);
        B.box('trim', x0 + T, x1 - T, y0 + f, y0 + f + 0.08, H - 0.06, H);
      }
    }
    if (ax === 'x') B.box('lightPanel', x0 + 0.25, x1 - 0.25, al - 0.08, al + 0.08, H - 0.012, H);
    else B.box('lightPanel', al - 0.08, al + 0.08, y0 + 0.25, y1 - 0.25, H - 0.012, H);
  }

  // ---- doors, frames, lamps, signs, windows
  const doors = [];
  const nAxis = (side) => (side === 'W' || side === 'E' ? 'x' : 'z');
  for (const [room, rect] of Object.entries(ROOMS)) {
    for (const side of ['W', 'E', 'S', 'N']) {
      for (const o of ops[room + side] || []) {
        const inward = { W: [1, 0], E: [-1, 0], S: [0, 1], N: [0, -1] }[side];
        const [cx0, cx1, cy0, cy1] = ob(side, rect, o.c, o.c, 0, 0, T / 2, T / 2);    // wall-centre point
        const wx = cx0, wy = cy0;
        const n = nAxis(side), a = n === 'x' ? 'z' : 'x';
        const centre = new THREE.Vector3(wx, 0, -wy);
        const inDir = n === 'x' ? inward[0] : -inward[1];          // +/-1 along the three.js normal axis, into the room
        if (o.kind === 'window') {
          const g = new THREE.BoxGeometry(n === 'x' ? 0.02 : o.w, o.z1 - o.z0, n === 'x' ? o.w : 0.02);
          B.put('glass', g, wx, wy, (o.z0 + o.z1) / 2);
          // frame on the inner face
          for (const [a0, a1, z0, z1] of [[o.c - o.w / 2 - 0.08, o.c - o.w / 2, o.z0 - 0.08, o.z1 + 0.08], [o.c + o.w / 2, o.c + o.w / 2 + 0.08, o.z0 - 0.08, o.z1 + 0.08],
            [o.c - o.w / 2, o.c + o.w / 2, o.z0 - 0.08, o.z0], [o.c - o.w / 2, o.c + o.w / 2, o.z1, o.z1 + 0.08]]) {
            B.box('trim', ...ob(side, rect, a0, a1, z0, z1, T, T + 0.04));
          }
          continue;
        }
        const hatch = o.kind === 'hatch';
        // frame on the room side: jambs with hazard faces, head beam
        for (const s of [-1, 1]) {
          const j0 = o.c + s * (DW / 2), j1 = o.c + s * (DW / 2 + 0.12);
          B.box('trim', ...ob(side, rect, Math.min(j0, j1), Math.max(j0, j1), 0, DH + 0.12, T, T + 0.06));
          B.box('hazard', ...ob(side, rect, Math.min(j0, j1) + 0.02, Math.max(j0, j1) - 0.02, 0.05, DH - 0.05, T + 0.06, T + 0.065));
        }
        B.box('trim', ...ob(side, rect, o.c - DW / 2 - 0.12, o.c + DW / 2 + 0.12, DH, DH + 0.12, T, T + 0.06));
        if (hatch) {      // exterior frame and threshold on the shield
          for (const s of [-1, 1]) {
            const j0 = o.c + s * (DW / 2), j1 = o.c + s * (DW / 2 + 0.16);
            B.box('trim', ...ob(side, rect, Math.min(j0, j1), Math.max(j0, j1), -0.22, DH + 0.16, -SH - 0.06, -SH));
          }
          B.box('trim', ...ob(side, rect, o.c - DW / 2 - 0.16, o.c + DW / 2 + 0.16, DH, DH + 0.16, -SH - 0.06, -SH));
          B.box('hazard', ...ob(side, rect, o.c - DW / 2, o.c + DW / 2, -0.22, 0, -SH, 0));
        }
        // the door: a panel group sitting in the wall centre plane
        const door = new THREE.Group(); door.position.copy(centre); door.position.y = (DH + 0.04) / 2;
        const pw = DW + 0.1, th = 0.06;
        const panel = new THREE.Mesh(uvBox(new THREE.BoxGeometry(n === 'x' ? th : pw, DH + 0.04, n === 'x' ? pw : th).toNonIndexed(), 1.3), M.door);
        const band = new THREE.Mesh(uvBox(new THREE.BoxGeometry(n === 'x' ? th + 0.01 : pw, 0.14, n === 'x' ? pw : th + 0.01).toNonIndexed(), 0.6), M.hazard);
        band.position.y = -0.1;
        const port = new THREE.Mesh(new THREE.BoxGeometry(n === 'x' ? th + 0.012 : 0.22, 0.5, n === 'x' ? 0.22 : th + 0.012), M.glass);
        port.position.y = 0.45;
        for (const m of [panel, band]) { m.castShadow = m.receiveShadow = true; door.add(m); }
        door.add(port);
        group.add(door);
        // status lamps above the door on both faces
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
        for (const dir of [1, -1]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(n === 'x' ? 0.03 : 0.5, 0.05, n === 'x' ? 0.5 : 0.03), lampMat);
          // on the frame head (room side / hatch exterior) or on the bare wall (corridor side)
          const framed = dir === inDir || hatch;
          l.position.copy(centre); l.position.y = DH + 0.06;
          l.position[n] += dir * (T / 2 + (hatch && dir !== inDir ? SH : 0) + (framed ? 0.075 : 0.02));
          group.add(l);
        }
        const here = hatch ? 'Airlock' : o.conn[0], there = hatch ? 'Lunar surface' : o.conn[1];
        ctx.addSign(group, there, centre, n, a, inDir, T / 2 + 0.07);
        // one name per doorway: on the first door you reach. Corridor faces stay blank (the sign is already
        // visible on the near door), only the hatch gets an outside sign.
        if (hatch) ctx.addSign(group, here, centre, n, a, -inDir, T / 2 + SH + 0.07);
        doors.push({ mesh: door, n, closed: door.position.clone(), slide: new THREE.Vector3(), localCentre: centre.clone().setY(1.05),
          lamp: lampMat, t: 0, solids: [panel, band] });
      }
    }
  }

  // ---- foundation pad and the ramp up to the airlock
  B.box('pad', FOOT[0], FOOT[2], FOOT[1], FOOT[3], -1.6, -0.22);
  {
    const zb = THREE.MathUtils.clamp(ctx.groundY(-9.8, 0) + 0.02, -1.55, -0.25);
    const g = new THREE.BoxGeometry(3.8, 1.4, 2.6).toNonIndexed();
    g.translate(-7.9, -0.92, 0);                                      // x -9.8..-6, y(z) -1.62..-0.22
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getX(i) < -9.7 && p.getY(i) > -0.3) p.setY(i, zb);
    g.computeVertexNormals();
    B.push('pad', g);
    B.box('stripe', -6.2, -6.0, -1.3, 1.3, -0.22, -0.215);
  }

  // ---- lighting: ceiling light panels + one light per room
  for (const [room, [x0, y0, x1, y1]] of Object.entries(ROOMS)) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, wide = x1 - x0 > y1 - y0;
    for (const s of [-1, 1]) {
      const px = wide ? cx + s * (x1 - x0) / 4 : cx, py = wide ? cy : cy + s * (y1 - y0) / 4;
      B.box('trim', px - 0.68, px + 0.68, py - 0.2, py + 0.2, H - 0.03, H);
      B.box('lightPanel', px - 0.6, px + 0.6, py - 0.14, py + 0.14, H - 0.035, H - 0.03);
    }
    // soft, even fill (low decay) from just under the ceiling, so walls don't get hot spots
    const l = new THREE.PointLight(room === 'Power Room' ? 0xffe2c8 : 0xf4f6ff, 1.6, 12, 0.6);
    l.position.set(cx, H - 0.08, -cy); group.add(l); lights.push(l);
  }

  // ---- furniture and equipment
  const screen = (kind, w, h, lx, ly, z, rotY) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat(kind));
    s.position.set(lx, z, -ly); s.rotation.y = rotY; extra.push(s);
    B.put('darkMetal', new RoundedBoxGeometry(w + 0.08, h + 0.08, 0.05, 2, 0.015), lx - Math.sin(rotY) * 0.03, ly + Math.cos(rotY) * 0.03, z, rotY);
  };
  // rotY that makes a plane face into the room from each wall
  const FACE = { W: Math.PI / 2, E: -Math.PI / 2, S: Math.PI, N: 0 };   // into the room from that wall
  const faceIn = (side) => FACE[side];   // plane normal +Z turned to point into the room (three z = -ly)

  // Airlock: suit lockers, bench, warning beacon, hazard floor marking
  for (const x of [-4.35, -3.55, -2.75]) B.rbox('locker', 0.72, 0.5, 2.0, x, 1.85, 0, 0.02);
  for (const x of [-4.35, -3.55, -2.75]) B.box('trim', x - 0.02, x + 0.02, 1.58, 1.6, 0.9, 1.3);
  B.rbox('seat', 1.6, 0.4, 0.06, -3.5, -1.9, 0.42, 0.02); B.box('trim', -4.25, -4.2, -2.05, -1.75, 0, 0.42); B.box('trim', -2.8, -2.75, -2.05, -1.75, 0, 0.42);
  B.box('stripe', -4.7, -4.1, -0.9, 0.9, 0.0, 0.004);
  screen('status', 0.7, 0.4, -3.5, -2.08, 1.5, faceIn('S'));
  B.cyl('red', 0.08, 0.14, -4.7 + 0.08, 1.0, 2.25);

  // Main Hub: lockers, round table + stools, wall screen, foil-wrapped cargo, extinguisher
  for (const y of [1.55, 2.25, 2.95]) B.rbox('locker', 0.55, 0.66, 2.0, 0.58, y, 0, 0.02);
  B.cyl('white', 0.6, 0.04, 5.2, -1.9, 0.72, 32); B.cyl('trim', 0.06, 0.72, 5.2, -1.9, 0);
  B.cyl('trim', 0.3, 0.02, 5.2, -1.9, 0, 24);
  for (const k of [0, 2.1, 4.2]) B.cyl('seat', 0.18, 0.45, 5.2 + Math.cos(k) * 0.95, -1.9 + Math.sin(k) * 0.95, 0, 20);
  screen('status', 1.4, 0.8, 0.31, -2.0, 1.55, faceIn('W'));
  B.rbox('locker', 0.8, 0.6, 0.6, 6.15, 2.65, 0, 0.04); B.rbox('white', 0.6, 0.5, 0.45, 6.25, 2.6, 0.6, 0.04);
  B.cyl('red', 0.08, 0.5, 6.6, -1.3, 0.6);

  // Command Room: console under the window, screens, chairs, wall map
  B.rbox('darkMetal', 4.6, 0.75, 0.8, 3.5, 9.75, 0, 0.03);
  B.rbox('white', 4.7, 0.8, 0.04, 3.5, 9.72, 0.8, 0.02);
  [['map', 2.1], ['chart', 3.5], ['status', 4.9]].forEach(([k, x]) => screen(k, 0.9, 0.5, x, 9.75, 1.15, faceIn('N')));
  for (const x of [2.4, 4.6]) {
    B.cyl('seat', 0.24, 0.08, x, 8.7, 0.46, 20); B.cyl('trim', 0.03, 0.46, x, 8.7, 0);
    B.rbox('seat', 0.46, 0.08, 0.5, x, 8.45, 0.5, 0.03);
  }
  screen('map', 2.0, 1.1, 0.31, 7.6, 1.5, faceIn('W'));

  // Power Room: battery racks with LEDs, breaker cabinets, conduit on the east wall
  for (const y of [-9.4, -8.1, -6.8]) {
    B.rbox('darkMetal', 0.6, 1.2, 1.9, 0.62, y, 0, 0.02);
    for (let r = 0; r < 6; r++) B.box(r % 3 === 1 ? 'ledAmber' : 'ledGreen', 0.925, 0.93, y - 0.4, y - 0.35, 0.3 + r * 0.26, 0.33 + r * 0.26);
  }
  for (const x of [1.6, 2.5, 3.4]) B.rbox('locker', 0.85, 0.5, 2.0, x, -9.95, 0, 0.02);
  B.box('stripe', 1.1, 3.9, -9.7, -9.5, 0, 0.004);
  B.pipe('hazard', 0.06, 6.62, -10.2, 6.62, -5.3, 2.05); B.pipe('trim', 0.05, 6.62, -10.2, 6.62, -5.3, 2.22);
  screen('power', 0.9, 0.5, 6.69, -7.7, 1.5, faceIn('E'));

  // Life Support: four tanks with banding, pipes to the ceiling, header pipes
  for (const [x, y] of [[9.45, 2.55], [13.05, 2.55], [9.45, -2.55], [13.05, -2.55]]) {
    B.cyl('tank', 0.45, 1.8, x, y, 0, 32);
    B.put('tank', new THREE.SphereGeometry(0.45, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), x, y, 1.8);
    B.cyl('locker', 0.46, 0.1, x, y, 1.2, 32); B.cyl('locker', 0.46, 0.1, x, y, 0.4, 32);
    B.cyl('trim', 0.05, 0.4, x, y, 2.2, 12);
  }
  B.pipe('trim', 0.05, 9.45, 2.55, 13.05, 2.55, 2.4); B.pipe('trim', 0.05, 9.45, -2.55, 13.05, -2.55, 2.4);
  screen('chart', 0.9, 0.5, 11.25 - 2.0, 3.19, 1.5, faceIn('N'));

  // Water Laboratory: transparent water tanks, bench with sink, screen
  for (const y of [6.6, 8.6]) {
    B.cyl('water', 0.42, 1.6, 13.15, y, 0.1, 32);
    B.cyl('trim', 0.45, 0.1, 13.15, y, 0, 32); B.cyl('trim', 0.45, 0.1, 13.15, y, 1.7, 32);
  }
  B.rbox('white', 0.65, 3.4, 0.9, 9.13, 7.8, 0, 0.03);
  B.box('darkMetal', 8.95, 9.3, 7.2, 7.8, 0.86, 0.902); B.cyl('trim', 0.015, 0.3, 9.0, 7.5, 0.9);
  screen('water', 1.2, 0.6, 8.81, 7.8, 1.55, faceIn('W'));

  // Food Storage: shelving with containers, galley counter and fridge
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (const x of [9.1, 13.4]) {
    for (const z of [0.05, 0.6, 1.15, 1.7]) {
      B.box('trim', x - 0.3, x + 0.3, -9.9, -6.0, z, z + 0.03);
      for (let y = -9.8; y < -6.2; y += 0.45) {
        if (rnd() < 0.25) continue;
        const h = 0.2 + rnd() * 0.25;
        B.rbox(rnd() < 0.4 ? 'locker' : 'white', 0.45, 0.38, h, x, y + 0.2, z + 0.03, 0.03);
      }
    }
    for (const y of [-9.9, -6.0]) B.box('trim', x - 0.3, x + 0.3, y - 0.03, y, 0, 2.0);
  }
  B.rbox('white', 1.8, 0.6, 0.9, 10.8, -9.9, 0, 0.03); B.rbox('locker', 0.9, 0.6, 1.9, 12.35, -9.9, 0, 0.03);

  // Science Lab: benches with instruments, under-window bench, sample jars
  B.rbox('white', 4.4, 0.65, 0.9, 18.2, -2.88, 0, 0.03);
  B.rbox('white', 0.6, 2.8, 0.85, 20.4, 0, 0, 0.03);
  for (const x of [16.6, 19.9]) B.rbox('white', 1.4, 0.65, 0.9, x, 2.88, 0, 0.03);
  B.cyl('darkMetal', 0.12, 0.08, 17.0, -2.85, 0.9); B.cyl('trim', 0.03, 0.35, 17.0, -2.85, 0.98); B.rbox('darkMetal', 0.12, 0.2, 0.08, 17.0, -2.9, 1.3, 0.02);
  for (let i = 0; i < 6; i++) B.cyl('glass', 0.04, 0.14, 18.2 + i * 0.13, -2.75, 0.9, 12);
  B.rbox('glass', 0.9, 0.5, 0.6, 19.6, -2.85, 0.9, 0.02);
  screen('science', 0.9, 0.5, 18.2, -3.19, 1.55, faceIn('S'));

  // Crew Quarters: two bunk beds, lockers, small desk
  for (const x of [16.3, 20.2]) {
    for (const z of [0.4, 1.45]) { B.rbox('fabric', 0.9, 2.0, 0.16, x, 7.6, z, 0.06); B.box('trim', x - 0.47, x + 0.47, 6.58, 8.62, z - 0.04, z); }
    for (const y of [6.6, 8.6]) for (const s of [-1, 1]) B.box('trim', x + s * 0.45 - 0.03, x + s * 0.45 + 0.03, y - 0.03, y + 0.03, 0, 1.9);
  }
  for (const x of [18.0, 18.6]) B.rbox('locker', 0.58, 0.5, 2.0, x, 9.9, 0, 0.02);   // between the two windows

  // exterior: cargo containers, light masts, comms mast on the hub roof
  for (const [x, y] of [[23.2, -8.5], [23.2, 8.2], [-4.2, -9.5]]) B.rbox('locker', 2.4, 1.3, 1.3, x, y, -0.22, 0.05);
  for (const [x, y] of [[-5.6, -11.4], [-5.6, 11.0], [25.5, -11.4], [25.5, 11.0]]) {
    B.cyl('trim', 0.06, 3.5, x, y, -0.22, 10); B.rbox('darkMetal', 0.4, 0.25, 0.2, x, y, 3.25, 0.03);
    B.box('lightPanel', x - 0.16, x + 0.16, y - 0.11, y + 0.11, 3.23, 3.25);
  }
  B.cyl('trim', 0.05, 3.0, 3.5, 0, TOP + 0.35, 10); B.put('white', new THREE.SphereGeometry(0.6, 24, 8, 0, Math.PI * 2, 0, 0.9), 3.5, 0, TOP + 3.6, 0, Math.PI, 0);

  for (const m of B.meshes(M)) group.add(m);
  for (const m of extra) group.add(m);
  return { group, doors, lights };
}
