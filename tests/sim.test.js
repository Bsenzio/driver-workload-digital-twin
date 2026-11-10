import test from 'node:test';
import assert from 'node:assert/strict';
import { CAN, decodeFrame, emitFrames, encodeFrame, hexPayload } from '../src/sim/can.js';
import { createClock } from '../src/sim/clock.js';
import { CSV_FIELDS, csvCell, telemetryCsv } from '../src/sim/csv.js';
import { DEMAND } from '../src/sim/demand.js';
import { scenarios } from '../src/sim/scenarios.js';
import { createSession } from '../src/sim/session.js';

function run(scenario, options, speed = 1, elapsed = 16) {
  const session = createSession(scenario, options);
  const frames = [];
  const clock = createClock(() => {
    session.step();
    frames.push(...session.recentFrames.slice(-session.current.can_frames_in_step));
    return !session.complete;
  });
  clock.play();
  while (clock.active) clock.advance(elapsed, speed);
  return { session, frames, csv: telemetryCsv(session.samples) };
}

test('seed, playback speed and render cadence preserve the samples and frame bytes', () => {
  for (const scenario of scenarios) {
    const baseline = run(scenario);
    for (const [speed, elapsed] of [[0.5, 17], [2, 31]]) {
      const actual = run(scenario, undefined, speed, elapsed);
      assert.equal(actual.csv, baseline.csv);
      assert.deepEqual(actual.frames, baseline.frames);
    }
    assert.notEqual(run(scenario, { seed: 19 }).csv, baseline.csv);
    assert.equal(baseline.session.initial.sim_time_ms, 0);
    assert.equal(baseline.session.samples.length, scenario.duration / 100);
    assert.equal(baseline.session.samples[0].sim_time_ms, 100);
    assert.equal(baseline.session.samples.at(-1).sim_time_ms, scenario.duration);
    assert.ok(baseline.session.recentFrames.length <= 100);
  }
});

test('pause preserves fractional progress; reset clears it and inactivity is discarded', () => {
  let steps = 0;
  const clock = createClock(() => { steps++; return true; });
  clock.play();
  clock.advance(70, 1);
  clock.pause();
  clock.advance(200, 2);
  assert.equal(steps, 0);
  clock.play();
  clock.advance(30, 1);
  assert.equal(steps, 1);
  clock.advance(80, 1);
  clock.reset();
  clock.play();
  clock.advance(40, 1);
  clock.advance(8000, 2);
  assert.equal(steps, 1);
  assert.equal(clock.alpha, 0.4);
});

test('CAN intervals are open on the left; ties use ascending ID and counters wrap', () => {
  const values = { speed_kmh: 86.126, long_accel_mps2: -2.387, steer_deg: -17.34,
    throttle_pct: 150, brake_pct: -3, hazard_active: 1 };
  const { frames, counts, counter } = emitFrames(100, 200, values, true, 254);
  assert.deepEqual(frames.map(frame => frame.timeMs), [120, 140, 160, 180, 200, 200, 200, 200]);
  assert.deepEqual(frames.slice(-4).map(frame => frame.id), CAN.map(message => message.id));
  assert.deepEqual(counts, { motion: 1, pedal: 1, hazard: 1, diagnostic: 5 });
  assert.equal(counter, 259);
  assert.deepEqual(frames.filter(frame => frame.id === 0x7a0).map(frame => frame.data[0]), [254, 255, 0, 1, 2]);
  assert.equal(hexPayload(frames[4].data), 'A5 21 11 FF 53 FF 00 00');
  assert.deepEqual(decodeFrame(frames[4]).map(field => field.value), [86.13, -2.39, -17.3]);
  assert.deepEqual(decodeFrame(frames[5]).map(field => field.value), [100, 0]);
  assert.throws(() => decodeFrame({ ...frames[4], dlc: 7 }), /DLC/);
  assert.throws(() => decodeFrame({ ...frames[4], id: 1 }), /Unknown/);
  assert.throws(() => encodeFrame(1, 0, values), /Unknown/);
});

test('diagnostics change CAN and CPU by their processing cost without changing driving or reference', () => {
  const withBurst = run(scenarios[0]).session.samples;
  const baseline = run(scenarios[0], { diagnostics: false }).session.samples;
  const workloadFields = new Set(['cpu_demand_ms', 'ecu_cpu_sim_pct', 'can_frames_in_step', 'can_frames_per_s']);
  withBurst.forEach((sample, index) => {
    const plain = baseline[index];
    for (const key of Object.keys(sample)) {
      if (!workloadFields.has(key)) assert.equal(sample[key], plain[key]);
    }
    const inBurst = sample.sim_time_ms > 12000 && sample.sim_time_ms <= 17000;
    assert.equal(sample.can_frames_in_step - plain.can_frames_in_step, inBurst ? 5 : 0);
    assert.equal(sample.ecu_cpu_sim_pct - plain.ecu_cpu_sim_pct, inBurst ? 50 : 0);
  });
  assert.equal(withBurst[0].can_frames_per_s, 20);
  assert.equal(withBurst[1].cpu_demand_ms, 16);
  assert.equal(withBurst[120].can_frames_per_s, 30);
  assert.equal(withBurst[129].can_frames_per_s, 75);
});

test('signals and indices stay in bounds; changing heuristic weights leaves reference intact', () => {
  for (const scenario of scenarios) {
    const { session } = run(scenario);
    const alternate = run(scenario, { demandModel: { ...DEMAND, weights: { ...DEMAND.weights, hazard: 0 } } }).session;
    let previous = session.initial;
    session.samples.forEach((row, index) => {
      for (const field of ['brake_pct', 'throttle_pct', 'driver_demand_index', 'synthetic_reference_index', 'ecu_cpu_sim_pct']) {
        assert.ok(row[field] >= 0 && row[field] <= 100);
      }
      assert.ok(row.speed_kmh >= 0 && row.speed_kmh <= 180);
      assert.ok(Math.abs(row.steer_deg) <= 85);
      assert.equal(row.long_accel_mps2, (row.speed_kmh - previous.speed_kmh) / (3.6 * 0.1));
      assert.equal(row.synthetic_reference_index, alternate.samples[index].synthetic_reference_index);
      previous = row;
    });
    if (scenario.id === 'sudden-hazard') {
      const active = session.samples.filter(row => row.hazard_active);
      assert.ok(Math.max(...active.map(row => row.driver_demand_index)) > 60);
      assert.ok(Math.max(...active.map(row => row.synthetic_reference_index)) > 80);
      assert.notEqual(active[10].driver_demand_index, alternate.samples[129].driver_demand_index);
    }
  }
});

test('CSV has fixed headers, correct escaping and no t=0 row', () => {
  assert.equal(csvCell('one,"two"\nthree'), '"one,""two""\nthree"');
  const { csv } = run(scenarios[2]);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], CSV_FIELDS.join(','));
  assert.equal(lines[1].split(',')[3], '100');
  assert.equal(lines.at(-1).split(',')[3], '34000');
  assert.equal(lines[120].split(',').at(-1), 'obstacle');
});
