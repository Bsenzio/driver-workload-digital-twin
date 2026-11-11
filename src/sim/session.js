import { referenceAt } from './scenarios.js';
import { initialSignals, nextSignals, seededRandom } from './signals.js';
import { CAN, SENSOR_CAN, emitFrames, encodeFrame } from './can.js';
import { driverDemand } from './demand.js';
import { ecuUtilization } from './cpu.js';
import { createSensorSuite } from './sensors.js';

export const STEP_MS = 100;
export const SCHEMA_VERSION = '1';
export const DEFAULT_SEED = 42;

export function createSession(scenario, { seed = DEFAULT_SEED, demandModel, diagnostics = true, sensorConfig } = {}) {
  const random = seededRandom(seed);
  const sensors = sensorConfig ? createSensorSuite({ seed, ...sensorConfig }) : null;
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
  if (sensors) sensors.step(initial, scenario);

  return {
    scenario, initial, samples, recentFrames, sensors, sensorConfig,
    get current() { return current; },
    get complete() { return current.sim_time_ms >= scenario.duration; },
    canWindowCounts() {
      const counts = new Map(CAN.map(message => [message.id, 0]));
      for (const frame of rateWindow) if (counts.has(frame.id)) counts.set(frame.id, counts.get(frame.id) + 1);
      return Object.fromEntries(CAN.map(message => [message.key, counts.get(message.id)]));
    },
    step() {
      if (this.complete) return current;
      const start = current.sim_time_ms;
      const end = start + STEP_MS;
      const events = scenario.events.filter(event => end >= event.start && end < event.end).map(event => event.id);
      const signals = nextSignals(scenario, current, end, STEP_MS, random, events);
      const burst = diagnostics && scenario.events.some(event => event.id === 'diagnostic-burst' && start >= event.start && start < event.end);
      const sensorStep = sensors?.step({ ...signals, sim_time_ms: end }, scenario);
      const sensorValue = (id, field, fallback) => sensors?.readings[id]?.values[field] ?? fallback;
      const transported = sensors ? {
        ...signals,
        speed_kmh: sensorValue('wheels', 'front_left_kmh', signals.speed_kmh),
        long_accel_mps2: sensorValue('imu', 'long_accel_mps2', signals.long_accel_mps2),
        steer_deg: sensorValue('steering', 'steer_deg', signals.steer_deg),
        throttle_pct: sensorValue('pedals', 'throttle_pct', signals.throttle_pct),
        brake_pct: sensorValue('pedals', 'brake_pct', signals.brake_pct),
      } : signals;
      const emitted = emitFrames(start, end, transported, burst, counter);
      if (sensorStep) {
        const requires = { 288: ['wheels', 'imu', 'steering'], 289: ['pedals'] };
        emitted.frames = emitted.frames.filter(frame => {
          if (!(requires[frame.id] ?? []).every(id => sensors.readings[id])) {
            const message = CAN.find(item => item.id === frame.id);
            emitted.counts[message.key]--;
            return false;
          }
          return true;
        });
        const extra = sensorStep.delivered.flatMap(packet => {
          const message = SENSOR_CAN.find(item => item.sensorId === packet.sensorId);
          return message ? [{ ...encodeFrame(message.id, end, packet.values), sourceTimeMs: packet.sampledAt }] : [];
        });
        emitted.frames.push(...extra);
        emitted.frames.sort((a, b) => a.timeMs - b.timeMs || a.id - b.id);
        emitted.counts.sensor = extra.length;
      }
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
