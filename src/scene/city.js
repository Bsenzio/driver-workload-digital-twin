import * as THREE from 'three';
import { signalPhase } from '../sim/city.js';

const lights = {
  red: ['#572323', '#ff6255'],
  amber: ['#5b4524', '#ffc356'],
  green: ['#1a4b3b', '#61f2ad'],
};

export function createCity(junctions) {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map();
  const object = new THREE.Object3D();

  function block(color, x, y, z, width, height, depth) {
    if (!batches.has(color)) batches.set(color, []);
    object.position.set(x, y, z);
    object.scale.set(width, height, depth);
    object.updateMatrix();
    batches.get(color).push(object.matrix.clone());
  }

  const asphalt = '#353c46';
  const concrete = '#737c83';
  const white = '#d4dfde';
  const yellow = '#d3a365';
  block('#4c5a62', 0, -0.18, -128, 132, 0.2, 320);
  block(asphalt, 0, -0.04, -128, 12, 0.08, 320);

  const streetBounds = [-30, ...junctions.map(junction => junction.distance), 285];
  for (let index = 0; index < streetBounds.length - 1; index++) {
    const start = streetBounds[index] + (index ? 6.3 : 0);
    const end = streetBounds[index + 1] - (index + 1 < streetBounds.length - 1 ? 6.3 : 0);
    const depth = end - start;
    const center = -(start + end) / 2;
    for (const side of [-1, 1]) {
      block(concrete, side * 8.45, 0.03, center, 4.9, 0.14, depth);
      block('#a5adb0', side * 6.1, 0.055, center, 0.24, 0.17, depth);
      for (let distance = start + 12; distance < end - 8; distance += 24) {
        const z = -distance;
        block('#536977', side * 6.9, 2.7, z, 0.14, 5.4, 0.14);
        block('#536977', side * 6.23, 5.3, z, 1.4, 0.14, 0.14);
        block('#bfd6d9', side * 5.62, 5.22, z, 0.48, 0.12, 0.29);
      }
      for (let lot = 0, distance = start + 9; distance < end - 8; distance += 18, lot++) {
        const variant = (lot + index * 2 + (side > 0 ? 2 : 0)) % 5;
        const color = ['#647b8c', '#9a7768', '#797887', '#90938b', '#547180'][variant];
        const floors = [3, 4, 5, 2, 4][variant];
        const height = floors * 2.8 + 0.9;
        const z = -distance;
        const x = side * 17;
        block(color, x, height / 2, z, 11, height, 15.4);
        block('#425460', x, height + 0.17, z, 11.6, 0.34, 15.9);
        block('#71848e', x, height + 0.70, z + 2, 4, 1.0, 3.9);
        block('#434e59', side * 11.38, 0.13, z, 0.16, 0.26, 15.4);
        for (let floor = 0; floor < floors; floor++) {
          const y = 1.55 + floor * 2.8;
          const glass = floor % 3 === 0 ? '#466474' : '#526c7c';
          for (let bay = -2; bay <= 2; bay++) {
            block(glass, side * 11.47, y, z + bay * 2.55, 0.07, 1.32, 1.55);
            block('#9babb0', side * 11.44, y - 0.7, z + bay * 2.55, 0.13, 0.09, 1.69);
          }
          for (const endSide of [-1, 1]) {
            for (let bay = -1; bay <= 1; bay++) {
              block(glass, x + bay * 2.8, y, z + endSide * 7.72, 1.55, 1.32, 0.07);
            }
          }
        }
        block('#354653', side * 11.41, 1.0, z, 0.12, 1.9, 1.45);
      }
    }
    for (let distance = start + 2; distance < end - 2; distance += 5.6) {
      block(yellow, 0, 0.005, -distance, 0.14, 0.012, 2.6);
    }
  }

  const signals = [];
  const lampGeometry = new THREE.SphereGeometry(0.20, 12, 8);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: '#50616b' });
  const casingMaterial = new THREE.MeshStandardMaterial({ color: '#202a30' });
  function box(parent, material, x, y, z, width, height, depth) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
  }

  function trafficLight(x, z, rotation, junction, cross) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    root.add(group);
    box(group, poleMaterial, 0, 2.73, 0, 0.18, 5.46, 0.18);
    box(group, poleMaterial, -2.25, 5.35, 0, 4.5, 0.12, 0.16);
    box(group, poleMaterial, -4.1, 4.86, 0, 0.12, 0.98, 0.12);
    box(group, casingMaterial, -4.1, 3.8, 0, 0.62, 1.15, 0.34);
    const bulbs = Object.entries(lights).map(([phase, [dim, bright]], index) => {
      const material = new THREE.MeshBasicMaterial({ color: dim, toneMapped: false });
      const lens = new THREE.Mesh(lampGeometry, material);
      lens.position.set(-4.1, 4.14 - index * 0.34, 0.20);
      lens.scale.z = 0.41;
      group.add(lens);
      return { phase, dim, bright, material };
    });
    signals.push({ junction, cross, bulbs, phase: null });
  }

  for (const junction of junctions) {
    const z = -junction.distance;
    block(asphalt, 0, -0.036, z, 124, 0.076, 10.6);
    for (const side of [-1, 1]) {
      // Main street interrupts the cross-street sidewalks.
      for (const half of [-1, 1]) block(concrete, half * 34, 0.025, z + side * 5.75, 56, 0.13, 0.82);
      block(white, side * 3.0, 0.013, z + side * 7.3, 5.65, 0.015, 0.28);
      for (let line = -5; line <= 5; line++) {
        block(white, line, 0.012, z + side * 5.95, 0.53, 0.012, 1.05);
      }
      for (let line = -4; line <= 4; line++) {
        block(white, side * 6.3, 0.011, z + line, 1.1, 0.012, 0.46);
      }
      for (let distance = 10; distance < 59; distance += 5.2) {
        block(yellow, side * distance, 0.005, z, 2.5, 0.013, 0.12);
      }
    }
    trafficLight(7.0, z + 7.9, 0, junction, false);
    trafficLight(-7.0, z - 7.9, Math.PI, junction, false);
    trafficLight(-8.1, z + 6.8, -Math.PI / 2, junction, true);
    trafficLight(8.1, z - 6.8, Math.PI / 2, junction, true);
  }

  for (const [color, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color }), matrices.length);
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    root.add(mesh);
  }

  return {
    root,
    update(timeMs) {
      for (const signal of signals) {
        const main = signalPhase(signal.junction, timeMs);
        const phase = signal.cross ? (main === 'red' ? 'green' : 'red') : main;
        if (phase === signal.phase) continue;
        signal.phase = phase;
        for (const lamp of signal.bulbs) {
          const active = lamp.phase === phase;
          lamp.material.color.set(active ? lamp.bright : lamp.dim);

        }
      }
    },
  };
}
