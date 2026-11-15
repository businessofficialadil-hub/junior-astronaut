// Procedural canvas textures (no image files needed).
import * as THREE from 'three';

function canvas(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

// value noise speckle: many soft dots of varying grey
function speckle(g, n, a, b, alpha = 0.5) {
  const S = g.canvas.width;
  for (let i = 0; i < n; i++) {
    const v = a + (b - a) * rnd(), r = 0.5 + rnd() * 2.5;
    g.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    g.beginPath(); g.arc(rnd() * S, rnd() * S, r, 0, 7); g.fill();
  }
}

export const TEX = {};

export function makeTextures() {
  // lunar regolith: grey dust, pebbles and tiny craters
  TEX.regolith = canvas(512, (g, S) => {
    g.fillStyle = '#8a8884'; g.fillRect(0, 0, S, S);
    speckle(g, 9000, 60, 190, 0.35);
    for (let i = 0; i < 40; i++) {             // small craters: dark rim shadow + light rim
      const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 14;
      g.strokeStyle = 'rgba(40,40,40,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0.6, 3.8); g.stroke();
      g.strokeStyle = 'rgba(230,230,230,.25)'; g.beginPath(); g.arc(x, y, r, 3.8, 6.9); g.stroke();
    }
  });
  // habitat wall panels with seams, rivets and a stencil stripe
  TEX.panel = canvas(256, (g, S) => {
    g.fillStyle = '#e4e4e0'; g.fillRect(0, 0, S, S);
    speckle(g, 1500, 200, 240, 0.25);
    g.strokeStyle = '#9a9c9e'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, S - 3, S - 3);
    g.strokeStyle = '#b8babc'; g.lineWidth = 1; g.strokeRect(10, 10, S - 20, S - 20);
    g.fillStyle = '#8a8c8e';
    for (const x of [6, S - 6]) for (let y = 6; y < S; y += 32) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  });
  // non-slip floor plate
  TEX.floor = canvas(256, (g, S) => {
    g.fillStyle = '#4a4d52'; g.fillRect(0, 0, S, S);
    speckle(g, 1500, 50, 110, 0.4);
    g.fillStyle = '#6a6e74';
    for (let y = 8; y < S; y += 16) for (let x = (y / 16) % 2 ? 0 : 8; x < S; x += 16) {
      g.save(); g.translate(x, y); g.rotate(((x + y) / 16) % 2 ? 0.8 : -0.8); g.fillRect(-5, -1.5, 10, 3); g.restore();
    }
    g.strokeStyle = '#222'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
  });
  // crinkled gold insulation foil
  TEX.foil = canvas(256, (g, S) => {
    g.fillStyle = '#b8860b'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const v = rnd();
      g.fillStyle = v > 0.5 ? `rgba(255,220,120,${0.35 * rnd()})` : `rgba(90,60,0,${0.35 * rnd()})`;
      g.beginPath(); const x = rnd() * S, y = rnd() * S;
      g.moveTo(x, y); g.lineTo(x + rnd() * 40 - 20, y + rnd() * 40 - 20); g.lineTo(x + rnd() * 40 - 20, y + rnd() * 40 - 20); g.fill();
    }
  });
  // suit fabric: woven ortho-fabric with faint quilting seams
  TEX.fabric = canvas(256, (g, S) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + 0.03 * rnd()})`; g.fillRect(0, y, S, 1); }
    for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + 0.02 * rnd()})`; g.fillRect(x, 0, 1, S); }
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
    for (let y = 32; y < S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  });
  // yellow/black hazard stripes
  TEX.hazard = canvas(128, (g, S) => {
    g.fillStyle = '#e8b400'; g.fillRect(0, 0, S, S); g.fillStyle = '#1a1a1a';
    for (let i = -S; i < S * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - S, S); g.lineTo(i - S, S); g.fill(); }
  });
  // solar cells
  TEX.solar = canvas(128, (g, S) => {
    g.fillStyle = '#0b1640'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#8899bb'; g.lineWidth = 1;
    for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  });
  TEX.regolith.colorSpace = TEX.panel.colorSpace = TEX.floor.colorSpace = TEX.foil.colorSpace =
    TEX.fabric.colorSpace = TEX.hazard.colorSpace = TEX.solar.colorSpace = THREE.SRGBColorSpace;
  return TEX;
}

// Box-projected UVs in world metres, for the generated meshes that were exported without UVs.
export function boxUV(mesh, metresPerTile = 1) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal;
  if (!nor) return;
  const m = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m); n.fromBufferAttribute(nor, i).applyMatrix3(nm);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const [u, v] = ay >= ax && ay >= az ? [p.x, p.z] : ax >= az ? [p.z, p.y] : [p.x, p.y];
    uv[i * 2] = u / metresPerTile; uv[i * 2 + 1] = v / metresPerTile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
