import { referenceAt } from './scenarios.js';
import { initialSignals, nextSignals, seededRandom } from './signals.js';
import { CAN, emitFrames } from './can.js';
import { driverDemand } from './demand.js';
import { ecuUtilization } from './cpu.js';

export const STEP_MS = 100;
export const SCHEMA_VERSION = '1';
export const DEFAULT_SEED = 42;

export function createSession(scenario, { seed = DEFAULT_SEED, demandModel, diagnostics = true } = {}) {
  const random = seededRandom(seed);
  const metadata = { schema_version: SCHEMA_VERSION, scenario_id: scenario.id, seed: seed >>> 0 };
  const signals = initialSignals(scenario);
  const initial = {
    ...metadata, sim_time_ms: 0, ...signals, driver_demand_index: driverDemand(signals, undefined, demandModel),
    synthetic_reference_index: referenceAt(scenario, 0), cpu_demand_ms: null, ecu_cpu_sim_pct: null,
    can_frames_in_step: 0, can_frames_per_s: 0, event_ids: '',
  };
  const samples = [];
  const recentFrames = [];
  const rateWindow = [];
  let counter = 0;
  let current = initial;

  return {
    scenario, initial, samples, recentFrames,
    get current() { return current; },
    get complete() { return current.sim_time_ms >= scenario.duration; },
    canWindowCounts() {
      const counts = new Map(CAN.map(message => [message.id, 0]));
      for (const frame of rateWindow) counts.set(frame.id, counts.get(frame.id) + 1);
      return Object.fromEntries(CAN.map(message => [message.key, counts.get(message.id)]));
    },
    step() {
      if (this.complete) return current;
      const start = current.sim_time_ms;
      const end = start + STEP_MS;
      const events = scenario.events.filter(event => end >= event.start && end < event.end).map(event => event.id);
      const signals = nextSignals(scenario, current, end, STEP_MS, random, events);
      const burst = diagnostics && scenario.events.some(event => event.id === 'diagnostic-burst' && start >= event.start && start < event.end);
      const emitted = emitFrames(start, end, signals, burst, counter);
      counter = emitted.counter;
      recentFrames.push(...emitted.frames);
      if (recentFrames.length > 100) recentFrames.splice(0, recentFrames.length - 100);
      rateWindow.push(...emitted.frames);
      while (rateWindow.length && rateWindow[0].timeMs <= end - 1000) rateWindow.shift();
      current = {
        ...metadata, sim_time_ms: end, ...signals,
        driver_demand_index: driverDemand(signals, samples.length ? current.driver_demand_index : undefined, demandModel),
        synthetic_reference_index: referenceAt(scenario, end), ...ecuUtilization(emitted.counts, STEP_MS),
        can_frames_in_step: emitted.frames.length,
        can_frames_per_s: rateWindow.length * 1000 / Math.min(end, 1000),
        event_ids: events.join('|'),
      };
      samples.push(current);
      return current;
    },
  };
}
