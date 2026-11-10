import { scenarios } from '../sim/scenarios.js';
import { seededRandom } from '../sim/signals.js';
import { createSession } from '../sim/session.js';

export const SOURCES = [
  { id: 'baseline', name: 'Routine cadence', short: 'Base' },
  { id: 'motion', name: 'Vehicle motion burst', short: 'Motion' },
  { id: 'pedal', name: 'Pedal message burst', short: 'Pedals' },
  { id: 'hazard', name: 'Hazard status burst', short: 'Hazard' },
  { id: 'diagnostic', name: 'Diagnostics burst', short: 'Diag' },
];

export const FRAME_KEYS = ['motion', 'pedal', 'hazard', 'diagnostic'];
export const GROUPS = [
  { id: 'ids', name: 'Frames by CAN ID', fields: FRAME_KEYS.map(key => key + '_fps') },
  { id: 'rate', name: 'Aggregate frame rate', fields: ['total_fps'] },
  { id: 'signals', name: 'Driving signals', fields: ['speed_kmh', 'brake_pct', 'steer_deg', 'long_accel_mps2', 'hazard_active'] },
];
export const BASELINE = { motion_fps: 10, pedal_fps: 10, hazard_fps: 5, diagnostic_fps: 0 };
const FEATURE_FIELDS = GROUPS.flatMap(group => group.fields);
const COLUMNS = ['episode_id', 'split', 'scenario_id', 'seed', 'sim_time_ms', 'scripted_source', ...FEATURE_FIELDS];
const bounds = {
  motion_fps: [0, 200], pedal_fps: [0, 200], hazard_fps: [0, 200], diagnostic_fps: [0, 200], total_fps: [0, 800],
  speed_kmh: [0, 180], brake_pct: [0, 100], steer_deg: [-85, 85], long_accel_mps2: [-10, 10], hazard_active: [0, 1],
};

export function observedFeatures(session) {
  const features = {};
  const sample = session.current;
  const denominator = Math.min(1, sample.sim_time_ms / 1000) || 1;
  const counts = session.canWindowCounts();
  for (const key of FRAME_KEYS) features[key + '_fps'] = counts[key] / denominator;
  for (const field of GROUPS[2].fields) features[field] = sample[field];
  return addTotal(features);
}

export function addTotal(features) {
  return { ...features, total_fps: FRAME_KEYS.reduce((total, key) => total + features[key + '_fps'], 0) };
}

export function generateDataset(seed = 42) {
  const random = seededRandom(seed);
  const rows = [];
  for (const source of SOURCES) {
    for (let episode = 0; episode < 12; episode++) {
      const split = episode < 8 ? 'train' : 'test';
      const scenario = scenarios[episode % scenarios.length];
      const sessionSeed = Math.floor(random() * 2 ** 32);
      const session = createSession(scenario, { seed: sessionSeed, diagnostics: false });
      const offset = Math.floor(random() * 24);
      const intensity = 7 + Math.floor(random() * 29);
      for (let second = 1; second <= offset + 6; second++) {
        for (let step = 0; step < 10; step++) session.step();
        if (second <= offset) continue;
        const features = observedFeatures(session);
        for (const key of FRAME_KEYS) {
          const extra = source.id === key ? Math.max(1, intensity + Math.floor(random() * 11) - 5)
            : Math.floor(random() * (source.id === 'baseline' ? 4 : 9));
          features[key + '_fps'] += extra;
        }
        rows.push({
          episode_id: source.id + '-' + episode, split, scenario_id: scenario.id,
          seed: sessionSeed, sim_time_ms: session.current.sim_time_ms, scripted_source: source.id,
          ...addTotal(features),
        });
      }
    }
  }
  return rows;
}

export function datasetCsv(rows) {
  return COLUMNS.join(',') + '\r\n' + rows.map(row => COLUMNS.map(field => row[field]).join(',')).join('\r\n') + '\r\n';
}

export function readDatasetCsv(input) {
  const [header, ...lines] = input.trim().split(/\r?\n/);
  if (header !== COLUMNS.join(',')) throw new Error('Use the CAN lab CSV template and keep its column order.');
  if (lines.length < 10 || lines.length > 2400) throw new Error('Use 10–2,400 labeled samples.');
  const episodes = new Map();
  const episodeOrigins = new Map();
  const windows = new Set();
  const coverage = new Set();
  const rows = lines.map((line, index) => {
    const values = line.split(',');
    const [episode, split, scenario, seed, time, label, ...features] = values;
    const fail = () => { throw new Error('Invalid episode, label or value at CSV row ' + (index + 2) + '.'); };
    if (values.length !== COLUMNS.length || !/^[a-zA-Z0-9_-]{1,48}$/.test(episode) ||
        !['train', 'test'].includes(split) || !/^[a-zA-Z0-9_-]{1,48}$/.test(scenario) ||
        !/^\d+$/.test(seed) || +seed >= 2 ** 32 || !/^\d+$/.test(time) || !Number.isSafeInteger(+time) || +time < 1000 || +time % 1000 ||
        !SOURCES.some(source => source.id === label)) fail();
    const signature = [split, scenario, seed, label].join('/');
    if (episodes.has(episode) && episodes.get(episode) !== signature) fail();
    const key = scenario + '/' + Number(seed);
    if (episodeOrigins.has(key) && episodeOrigins.get(key) !== episode) fail();
    episodeOrigins.set(key, episode);
    const window = episode + '/' + time;
    if (windows.has(window)) fail();
    episodes.set(episode, signature);
    windows.add(window);
    coverage.add(split + '/' + label);
    const row = { episode_id: episode, split, scenario_id: scenario, seed: Number(seed),
      sim_time_ms: Number(time), scripted_source: label };
    FEATURE_FIELDS.forEach((field, column) => {
      const raw = features[column];
      const value = Number(raw);
      const [min, max] = bounds[field];
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) ||
          !Number.isFinite(value) || value < min || value > max ||
          (field === 'hazard_active' && !Number.isInteger(value))) fail();
      row[field] = value;
    });
    if (Math.abs(addTotal(row).total_fps - row.total_fps) > 0.001) fail();
    return row;
  });
  if (coverage.size !== 2 * SOURCES.length) throw new Error('Each source must appear in both splits, using separate episodes.');
  return rows;
}
