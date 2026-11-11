import { clamp, seededRandom } from './signals.js';
import { trafficAt } from './traffic.js';
import { cityTrafficAt } from './city.js';

export const SENSORS = [
  { id: 'wheels', name: 'Wheel speed sensors', period: 100, position: [-1.1, 0.45, -1.43], can: '0x126 · 0x120', fields: [
    ['front_left_kmh', 'FL', 'km/h', 0, 220, 0.12], ['front_right_kmh', 'FR', 'km/h', 0, 220, 0.12],
    ['rear_left_kmh', 'RL', 'km/h', 0, 220, 0.12], ['rear_right_kmh', 'RR', 'km/h', 0, 220, 0.12],
  ] },
  { id: 'imu', name: 'Inertial measurement unit', period: 100, position: [0, 1.03, 0], can: '0x127 · 0x120', fields: [
    ['long_accel_mps2', 'Longitudinal acceleration', 'm/s²', -12, 12, 0.025],
    ['lateral_accel_mps2', 'Lateral acceleration', 'm/s²', -15, 15, 0.025],
    ['yaw_rate_deg_s', 'Yaw rate', '°/s', -150, 150, 0.06],
  ] },
  { id: 'steering', name: 'Steering angle sensor', period: 100, position: [-0.5, 1.15, -0.65], can: '0x120', fields: [
    ['steer_deg', 'Steering angle', '°', -85, 85, 0.15],
  ] },
  { id: 'pedals', name: 'Pedal position sensors', period: 100, position: [-0.5, 0.48, -0.9], can: '0x121', fields: [
    ['throttle_pct', 'Accelerator', '%', 0, 100, 0.25], ['brake_pct', 'Brake', '%', 0, 100, 0.25],
  ] },
  { id: 'pressure', name: 'Brake pressure sensor', period: 100, position: [0.4, 0.85, -1.5], can: '0x123', fields: [
    ['pressure_bar', 'Brake pressure', 'bar', 0, 100, 0.16],
  ] },
  { id: 'radar', name: 'Front radar', period: 100, position: [0, 0.65, -2.27], can: '0x124', range: 120, halfAngle: 35, fields: [
    ['range_m', 'Target range', 'm', 0, 120, 0.12], ['relative_mps', 'Relative speed', 'm/s', -65, 65, 0.12],
    ['target_count', 'Targets', '', 0, 20, 0],
  ] },
  { id: 'camera', name: 'Front camera', period: 200, position: [0, 1.32, -0.58], can: '0x125', range: 80, halfAngle: 40, fields: [
    ['range_m', 'Target range', 'm', 0, 80, 0.25], ['target_count', 'Targets', '', 0, 20, 0],
  ] },
];

export const FAULTS = [
  { id: 'healthy', name: 'Healthy' }, { id: 'noise', name: 'Added noise' },
  { id: 'delay', name: '300 ms delay' }, { id: 'dropout', name: '40% sample loss' },
];

export function objectsAt(scenario, sample, obstacleAt = sample.distance_m + 52) {
  const lane = scenario.junctions ? 2.6 : scenario.id === 'urban-stop-and-go' ? 2.65 : 2.9;
  const objects = scenario.junctions
    ? cityTrafficAt(scenario, sample.sim_time_ms, sample.distance_m).map(actor => ({
      id: actor.id, x: actor.x - lane, ahead: -actor.z - sample.distance_m,
    }))
    : trafficAt(scenario.id, sample.sim_time_ms).map(actor => ({
      id: actor.id, x: actor.lane * 5.5, ahead: actor.gapM,
    }));
  if (sample.hazard_active) objects.push({ id: 'obstacle', x: 0, ahead: Math.max(0, obstacleAt - sample.distance_m) });
  return objects;
}

export function sensorTruth(sample, objects, previousTargets = new Map()) {
  const speed = sample.speed_kmh / 3.6;
  const yaw = speed * Math.tan(sample.steer_deg * Math.PI / (180 * 15)) / 2.65;
  const left = clamp((speed + yaw * 0.825) * 3.6, 0, 220);
  const right = clamp((speed - yaw * 0.825) * 3.6, 0, 220);
  const truth = {
    wheels: { front_left_kmh: left, front_right_kmh: right, rear_left_kmh: left, rear_right_kmh: right },
    imu: { long_accel_mps2: sample.long_accel_mps2, lateral_accel_mps2: speed * yaw, yaw_rate_deg_s: yaw * 180 / Math.PI },
    steering: { steer_deg: sample.steer_deg },
    pedals: { throttle_pct: sample.throttle_pct, brake_pct: sample.brake_pct },
    pressure: { pressure_bar: sample.brake_pct * 0.8 },
  };
  const detected = {};
  for (const sensor of SENSORS.filter(item => item.range)) {
    const targets = objects.filter(object => object.ahead > 0 &&
      Math.hypot(object.x, object.ahead) <= sensor.range &&
      Math.abs(Math.atan2(object.x, object.ahead) * 180 / Math.PI) <= sensor.halfAngle)
      .sort((a, b) => a.ahead - b.ahead);
    const nearest = targets[0];
    const range = nearest ? Math.hypot(nearest.x, nearest.ahead) : sensor.range;
    const previous = previousTargets.get(sensor.id);
    const relative = nearest && previous?.id === nearest.id
      ? clamp((range - previous.range) / 0.1, -65, 65) : 0;
    truth[sensor.id] = { range_m: range, target_count: targets.length, ...(sensor.id === 'radar' ? { relative_mps: relative } : {}) };
    previousTargets.set(sensor.id, { id: nearest?.id, range });
    detected[sensor.id] = targets;
  }
  return { truth, detected };
}

export function createSensorSuite({ seed = 42, target = 'radar', mode = 'healthy', delayMs = 300, loss = 0.4, noise = 10 } = {}) {
  const random = seededRandom((seed ^ 0x5ea507) >>> 0);
  const previousTargets = new Map();
  const pending = [];
  const readings = {};
  const history = [];
  const baseline = {};
  const windows = Object.fromEntries(SENSORS.map(sensor => [sensor.id, []]));
  let latest;
  let obstacleAt;
  return {
    readings, baseline, windows, history,
    get latest() { return latest; },
    step(sample, scenario) {
      if (sample.hazard_active && obstacleAt === undefined) obstacleAt = sample.distance_m + 52;
      const objects = objectsAt(scenario, sample, obstacleAt);
      const { truth, detected } = sensorTruth(sample, objects, previousTargets);
      const time = sample.sim_time_ms;
      const delivered = [];
      for (const sensor of SENSORS) {
        const active = sensor.id === target ? mode : 'healthy';
        let fresh = false;
        if (time > 0 && time % sensor.period === 0) {
          const clean = {};
          const measured = {};
          for (const [key, , , min, max, amplitude] of sensor.fields) {
            const baseNoise = (random() - 0.5) * amplitude;
            clean[key] = clamp(truth[sensor.id][key] + baseNoise, min, max);
            const extra = (random() - 0.5) * amplitude * noise;
            measured[key] = clamp(clean[key] + (active === 'noise' ? extra : 0), min, max);
          }
          const dropDraw = random();
          baseline[sensor.id] = { values: clean, sampledAt: time };
          if (!(active === 'dropout' && dropDraw < loss)) {
            pending.push({ sensorId: sensor.id, values: measured, sampledAt: time,
              readyAt: time + (active === 'delay' ? delayMs : 0) });
          }
        }
        for (let index = 0; index < pending.length;) {
          const packet = pending[index];
          if (packet.sensorId !== sensor.id || packet.readyAt > time) { index++; continue; }
          readings[sensor.id] = packet;
          pending.splice(index, 1);
          delivered.push(packet);
          fresh = true;
        }
        const reading = readings[sensor.id];
        const age = reading ? time - reading.sampledAt : null;
        const [first, , , , , amplitude] = sensor.fields[0];
        const error = reading ? (reading.values[first] - truth[sensor.id][first]) / (amplitude || 1) : 0;
        const entry = { time, age, fresh, error, available: Boolean(reading) };
        if (time > 0) windows[sensor.id].push(entry);
        while (windows[sensor.id].length > 20) windows[sensor.id].shift();
      }
      latest = { time, truth, detected, objects, delivered };
      if (time > 0) history.push({ time, truth, readings: { ...readings }, baseline: { ...baseline } });
      return latest;
    },
  };
}

export function healthFeatures(window) {
  const known = window.filter(entry => entry.available);
  const average = values => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  return {
    error_rms: Math.sqrt(average(known.map(entry => entry.error ** 2))),
    age_mean: average(known.map(entry => entry.age / 100)),
    fresh_fraction: average(window.map(entry => Number(entry.fresh))),
    missing_fraction: average(window.map(entry => Number(!entry.available))),
  };
}

export function readingStatus(sensor, reading, time) {
  if (!reading) return 'Waiting for sample';
  const age = time - reading.sampledAt;
  if (age >= sensor.period * 2) return 'Stale';
  return 'Available';
}
