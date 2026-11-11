export const CPU = { base: 12, motion: 2, pedal: 1, hazard: 1, diagnostic: 10, sensor: 3 };

export function ecuUtilization(counts, stepMs) {
  const demand = CPU.base + CPU.motion * counts.motion + CPU.pedal * counts.pedal +
    CPU.hazard * counts.hazard + CPU.diagnostic * counts.diagnostic + CPU.sensor * (counts.sensor ?? 0);
  return { cpu_demand_ms: demand, ecu_cpu_sim_pct: Math.min(100, 100 * demand / stepMs) };
}
