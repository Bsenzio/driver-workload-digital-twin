import { clamp } from './signals.js';

export const DEMAND = {
  weights: { brake: 0.30, jerk: 0.20, steerRate: 0.15, acceleration: 0.10, hazard: 0.25 },
  limits: { brake: 100, jerk: 8, steerRate: 120, acceleration: 6 },
  smoothing: 0.30,
};

export function driverDemand(signals, previous, model = DEMAND) {
  const { weights, limits, smoothing } = model;
  const factor = (value, threshold) => clamp(Math.abs(value) / threshold, 0, 1);
  const raw = 100 * (
    weights.brake * factor(signals.brake_pct, limits.brake) +
    weights.jerk * factor(signals.jerk_mps3, limits.jerk) +
    weights.steerRate * factor(signals.steer_rate_deg_s, limits.steerRate) +
    weights.acceleration * factor(signals.long_accel_mps2, limits.acceleration) +
    weights.hazard * signals.hazard_active
  );
  return clamp(previous === undefined ? raw : smoothing * raw + (1 - smoothing) * previous, 0, 100);
}
