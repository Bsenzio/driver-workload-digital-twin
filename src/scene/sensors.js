import * as THREE from 'three';
import { SENSORS } from '../sim/sensors.js';

export function createSensorOverlay(carMount, scene) {
  const root = new THREE.Group();
  carMount.add(root);
  const geometry = new THREE.SphereGeometry(0.11, 10, 7);
  const markers = [];
  for (const sensor of SENSORS) {
    const positions = sensor.id === 'wheels' ? [[-1.1, 0.52, -1.43], [1.1, 0.52, -1.43], [-1.1, 0.52, 1.45], [1.1, 0.52, 1.45]] : [sensor.position];
    for (const position of positions) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#91dce9', depthTest: false, toneMapped: false }));
      mesh.position.set(...position);
      mesh.userData.sensorId = sensor.id;
      mesh.renderOrder = 4;
      root.add(mesh);
      markers.push(mesh);
    }
  }
  const fans = new Map();
  for (const sensor of SENSORS.filter(item => item.range)) {
    const vertices = [0, 0.05, -2.3];
    const a = sensor.halfAngle * Math.PI / 180;
    for (let i = 0; i <= 32; i++) {
      const angle = -a + 2 * a * i / 32;
      vertices.push(sensor.range * Math.sin(angle), 0.05, -2.3 - sensor.range * Math.cos(angle));
    }
    const indices = [];
    for (let i = 1; i <= 32; i++) indices.push(0, i, i + 1);
    const fanGeometry = new THREE.BufferGeometry();
    fanGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    fanGeometry.setIndex(indices);
    const fan = new THREE.Mesh(fanGeometry, new THREE.MeshBasicMaterial({
      color: sensor.id === 'radar' ? '#66e3ba' : '#e8b36c', transparent: true, opacity: 0.075,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    root.add(fan);
    fans.set(sensor.id, fan);
  }
  const targets = new THREE.Group();
  scene.add(targets);
  const boxGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 1.7, 4.6));
  const targetMaterial = new THREE.LineBasicMaterial({ color: '#f5c17c', transparent: true, opacity: 0.8 });
  const boxes = Array.from({ length: 12 }, () => {
    const box = new THREE.LineSegments(boxGeometry, targetMaterial);
    targets.add(box);
    return box;
  });
  return {
    pick(raycaster) {
      if (!root.visible) return null;
      return raycaster.intersectObjects(markers)[0]?.object.userData.sensorId;
    },
    update(view, lateral, distance) {
      root.visible = targets.visible = Boolean(view?.show);
      if (!view?.show) return;
      for (const marker of markers) {
        const selected = marker.userData.sensorId === view.id;
        marker.scale.setScalar(selected ? 1.65 : 1);
        marker.material.color.set(selected ? (view.stale ? '#ff9788' : '#ffffff') : '#73d9e4');
      }
      for (const [id, fan] of fans) fan.visible = id === view.id;
      const detected = view.latest?.detected[view.id] ?? [];
      boxes.forEach((box, index) => {
        const target = detected[index];
        box.visible = Boolean(target);
        if (target) box.position.set(lateral + target.x, 0.85, -distance - target.ahead);
      });
    },
  };
}
