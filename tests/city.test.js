import test from 'node:test';
import assert from 'node:assert/strict';
import { cityContext, cityDriverCue, cityTrafficAt, signalPhase } from '../src/sim/city.js';
import { scenarios } from '../src/sim/scenarios.js';
import { createSession } from '../src/sim/session.js';

const scenario = scenarios.find(item => item.id === 'city-intersections');

test('signal transitions and crossing traffic are driven by the same city clock', () => {
  for (const junction of scenario.junctions) {
    assert.equal(signalPhase(junction, junction.amber - 1), 'green');
    assert.equal(signalPhase(junction, junction.amber), 'amber');
    assert.equal(signalPhase(junction, junction.red), 'red');
    assert.equal(signalPhase(junction, junction.green), 'green');
    assert.equal(cityTrafficAt(scenario, junction.amber, 0).filter(car => car.crossing).length, 0);
    const traffic = cityTrafficAt(scenario, junction.red + 3200, 0).filter(car => car.crossing);
    assert.ok(traffic.length >= 2);
    assert.ok(traffic.some(car => car.heading > 0) && traffic.some(car => car.heading < 0));
    assert.equal(cityTrafficAt(scenario, junction.green, 0).filter(car => car.crossing).length, 0);
  }
});

test('the ego car waits behind both stop lines and crosses after green for multiple seeds', () => {
  for (const seed of [0, 42, 2026, 2 ** 32 - 1]) {
    const session = createSession(scenario, { seed });
    while (!session.complete) session.step();
    for (const junction of scenario.junctions) {
      const waiting = session.samples.find(row => row.sim_time_ms === junction.green - 300);
      assert.equal(waiting.speed_kmh, 0);
      assert.ok(waiting.distance_m + 2.24 < junction.distance - 7.3);
      assert.ok(junction.distance - waiting.distance_m < 14);
      assert.equal(cityContext(scenario, waiting).name, junction.name);
      assert.equal(cityDriverCue(cityContext(scenario, waiting), waiting).state, 'Waiting at red');
      const crossed = session.samples.find(row => row.distance_m >= junction.distance);
      assert.ok(crossed.sim_time_ms > junction.green);
      assert.equal(signalPhase(junction, crossed.sim_time_ms), 'green');
      assert.equal(crossed.hazard_active, 0);
    }
    assert.equal(session.samples.length, 440);
    assert.equal(cityContext(scenario, session.current), null);
  }
});
