import test from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE, GROUPS, SOURCES, addTotal, datasetCsv, generateDataset, observedFeatures, readDatasetCsv } from '../src/ml/data.js';
import { trainClassifiers } from '../src/ml/models.js';
import { scenarios } from '../src/sim/scenarios.js';
import { createSession } from '../src/sim/session.js';
import { driverCue, trafficAt } from '../src/sim/traffic.js';

const rows = generateDataset();

test('generated training CSV round-trips and keeps complete episodes in one split', () => {
  assert.equal(rows.length, 360);
  assert.deepEqual(readDatasetCsv(datasetCsv(rows)), rows);
  assert.deepEqual(generateDataset(), rows);
  assert.notDeepEqual(generateDataset(17), rows);
  const training = new Set(rows.filter(row => row.split === 'train').map(row => row.episode_id));
  const testing = rows.filter(row => row.split === 'test');
  assert.equal(training.size, 40);
  assert.equal(new Set(testing.map(row => row.episode_id)).size, 20);
  assert.ok(testing.every(row => !training.has(row.episode_id)));
  assert.equal(testing.length, 120);
  assert.throws(() => readDatasetCsv(datasetCsv([...rows, { ...rows[0], split: 'test' }])), /Invalid episode/);
  assert.throws(() => readDatasetCsv(datasetCsv([...rows, { ...rows[0], episode_id: 'renamed', split: 'test' }])), /Invalid episode/);
  assert.throws(() => readDatasetCsv(datasetCsv([{ ...rows[0], total_fps: 0 }, ...rows.slice(1)])), /Invalid episode/);
  assert.throws(() => readDatasetCsv('timestamp,speed\n100,14'), /CAN lab CSV/);
});

test('models learn burst classes from episode holdouts and lose discrimination with total rate only', () => {
  const full = trainClassifiers(rows, GROUPS.flatMap(group => group.fields));
  const aggregate = trainClassifiers(rows, GROUPS.find(group => group.id === 'rate').fields);
  const context = { speed_kmh: 72, brake_pct: 4, steer_deg: 0, long_accel_mps2: 0, hazard_active: 0 };
  full.forEach((model, index) => {
    assert.equal(model.confusion.flat().reduce((sum, count) => sum + count, 0), 120);
    assert.ok(model.balanced > 0.68, model.name);
    assert.ok(model.balanced > aggregate[index].balanced + 0.15, model.name);
    for (const source of SOURCES) {
      const probe = { ...context, ...BASELINE };
      if (source.id !== 'baseline') probe[source.id + '_fps'] += 34;
      assert.equal(model.predict(addTotal(probe)), source.id, model.name);
    }
  });
});

test('live classifier features measure the same one-second CAN window as replay', () => {
  const session = createSession(scenarios[0]);
  for (let step = 0; step < 135; step++) session.step();
  const features = observedFeatures(session);
  assert.equal(features.total_fps, session.current.can_frames_per_s);
  assert.equal(features.diagnostic_fps, 50);
  assert.equal(features.hazard_fps, 5);
  assert.equal(features.brake_pct, session.current.brake_pct);
});

test('cab display responds to traffic, steering and hazard cues on the simulated clock', () => {
  const highway = trafficAt('highway-cruise', 10000);
  assert.equal(highway[0].gapM, -8);
  assert.equal(trafficAt('highway-cruise', 14000)[0].gapM, 8);
  assert.deepEqual(trafficAt('highway-cruise', 24000), []);
  const sample = { hazard_active: 0, brake_pct: 0, steer_deg: 0, event_ids: '' };
  assert.equal(driverCue(sample, highway).state, 'Monitoring traffic');
  assert.equal(driverCue({ ...sample, steer_deg: 45 }, highway).state, 'Turning');
  assert.equal(driverCue({ ...sample, hazard_active: 1 }, highway).state, 'Braking response');
  assert.equal(driverCue({ ...sample, event_ids: 'recovery' }, []).state, 'Resuming cruise');
  assert.equal(driverCue(sample, []).state, 'Routine driving');
});
