import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/sim/session.js';
import { scenarios } from '../src/sim/scenarios.js';
import { decodeFrame } from '../src/sim/can.js';
import { createClock } from '../src/sim/clock.js';
import { sensorCsv } from '../src/ui/sensors.js';
import { healthFeatures, sensorTruth } from '../src/sim/sensors.js';
import { generateHealthDataset, trainHealthModels } from '../src/ml/sensor-health.js';

const cutIn = scenarios.find(scenario => scenario.id === 'vehicle-cut-in');

function run(mode, speed = 1) {
  const session = createSession(cutIn, { sensorConfig: { target: 'radar', mode } });
  const frames = [];
  const clock = createClock(() => {
    session.step();
    frames.push(...session.recentFrames.slice(-session.current.can_frames_in_step));
    return !session.complete;
  });
  clock.play();
  while (clock.active) clock.advance(17, speed);
  return { session, frames };
}

test('fault streams and frame bytes are deterministic across playback rates, with an identical paired baseline', () => {
  const healthy = run('healthy').session;
  for (const mode of ['noise', 'delay', 'dropout']) {
    const actual = run(mode, 2);
    const slower = run(mode, 0.5);
    assert.deepEqual(actual.session.samples, slower.session.samples);
    assert.deepEqual(actual.frames, slower.frames);
    assert.deepEqual(actual.session.sensors.baseline, healthy.sensors.baseline);
    for (let i = 0; i < healthy.samples.length; i++) {
      for (const key of ['speed_kmh', 'distance_m', 'long_accel_mps2', 'steer_deg', 'brake_pct', 'driver_demand_index', 'synthetic_reference_index']) {
        assert.equal(actual.session.samples[i][key], healthy.samples[i][key]);
      }
    }
  }
});

test('delayed perception frames preserve sample times and dropout suppresses deliveries', () => {
  const delayed = run('delay');
  const frames = delayed.frames.filter(frame => frame.id === 0x124);
  assert.equal(frames[0].timeMs, 400);
  assert.equal(frames[0].sourceTimeMs, 100);
  assert.ok(frames.every(frame => frame.timeMs - frame.sourceTimeMs === 300));
  assert.equal(decodeFrame(frames[0])[0].unit, 'm');
  const healthy = run('healthy');
  const dropped = run('dropout');
  assert.ok(dropped.frames.filter(frame => frame.id === 0x124).length < healthy.frames.filter(frame => frame.id === 0x124).length);
  const first = healthy.session.samples[0];
  assert.equal(first.cpu_demand_ms, 27);
  assert.equal(first.can_frames_in_step, 6);
  assert.equal(healthy.session.samples[1].cpu_demand_ms, 31);
  assert.equal(healthy.session.samples[9].can_frames_per_s, 70);
});

test('cut-in targets enter the forward field of view and wheel differences follow right steering', () => {
  const session = createSession(cutIn, { sensorConfig: { mode: 'healthy' } });
  while (session.current.sim_time_ms < 11000) session.step();
  assert.ok(session.sensors.latest.detected.radar.some(target => target.id === 'merging'));
  const sample = { ...session.current, steer_deg: 45 };
  const { truth } = sensorTruth(sample, []);
  assert.ok(truth.wheels.front_left_kmh > truth.wheels.front_right_kmh);
  assert.ok(truth.imu.yaw_rate_deg_s > 0);
  assert.equal(truth.pressure.pressure_bar, sample.brake_pct * 0.8);
});

test('sensor CSV includes delayed values, baseline and initial missing samples without inventing data', () => {
  const { session } = run('delay');
  const csv = sensorCsv(session, 'radar');
  const lines = csv.trimEnd().split('\r\n');
  const headers = lines[0].split(',');
  const first = Object.fromEntries(lines[1].split(',').map((value, index) => [headers[index], value]));
  assert.equal(first.measured, '');
  assert.equal(first.sample_time_ms, '');
  assert.equal(first.quality, 'Waiting for sample');
  assert.equal(first.fault_mode, 'delay');
  assert.equal(first.sim_time_ms, '100');
  const last = Object.fromEntries(lines.at(-1).split(',').map((value, index) => [headers[index], value]));
  assert.equal(last.age_ms, '300');
  assert.equal(last.sim_time_ms, '38000');
  assert.equal(last.sensor_id, 'radar');
});

test('quality models evaluate held-out replay episodes and classify fresh and delayed radar windows', () => {
  const rows = generateHealthDataset();
  const training = new Set(rows.filter(row => row.split === 'train').map(row => row.episode_id));
  assert.ok(rows.filter(row => row.split === 'test').every(row => !training.has(row.episode_id)));
  const models = trainHealthModels(rows);
  const fresh = run('healthy').session;
  const late = run('delay').session;
  for (const model of models) {
    assert.ok(model.balanced > 0.6, model.name);
    assert.equal(model.predict(healthFeatures(fresh.sensors.windows.radar)), 'healthy', model.name);
    assert.equal(model.predict(healthFeatures(late.sensors.windows.radar)), 'delay', model.name);
  }
});
