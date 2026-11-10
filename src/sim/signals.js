import { interpolate } from './scenarios.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function initialSignals(scenario) {
  return {
    speed_kmh: scenario.initialSpeed, long_accel_mps2: 0, steer_deg: 0,
    throttle_pct: scenario.initialSpeed > 0 ? 14 : 0, brake_pct: 0,
    hazard_active: 0, jerk_mps3: 0, steer_rate_deg_s: 0, distance_m: 0,
  };
}

export function nextSignals(scenario, previous, timeMs, stepMs, random, events) {
  const dt = stepMs / 1000;
  const time = timeMs / 1000;
  const requested = interpolate(scenario.acceleration, time);
  const perturbation = (random() - 0.5) * (requested || previous.speed_kmh ? 0.1 : 0);
  const speed = clamp(previous.speed_kmh + (requested + perturbation) * dt * 3.6, 0, 180);
  const accel = (speed - previous.speed_kmh) / (3.6 * dt);
  const steer = clamp(interpolate(scenario.steering, time) + (random() - 0.5) * 0.36, -85, 85);
  return {
    speed_kmh: speed, long_accel_mps2: accel, steer_deg: steer,
    throttle_pct: accel < -0.2 ? 0 : clamp((speed > 0 ? 14 : 0) + accel * 29, 0, 100),
    brake_pct: requested < -0.2 ? clamp(-requested * 13, 0, 100) : 0,
    hazard_active: Number(events.includes('obstacle')),
    jerk_mps3: (accel - previous.long_accel_mps2) / dt,
    steer_rate_deg_s: (steer - previous.steer_deg) / dt,
    distance_m: previous.distance_m + (speed + previous.speed_kmh) * dt / 7.2,
  };
}
