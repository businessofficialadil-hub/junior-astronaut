// Drivable rover built from NASA's Perseverance model (NASA 3D Resources #25042).
// The model is static; its six wheels come as one mesh, so they are split here by position
// into six spinning wheels. Driving is arcade-style: skid steering (turns on the spot like the
// real rover), suspension that follows the ground at the four corners, dust and headlights.
import * as THREE from 'three';

const WHEEL_R = 0.265;
const MAX_FWD = 4.0, MAX_BACK = 2.0, BOOST = 1.6;     // m/s
const CORNERS = [[-1.2, 1.1], [1.2, 1.1], [-1.2, -1.2], [1.2, -1.2]];   // x, z (model space: front = +Z)

// split one mesh's triangles into the six wheel groups (x side x front/middle/back)
function splitWheels(mesh, rootInv) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld));
  const p = g.attributes.position, bins = {};
  for (let t = 0; t < p.count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3, cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const key = (cx < 0 ? 'L' : 'R') + (cz > 0.55 ? 'F' : cz < -0.6 ? 'B' : 'M');
    (bins[key] ||= []).push(t);
  }
  const out = {};
  for (const [key, tris] of Object.entries(bins)) {
    const ng = new THREE.BufferGeometry();
    for (const name of Object.keys(g.attributes)) {
      const a = g.attributes[name], arr = new a.array.constructor(tris.length * 3 * a.itemSize);
      tris.forEach((t, i) => { for (let k = 0; k < 3 * a.itemSize; k++) arr[i * 3 * a.itemSize + k] = a.array[t * a.itemSize + k]; });
      ng.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
    out[key] = ng;
  }
  return out;
}

export function makeRover(gltf) {
  const root = new THREE.Group(); root.name = 'PLAYER_ROVER';
  const body = new THREE.Group(); root.add(body);          // tilts with the ground
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const rootInv = model.matrixWorld.clone().invert();

  // pull the wheel meshes out of the model and rebuild them as six spinning groups
  const wheelsNode = model.getObjectByName('Wheels_objs');
  const parts = {};                                        // key -> [{geometry, material}]
  wheelsNode.updateMatrixWorld(true);
  wheelsNode.traverse((o) => {
    if (!o.isMesh) return;
    for (const [k, geo] of Object.entries(splitWheels(o, rootInv))) (parts[k] ||= []).push({ geo, mat: o.material });
  });
  wheelsNode.parent.remove(wheelsNode);
  body.add(model);
  const wheels = [];
  for (const [key, list] of Object.entries(parts)) {
    const box = new THREE.Box3();
    list.forEach(({ geo }) => { geo.computeBoundingBox(); box.union(geo.boundingBox); });
    // hub: wheel centre at the bottom of the bin (the swing-arm sits above it)
    const c = new THREE.Vector3((box.min.x + box.max.x) / 2, WHEEL_R, 0);
    const lowZ = []; list.forEach(({ geo }) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.08) lowZ.push(p.getZ(i)); });
    c.z = lowZ.length ? lowZ.reduce((a, b) => a + b, 0) / lowZ.length : (box.min.z + box.max.z) / 2;
    const hub = new THREE.Group(); hub.position.copy(c); body.add(hub);
    for (const { geo, mat } of list) {
      geo.translate(-c.x, -c.y, -c.z);
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; hub.add(m);
    }
    wheels.push(hub);
  }
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // headlights on the front of the deck
  const lights = [];
  for (const s of [-1, 1]) {
    const l = new THREE.SpotLight(0xfff2dd, 12, 28, 0.45, 0.5, 1.2);
    l.position.set(0.55 * s, 1.15, 1.3); l.target.position.set(0.55 * s, 0.2, 7);
    body.add(l, l.target); lights.push(l);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    lens.position.set(0.55 * s, 1.15, 1.32); body.add(lens);
  }

  // invisible collision box so the astronaut can't walk through it (rover's own rays skip it)
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 3.4), new THREE.MeshBasicMaterial());
  hull.position.set(0, 0.95, -0.1); hull.visible = false; root.add(hull);

  // dust: a small pool of puffs thrown up behind the rear wheels
  const N = 160, dustGeo = new THREE.BufferGeometry(), dpos = new Float32Array(N * 3), dlife = new Float32Array(N), dvel = [];
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  for (let i = 0; i < N; i++) { dlife[i] = 0; dvel.push(new THREE.Vector3()); dpos[i * 3 + 1] = -999; }
  const puff = document.createElement('canvas'); puff.width = puff.height = 64;
  const pg = puff.getContext('2d'), grad = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  pg.fillStyle = grad; pg.fillRect(0, 0, 64, 64);
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xa9a7a2, size: 0.35, map: new THREE.CanvasTexture(puff),
    transparent: true, opacity: 0.5, depthWrite: false }));   // soft round puffs
  dust.frustumCulled = false;
  let nextDust = 0;

  const state = { speed: 0, yaw: 0, pitch: 0, roll: 0, spin: 0 };
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();

  return {
    root, hull, dust, state, wheels,
    place(pos, yaw) { root.position.copy(pos); state.yaw = yaw; root.rotation.y = yaw; },
    forward() { return fwd.set(Math.sin(state.yaw), 0, Math.cos(state.yaw)); },
    // input: { throttle -1..1, steer -1..1, boost }  ground(x, z) -> y | null   blocked(from, dir, dist) -> bool
    update(dt, input, ground, blocked) {
      // speed and steering
      const max = input.throttle >= 0 ? MAX_FWD * (input.boost ? BOOST : 1) : MAX_BACK;
      const target = input.throttle * max;
      const acc = Math.sign(target - state.speed) === Math.sign(state.speed) || !state.speed ? 1.6 : 3.5;   // brake harder than accelerate
      state.speed += THREE.MathUtils.clamp(target - state.speed, -acc * dt, acc * dt);
      const turnRate = 0.9 - 0.12 * Math.abs(state.speed);            // skid steer: also turns in place
      state.yaw += input.steer * turnRate * dt * (state.speed < -0.05 ? -1 : 1);

      // bump into walls, rocks, the base
      this.forward();
      const step = state.speed * dt, dir = tmp.copy(fwd).multiplyScalar(Math.sign(step) || 1);
      const nose = root.position.clone().addScaledVector(dir, 0.2); nose.y += 0.7;
      if (step && blocked(nose, dir, Math.abs(step) + (step > 0 ? 2.0 : 1.9))) state.speed = 0;
      else root.position.addScaledVector(fwd, step);

      // suspension: sample the ground under the four corners, then pitch, roll and height follow it
      const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
      const h = CORNERS.map(([x, z]) => ground(root.position.x + x * c + z * s, root.position.z - x * s + z * c) ?? root.position.y);
      const front = (h[0] + h[1]) / 2, back = (h[2] + h[3]) / 2, left = (h[0] + h[2]) / 2, right = (h[1] + h[3]) / 2;
      const k = Math.min(1, dt * 8);
      state.pitch += (Math.atan2(back - front, 2.3) - state.pitch) * k;
      state.roll += (Math.atan2(right - left, 2.4) - state.roll) * k;
      root.position.y += ((h[0] + h[1] + h[2] + h[3]) / 4 - root.position.y) * k;
      root.rotation.set(0, state.yaw, 0);
      body.rotation.set(state.pitch, 0, state.roll);

      // wheels roll with the distance travelled
      state.spin += step / WHEEL_R;
      for (const w of wheels) w.rotation.x = state.spin;

      // dust from the rear wheels, more when faster
      const p = dustGeo.attributes.position;
      if (Math.abs(state.speed) > 0.4) {
        for (let n = 0; n < 2; n++) {
          const i = nextDust; nextDust = (nextDust + 1) % N;
          const side = n ? 1.2 : -1.2;
          tmp.set(side * c - 1.3 * s, 0.1, -side * s - 1.3 * c).add(root.position);
          p.setXYZ(i, tmp.x, tmp.y, tmp.z); dlife[i] = 1.2;
          dvel[i].set((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6).addScaledVector(fwd, -0.4 * Math.sign(state.speed));
        }
      }
      for (let i = 0; i < N; i++) {
        if (dlife[i] <= 0) continue;
        dlife[i] -= dt; dvel[i].y -= 1.62 * dt;                       // lunar gravity, no air: ballistic arcs
        p.setXYZ(i, p.getX(i) + dvel[i].x * dt, Math.max(p.getY(i) + dvel[i].y * dt, root.position.y - 0.3), p.getZ(i) + dvel[i].z * dt);
        if (dlife[i] <= 0) p.setY(i, -999);
      }
      p.needsUpdate = true;
    },
    mastPosition(out) { return (model.getObjectByName('head') || model).getWorldPosition(out); },
  };
}
