import * as THREE from 'three';

export function createCabin() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#243746');
  scene.add(new THREE.HemisphereLight('#dcf3ff', '#403245', 2.65));
  const key = new THREE.DirectionalLight('#ffd7ad', 3);
  key.position.set(2, 2.7, -0.2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(39, 1, 0.05, 30);
  camera.position.set(1.62, 1.49, -1.15);
  camera.lookAt(-0.19, 1.03, -0.19);

  function part(parent, geometry, color, position) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  }
  const box = (parent, color, size, position) => part(parent, new THREE.BoxGeometry(...size), color, position);
  function oval(parent, color, position, scale) {
    const mesh = part(parent, new THREE.SphereGeometry(1, 14, 9), color, position);
    mesh.scale.set(...scale);
    return mesh;
  }

  box(scene, '#202934', [2.9, 0.16, 2.65], [0, 0.33, 0.08]);
  box(scene, '#2a3544', [0.15, 0.75, 2.3], [-1.03, 0.72, 0.10]);
  box(scene, '#405061', [0.06, 0.04, 2.15], [-0.947, 0.98, 0.08]);
  box(scene, '#273442', [2.7, 0.22, 0.65], [0, 0.85, -1.00]);
  box(scene, '#6ca9af', [2.5, 0.026, 0.025], [0, 0.956, -0.68]);
  box(scene, '#14202a', [0.55, 0.09, 0.62], [-0.49, 0.62, 0.10]);
  box(scene, '#344452', [0.53, 0.69, 0.15], [-0.54, 0.96, 0.32]);
  box(scene, '#394955', [0.29, 0.21, 0.13], [-0.53, 1.37, 0.33]);
  box(scene, '#354556', [0.1, 0.14, 1.95], [-0.99, 1.72, 0.18]);
  const pillar = box(scene, '#354556', [0.1, 0.1, 0.92], [-1, 1.39, -0.80]);
  pillar.rotation.x = -0.79;

  const driver = new THREE.Group();
  driver.position.set(-0.49, 0.64, 0.04);
  scene.add(driver);
  oval(driver, '#3c7d8f', [0, 0.24, 0], [0.25, 0.29, 0.14]);
  oval(driver, '#bd9d80', [0, 0.46, -0.02], [0.082, 0.11, 0.08]);
  const head = new THREE.Group();
  head.position.set(0, 0.61, -0.04);
  driver.add(head);
  oval(head, '#d7b99a', [0, 0, 0], [0.135, 0.166, 0.124]);
  oval(head, '#303137', [0, 0.066, 0.03], [0.134, 0.112, 0.121]);
  oval(head, '#d7b99a', [0, -0.023, -0.119], [0.040, 0.041, 0.041]);
  for (const side of [-1, 1]) {
    oval(head, '#bd9d80', [side * 0.123, -0.025, 0], [0.025, 0.041, 0.027]);
    oval(head, '#343235', [side * 0.067, 0.012, -0.105], [0.017, 0.011, 0.009]);
  }

  const wheel = new THREE.Group();
  wheel.position.set(-0.47, 1.02, -0.62);
  scene.add(wheel);
  part(wheel, new THREE.TorusGeometry(0.23, 0.024, 8, 24), '#15212b', [0, 0, 0]);
  box(wheel, '#344653', [0.39, 0.044, 0.034], [0, 0, 0]);
  box(wheel, '#344653', [0.042, 0.19, 0.033], [0, -0.09, 0]);

  const up = new THREE.Vector3(0, 1, 0);
  const shoulder = new THREE.Vector3();
  const hand = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const arms = [-1, 1].map(side => ({
    side,
    sleeve: part(scene, new THREE.CylinderGeometry(0.062, 0.078, 1, 10), '#3c7d8f', [0, 0, 0]),
    glove: oval(scene, '#d7b99a', [0, 0, 0], [0.056, 0.05, 0.056]),
  }));

  return {
    scene, camera,
    pose(steer, cue, reduced) {
      wheel.rotation.z = -steer * Math.PI / 180;
      driver.rotation.x = reduced ? 0 : -cue.lean;
      head.rotation.y = reduced ? 0 : -cue.look;
      head.rotation.x = reduced ? 0 : cue.lean * 0.46;
      driver.updateMatrixWorld();
      wheel.updateMatrixWorld();
      for (const { side, sleeve, glove } of arms) {
        driver.localToWorld(shoulder.set(side * 0.20, 0.34, -0.02));
        wheel.localToWorld(hand.set(side * 0.206, 0.10, 0.022));
        direction.subVectors(hand, shoulder);
        sleeve.position.copy(shoulder).lerp(hand, 0.5);
        sleeve.scale.y = direction.length();
        sleeve.quaternion.setFromUnitVectors(up, direction.normalize());
        glove.position.copy(hand);
      }
    },
  };
}
