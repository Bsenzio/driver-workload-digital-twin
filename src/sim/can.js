import { clamp } from './signals.js';

export const CAN = [
  { id: 0x120, key: 'motion', name: 'Vehicle motion', period: 100, dlc: 8, fields: [
    { key: 'speed_kmh', label: 'Speed', offset: 0, type: 'Uint16', scale: 0.01, unit: 'km/h' },
    { key: 'long_accel_mps2', label: 'Accel', offset: 2, type: 'Int16', scale: 0.01, unit: 'm/s²' },
    { key: 'steer_deg', label: 'Steer', offset: 4, type: 'Int16', scale: 0.1, unit: '°' },
  ] },
  { id: 0x121, key: 'pedal', name: 'Pedals', period: 100, dlc: 2, fields: [
    { key: 'throttle_pct', label: 'Throttle', offset: 0, type: 'Uint8', scale: 1, unit: '%', max: 100 },
    { key: 'brake_pct', label: 'Brake', offset: 1, type: 'Uint8', scale: 1, unit: '%', max: 100 },
  ] },
  { id: 0x122, key: 'hazard', name: 'Hazard status', period: 200, dlc: 1, fields: [
    { key: 'hazard_active', label: 'Hazard', offset: 0, type: 'Uint8', scale: 1, mask: 1, max: 1 },
  ] },
  { id: 0x7a0, key: 'diagnostic', name: 'Synthetic diagnostics', period: 20, dlc: 8, fields: [
    { key: 'counter', label: 'Counter', offset: 0, type: 'Uint8', scale: 1 },
  ] },
];

export const SENSOR_CAN = [
  { id: 0x123, sensorId: 'pressure', name: 'Brake pressure', dlc: 2, fields: [
    { key: 'pressure_bar', label: 'Pressure', offset: 0, type: 'Uint16', scale: 0.01, unit: 'bar' },
  ] },
  { id: 0x124, sensorId: 'radar', name: 'Radar perception', dlc: 5, fields: [
    { key: 'range_m', label: 'Range', offset: 0, type: 'Uint16', scale: 0.01, unit: 'm' },
    { key: 'relative_mps', label: 'Relative speed', offset: 2, type: 'Int16', scale: 0.01, unit: 'm/s' },
    { key: 'target_count', label: 'Targets', offset: 4, type: 'Uint8', scale: 1 },
  ] },
  { id: 0x125, sensorId: 'camera', name: 'Camera perception', dlc: 3, fields: [
    { key: 'range_m', label: 'Range', offset: 0, type: 'Uint16', scale: 0.01, unit: 'm' },
    { key: 'target_count', label: 'Targets', offset: 2, type: 'Uint8', scale: 1 },
  ] },
  { id: 0x126, sensorId: 'wheels', name: 'Wheel speeds', dlc: 8, fields: [
    { key: 'front_left_kmh', label: 'FL', offset: 0, type: 'Uint16', scale: 0.01, unit: 'km/h' },
    { key: 'front_right_kmh', label: 'FR', offset: 2, type: 'Uint16', scale: 0.01, unit: 'km/h' },
    { key: 'rear_left_kmh', label: 'RL', offset: 4, type: 'Uint16', scale: 0.01, unit: 'km/h' },
    { key: 'rear_right_kmh', label: 'RR', offset: 6, type: 'Uint16', scale: 0.01, unit: 'km/h' },
  ] },
  { id: 0x127, sensorId: 'imu', name: 'Inertial signals', dlc: 6, fields: [
    { key: 'long_accel_mps2', label: 'Long. acceleration', offset: 0, type: 'Int16', scale: 0.01, unit: 'm/s²' },
    { key: 'lateral_accel_mps2', label: 'Lateral acceleration', offset: 2, type: 'Int16', scale: 0.01, unit: 'm/s²' },
    { key: 'yaw_rate_deg_s', label: 'Yaw rate', offset: 4, type: 'Int16', scale: 0.01, unit: '°/s' },
  ] },
];
export const ALL_CAN = [...CAN, ...SENSOR_CAN];

const integerRanges = { Uint8: [0, 255], Uint16: [0, 65535], Int16: [-32768, 32767] };
const byId = new Map(ALL_CAN.map(message => [message.id, message]));

export function encodeFrame(id, timeMs, values) {
  const message = byId.get(id);
  if (!message) throw new RangeError('Unknown CAN ID');
  const data = new Uint8Array(message.dlc);
  const view = new DataView(data.buffer);
  for (const field of message.fields) {
    const [min, max] = integerRanges[field.type];
    const raw = clamp(Math.round(values[field.key] / field.scale), min, field.max ?? max);
    view['set' + field.type](field.offset, raw, true);
  }
  return { id, timeMs, dlc: message.dlc, data };
}

export function decodeFrame({ id, dlc, data }) {
  const message = byId.get(id);
  if (!message) throw new RangeError('Unknown CAN ID');
  if (dlc !== message.dlc || data?.length !== dlc) throw new RangeError('Invalid CAN DLC');
  const view = new DataView(data.buffer, data.byteOffset, dlc);
  return message.fields.map(field => {
    const raw = view['get' + field.type](field.offset, true);
    const value = field.mask === undefined ? raw : raw & field.mask;
    return { ...field, value: Number((value * field.scale).toFixed(2)) };
  });
}

export function emitFrames(start, end, values, diagnosticsActive, counter) {
  const frames = [];
  const counts = { motion: 0, pedal: 0, hazard: 0, diagnostic: 0 };
  for (const message of CAN) {
    const diagnostic = message.key === 'diagnostic';
    if (diagnostic && !diagnosticsActive) continue;
    const first = (Math.floor(start / message.period) + 1) * message.period;
    for (let time = first; time <= end; time += message.period) {
      frames.push(encodeFrame(message.id, time, diagnostic ? { counter: counter++ % 256 } : values));
      counts[message.key]++;
    }
  }
  frames.sort((a, b) => a.timeMs - b.timeMs || a.id - b.id);
  return { frames, counts, counter };
}

export const hexId = id => '0x' + id.toString(16).toUpperCase();
export const hexPayload = data => Array.from(data, value => value.toString(16).padStart(2, '0').toUpperCase()).join(' ');
