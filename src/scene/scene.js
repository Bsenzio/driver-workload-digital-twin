import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCar } from './car.js';
import { createCabin } from './cabin.js';
import { driverCue, trafficAt } from '../sim/traffic.js';

function batchTrack(group) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    mesh.updateMatrix();
    const color = mesh.material.color.getHex();
    if (!batches.has(color)) batches.set(color, { material: mesh.material, meshes: [] });
    batches.get(color).meshes.push(mesh);
  }
  group.clear();
  for (const { material, meshes } of batches.values()) {
    const geometries = meshes.map(mesh => mesh.geometry.applyMatrix4(mesh.matrix));
    group.add(new THREE.Mesh(mergeGeometries(geometries), material));
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      if (mesh.material !== material) mesh.material.dispose();
    }
  }
}

export function createVehicleView(container, cabinFrame, setStatus) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    setStatus('Static view · WebGL unavailable', 'static');
    return { draw() {}, reset() {} };
  }
  cabinFrame.dataset.renderer = 'webgl';
  const cabin = createCabin();
  const size = new THREE.Vector2();
  let inset;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor('#232e38');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    renderer.domElement.hidden = true;
    cabinFrame.dataset.renderer = 'static';
    setStatus('Static view · graphics context lost', 'static');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    renderer.domElement.hidden = false;
    cabinFrame.dataset.renderer = 'webgl';
    lastPose = undefined;
    setStatus(modelLabel, 'ready');
  });

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#26323c', 29, 115);
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 175);
  scene.add(new THREE.HemisphereLight('#ddf5ff', '#343d4c', 2.15));
  function studioLight(color, power, x, y, z) {
    const light = new THREE.DirectionalLight(color, power);
    light.position.set(x, y, z);
    scene.add(light);
  }
  studioLight('#dbfaff', 3.3, -4, 7, 6);
  studioLight('#ffd5a3', 2.1, 5, 3, -7);

  function box(group, color, size, position) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color }));
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  }

  // The track scrolls relative to the follow camera, based solely on integrated travel.
  const track = new THREE.Group();
  const markings = new THREE.Group();
  scene.add(track, markings);
  box(track, '#394751', [130, 0.1, 280], [0, -0.13, -58]);
  box(track, '#232831', [12.2, 0.08, 280], [0, -0.08, -58]);
  for (const side of [-1, 1]) {
    box(track, '#98a8af', [0.10, 0.01, 260], [side * 5.86, -0.03, -59]);
    box(track, '#53646b', [0.18, 0.16, 260], [side * 7.5, 0.04, -59]);
    box(track, '#61787a', [0.11, 0.01, 260], [side * 5.4, -0.03, -59]);
  }
  for (let section = -12; section <= 3; section++) {
    const z = section * 10;
    box(markings, '#d8dad2', [0.12, 0.012, 3.8], [0, -0.025, z]);
    for (const side of [-1, 1]) {
      box(markings, '#8f9c9b', [0.10, 0.36, 0.13], [side * 7.5, 0.13, z]);
      box(markings, '#586968', [2.7, 0.035, 0.05], [side * 9.2, -0.054, z]);
    }
  }

  batchTrack(track);
  batchTrack(markings);

  const trafficMount = new THREE.Group();
  const trafficModels = new Map();
  scene.add(trafficMount);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 7), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 uvPos; void main(){uvPos=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 uvPos; void main(){float d=length((uvPos-0.5)*2.0);gl_FragColor=vec4(0.,0.,0.,0.65*(1.0-smoothstep(0.28,1.0,d)));}',
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.019;
  scene.add(shadow);

  const obstacle = new THREE.Group();
  scene.add(obstacle);
  box(obstacle, '#231e1b', [2.4, 0.16, 0.5], [0, 0.1, 0]);
  const barricade = box(obstacle, '#e48c24', [2.4, 0.68, 0.24], [0, 0.53, 0]);
  barricade.material.emissive.set('#c95510');
  barricade.material.emissiveIntensity = 0.55;
  for (const x of [-0.78, 0, 0.78]) {
    const stripe = box(obstacle, '#fff3c6', [0.23, 0.66, 0.025], [x, 0.53, 0.13]);
    stripe.rotation.z = -0.3;
  }
  obstacle.visible = false;

  const mount = new THREE.Group();
  scene.add(mount);
  let car;
  let rearLight;
  let obstacleAt = null;
  let lastPose;
  let modelLabel = 'Loading local GLB…';
  setStatus(modelLabel, 'loading');
  function useCar(model, label) {
    if (car) mount.remove(car);
    car = model;
    rearLight = car.getObjectByName('Rear_light_bar') ?? car.getObjectByName('Rear light bar');
    mount.add(car);
    lastPose = undefined;
    modelLabel = label;
    setStatus(label, 'ready');
  }
  new GLTFLoader().load(import.meta.env.BASE_URL + 'models/aster.glb',
    gltf => useCar(gltf.scene, 'Local GLB · Aster'),
    undefined,
    () => useCar(buildCar(), 'Fallback · procedural vehicle'));

  const resize = new ResizeObserver(() => {
    const viewport = container.getBoundingClientRect();
    const frame = cabinFrame.getBoundingClientRect();
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    if (!width || !height || !frame.height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    inset = {
      x: Math.round(frame.left - viewport.left),
      y: Math.round(viewport.bottom - frame.bottom),
      width: Math.round(frame.width),
      height: Math.round(frame.height),
    };
    cabin.camera.aspect = inset.width / inset.height;
    cabin.camera.updateProjectionMatrix();
    lastPose = undefined;
  });
  resize.observe(container);
  resize.observe(cabinFrame);
  const lerp = THREE.MathUtils.lerp;

  return {
    reset() { obstacleAt = null; lastPose = undefined; },
    draw(previous, current, alpha, scenario) {
      if (renderer.domElement.hidden) return;
      if (lastPose?.current === current && lastPose.alpha === alpha &&
          lastPose.reduced === reducedMotion.matches) return;
      lastPose = { current, alpha, reduced: reducedMotion.matches };
      const distance = lerp(previous.distance_m, current.distance_m, alpha);
      const steer = lerp(previous.steer_deg, current.steer_deg, alpha);
      const lane = scenario.id === 'urban-stop-and-go' ? 2.65 : 2.9;
      const lateral = lane + Math.sin(steer / 92) * 0.95;
      mount.position.set(lateral, 0, -distance);
      mount.rotation.y = -steer * Math.PI / 180 * 0.40;
      shadow.position.x = lateral;
      shadow.position.z = -distance;
      track.position.z = -distance;
      markings.position.z = -distance + (reducedMotion.matches ? 0 : distance % 10);
      if (rearLight) rearLight.material.emissiveIntensity = 0.7 + current.brake_pct / 17;
      if (current.hazard_active && obstacleAt === null) obstacleAt = current.distance_m + 52;
      obstacle.visible = Boolean(current.hazard_active);
      obstacle.position.set(lane, 0, -obstacleAt);
      const drift = reducedMotion.matches ? 0 : lateral - lane;
      const narrow = camera.aspect < 1.25;
      camera.position.set(lane + (narrow ? 3.9 : 5.8) + drift * 0.48, narrow ? 3.65 : 4.15,
        -distance + (narrow ? 8.1 : 8.4));
      camera.lookAt(lane - 0.6 + drift * 0.22, 0.65, -distance - 4.5);
      const renderTime = lerp(previous.sim_time_ms, current.sim_time_ms, alpha);
      const actors = trafficAt(scenario.id, renderTime);
      for (const model of trafficModels.values()) model.visible = false;
      for (const actor of actors) {
        if (!trafficModels.has(actor.id)) {
          const model = buildCar(actor.color);
          trafficMount.add(model);
          trafficModels.set(actor.id, model);
        }
        const model = trafficModels.get(actor.id);
        model.visible = true;
        model.position.set(lane + 5.5 * actor.lane, 0, -distance - actor.gapM);
        model.rotation.y = actor.oncoming ? Math.PI : 0;
      }
      cabin.pose(steer, driverCue(current, trafficAt(scenario.id, current.sim_time_ms)), reducedMotion.matches);
      renderer.getSize(size);
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
      if (inset) {
        renderer.setViewport(inset.x, inset.y, inset.width, inset.height);
        renderer.setScissor(inset.x, inset.y, inset.width, inset.height);
        renderer.setScissorTest(true);
        renderer.render(cabin.scene, cabin.camera);
        renderer.setScissorTest(false);
      }
    },
  };
}
