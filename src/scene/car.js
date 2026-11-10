import * as THREE from 'three';

export function buildCar(color = '#2299a6') {
  const car = new THREE.Group();
  car.name = 'Aster prototype';
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.28 });
  const trim = new THREE.MeshStandardMaterial({ color: '#11191e', roughness: 0.62 });
  const glass = new THREE.MeshStandardMaterial({ color: '#22353f', metalness: 0.63, roughness: 0.17 });
  const alloy = new THREE.MeshStandardMaterial({ color: '#b4c8cb', metalness: 0.65, roughness: 0.32 });
  const rear = new THREE.MeshStandardMaterial({ color: '#fd4240', emissive: '#ff1610', emissiveIntensity: 0.65 });
  const front = new THREE.MeshStandardMaterial({ color: '#d9f6ff', emissive: '#a6e7ff', emissiveIntensity: 1.25 });

  function mesh(name, geometry, material, x = 0, y = 0, z = 0) {
    const part = new THREE.Mesh(geometry, material);
    part.name = name;
    part.position.set(x, y, z);
    car.add(part);
    return part;
  }

  function loft(name, sections, material) {
    const vertices = [];
    for (const [z, width, low, high] of sections) {
      vertices.push(-width * 0.88, low, z, width * 0.88, low, z, width, low + 0.10, z,
        width * 0.92, high, z, -width * 0.92, high, z, -width, low + 0.10, z);
    }
    const faces = [];
    for (let slice = 0; slice < sections.length - 1; slice++) {
      for (let side = 0; side < 6; side++) {
        const a = 6 * slice + side;
        const b = 6 * slice + (side + 1) % 6;
        faces.push(a, b, b + 6, a, b + 6, a + 6);
      }
    }
    const last = 6 * (sections.length - 1);
    for (let side = 1; side < 5; side++) faces.push(0, side + 1, side, last, last + side, last + side + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(faces);
    geometry.computeVertexNormals();
    mesh(name, geometry, material);
  }

  // Sections are ordered front to rear along +Z.
  loft('Undertray', [[-2.23, 0.92, 0.36, 0.53], [-1.81, 1.01, 0.29, 0.55],
    [1.73, 1.03, 0.29, 0.59], [2.19, 0.94, 0.37, 0.55]], trim);
  loft('Coachwork', [[-2.24, 0.89, 0.49, 0.66], [-1.62, 1.03, 0.46, 0.78], [-0.55, 0.98, 0.43, 0.91],
    [0.75, 1.01, 0.43, 0.93], [1.6, 1.07, 0.48, 0.88], [2.2, 0.96, 0.53, 0.78]], paint);
  loft('Glazing', [[-0.94, 0.85, 0.80, 0.89], [-0.39, 0.72, 0.89, 1.35],
    [0.46, 0.71, 0.89, 1.35], [1.32, 0.83, 0.84, 0.92]], glass);
  loft('Roof', [[-0.44, 0.72, 1.32, 1.36], [-0.19, 0.70, 1.34, 1.40],
    [0.37, 0.69, 1.34, 1.40], [0.53, 0.70, 1.31, 1.35]], paint);

  mesh('Rear light bar', new THREE.BoxGeometry(1.74, 0.065, 0.043), rear, 0, 0.71, 2.2);
  mesh('Rear diffuser', new THREE.BoxGeometry(1.25, 0.11, 0.045), trim, 0, 0.46, 2.2);
  for (const side of [-1, 1]) {
    mesh('Headlamp', new THREE.BoxGeometry(0.47, 0.055, 0.042), front, side * 0.60, 0.61, -2.24);
    mesh('Mirror', new THREE.BoxGeometry(0.27, 0.09, 0.17), paint, side * 0.98, 0.98, -0.55);
    for (const z of [-1.43, 1.45]) {
      const wheel = mesh('Tire', new THREE.CylinderGeometry(0.39, 0.39, 0.29, 24), trim, side, 0.40, z);
      wheel.rotation.z = Math.PI / 2;
      const rim = mesh('Wheel face', new THREE.CylinderGeometry(0.27, 0.27, 0.025, 16),
        alloy, side * 1.15, 0.40, z);
      rim.rotation.z = Math.PI / 2;
      const hub = mesh('Wheel hub', new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12),
        trim, side * 1.167, 0.40, z);
      hub.rotation.z = Math.PI / 2;
    }
  }
  return car;
}
