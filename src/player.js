// First-person player body built from "Astronaut by Jungle Jim" (CC BY 4.0, Sketchfab).
// The model is one static mesh (split by material, no skeleton), so parts are separated in the shader
// by model-space position: the body hides the helmet and arms, each first-person arm keeps only its arm.
import * as THREE from 'three';

const H = 1.85;                  // model is 1 unit tall -> 1.85 m astronaut
const NECK = 0.74, HIP = 0.46, ARM_X = 0.165, SHOULDER = new THREE.Vector3(0.19, 0.8, 0.05);

// Bake every mesh into one model space: y 0..1 up, front +Z, so the shader can cut by position.
function bakedMeshes(scene) {
  scene.updateMatrixWorld(true);
  const out = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    out.push({ geometry: g, material: o.material });
  });
  return out;
}

// Walk cycle in the vertex shader (model space, y up, front +Z): legs swing about the hip, arms about the
// shoulder in the opposite phase. Used by the body and by its shadow (depth) material, so the shadow walks too.
const SWING = `
  if (position.y < ${HIP.toFixed(3)}) {
    float a = sin(uWalk) * uAmp * sign(position.x);
    float py = transformed.y - ${HIP.toFixed(3)}, pz = transformed.z - 0.05;
    transformed.y = ${HIP.toFixed(3)} + py * cos(a) - pz * sin(a);
    transformed.z = 0.05 + py * sin(a) + pz * cos(a);
  } else if (position.y > 0.40 && position.y < 0.86 && abs(position.x) > ${ARM_X.toFixed(3)}) {
    float a = -sin(uWalk) * uAmp * 0.8 * sign(position.x);
    float py = transformed.y - ${SHOULDER.y.toFixed(3)}, pz = transformed.z - ${SHOULDER.z.toFixed(3)};
    transformed.y = ${SHOULDER.y.toFixed(3)} + py * cos(a) - pz * sin(a);
    transformed.z = ${SHOULDER.z.toFixed(3)} + py * sin(a) + pz * cos(a);
  }`;

// shadow caster for the body: whole astronaut silhouette (head and arms included), walking
function shadowMaterial(uniforms) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWalk = uniforms.uWalk; sh.uniforms.uAmp = uniforms.uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWalk; uniform float uAmp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWING);
  };
  m.customProgramCacheKey = () => 'playerShadow';
  return m;
}

// mode 0: body (no head, no arms, swinging legs); mode +1/-1: only the arm on that side of model x
function partMaterial(src, mode, uniforms) {
  const m = src.clone();
  m.side = THREE.DoubleSide;     // cut edges would otherwise show see-through holes
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWalk = uniforms.uWalk; sh.uniforms.uAmp = uniforms.uAmp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWalk; uniform float uAmp; varying vec3 vMP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMP = position;
        ${mode === 0 ? SWING : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMP;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${mode === 0
          ? `if (vMP.y > ${NECK.toFixed(3)} || (vMP.y > 0.40 && abs(vMP.x) > ${ARM_X.toFixed(3)})) discard;`
          : `if (vMP.x * ${mode.toFixed(1)} < ${ARM_X.toFixed(3)} || vMP.y < 0.3 || vMP.y > 0.9) discard;`}`);
  };
  m.customProgramCacheKey = () => 'part' + mode;
  return m;
}

export function makePlayer(gltf, camera) {
  const parts = bakedMeshes(gltf.scene);
  const uniforms = { uWalk: { value: 0 }, uAmp: { value: 0 } };

  // body: follows the player's feet and yaw, seen when looking down; casts the player's shadow
  const body = new THREE.Group(), inner = new THREE.Group();
  inner.scale.setScalar(H); inner.position.z = -0.32;     // body sits behind the eye so it only shows when you look down
  body.add(inner);
  const shadow = shadowMaterial(uniforms);
  for (const p of parts) {
    const m = new THREE.Mesh(p.geometry, partMaterial(p.material, 0, uniforms));
    m.customDepthMaterial = shadow;          // the sun's shadow map uses this: full figure, walking
    m.castShadow = true; m.receiveShadow = true; inner.add(m);
  }

  // arms: copies of the model's own arms, raised in front of the camera
  const arms = new THREE.Group();
  for (const s of [-1, 1]) {                 // model -x shows on the camera's right once turned to face -Z
    const pivot = new THREE.Group(), hold = new THREE.Group();
    pivot.add(hold); arms.add(pivot);
    hold.rotation.y = Math.PI;
    for (const p of parts) {
      const m = new THREE.Mesh(p.geometry, partMaterial(p.material, s, uniforms));
      m.scale.setScalar(H); m.position.copy(SHOULDER).multiply(new THREE.Vector3(s, 1, 1)).multiplyScalar(-H);
      m.renderOrder = 10; m.frustumCulled = false; hold.add(m);
    }
    const side = -s;                         // +1 = camera right
    pivot.position.set(0.24 * side, -0.3, 0.1);
    pivot.rotation.set(1.6, 0.5 * side, 0, 'YXZ');   // arm raised to point forward, hands angled inward
    pivot.userData.side = side;
  }
  camera.add(arms);

  const yaw = new THREE.Euler(0, 0, 0, 'YXZ');
  return {
    body, arms, uniforms,
    // feet: world position under the player; moving: 0..1 walk amount; t: time
    update(feet, moving, running, t) {
      yaw.setFromQuaternion(camera.quaternion);
      body.position.copy(feet); body.rotation.y = yaw.y + Math.PI;
      uniforms.uWalk.value = t * (running ? 9 : 6);
      uniforms.uAmp.value += ((moving ? (running ? 0.45 : 0.3) : 0) - uniforms.uAmp.value) * 0.15;
      arms.children.forEach((p) => {        // arms sway with the stride
        p.position.y = -0.3 + Math.sin(uniforms.uWalk.value + (p.userData.side > 0 ? 0 : Math.PI)) * 0.02 * uniforms.uAmp.value * 3;
      });
    },
  };
}
