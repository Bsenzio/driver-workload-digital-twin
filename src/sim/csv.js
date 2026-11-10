export const CSV_FIELDS = [
  'schema_version', 'scenario_id', 'seed', 'sim_time_ms', 'speed_kmh', 'long_accel_mps2',
  'steer_deg', 'throttle_pct', 'brake_pct', 'hazard_active', 'jerk_mps3', 'steer_rate_deg_s',
  'driver_demand_index', 'synthetic_reference_index', 'cpu_demand_ms', 'ecu_cpu_sim_pct',
  'can_frames_in_step', 'can_frames_per_s', 'event_ids',
];

const decimalFields = new Set(CSV_FIELDS.slice(4, 14).filter(field => field !== 'hazard_active'));
decimalFields.add('can_frames_per_s');

export function csvCell(value) {
  const string = String(value ?? '');
  return /[",\r\n]/.test(string) ? '"' + string.replaceAll('"', '""') + '"' : string;
}

export function telemetryCsv(samples) {
  const rows = samples.map(sample => CSV_FIELDS.map(field => {
    const value = sample[field];
    return csvCell(decimalFields.has(field) && typeof value === 'number' ? value.toFixed(3) : value);
  }).join(','));
  return [CSV_FIELDS.join(','), ...rows].join('\r\n') + '\r\n';
}
