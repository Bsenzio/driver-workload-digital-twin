import { createSensorSuite, healthFeatures, SENSORS } from '../sim/sensors.js';
import { trainClassifiers } from './models.js';
import { createSession } from '../sim/session.js';
import { scenarios } from '../sim/scenarios.js';

export const HEALTH_LABELS = ['healthy', 'noise', 'delay', 'dropout'];
export const HEALTH_FIELDS = ['error_rms', 'age_mean', 'fresh_fraction', 'missing_fraction'];

export function generateHealthDataset() {
  const rows = [];

  for (const mode of HEALTH_LABELS) {
    for (let episode = 0; episode < 14; episode++) {
      const sensor = SENSORS[episode % SENSORS.length];
      const scene = scenarios[episode % scenarios.length];
      const drive = createSession(scene, { seed: 1000 + episode * 7919 });
      for (let skip = 0; skip < (episode % 4) * 40; skip++) drive.step();
      const suite = createSensorSuite({
        seed: 1000 + episode * 7919, target: sensor.id, mode,
        delayMs: 200 + (episode % 4) * 100, loss: 0.25 + (episode % 4) * 0.1, noise: 7 + episode % 6,
      });
      for (let step = 1; step <= 100; step++) {
        const sample = drive.step();
        suite.step(sample, scene);
        if (step >= 40 && step % 20 === 0) rows.push({
          episode_id: mode + '-' + episode, split: episode < 10 ? 'train' : 'test',
          sensor_id: sensor.id, fault_label: mode, sim_time_ms: sample.sim_time_ms,
          ...healthFeatures(suite.windows[sensor.id]),
        });
      }
    }
  }
  return rows;
}

export function trainHealthModels(rows = generateHealthDataset()) {
  return trainClassifiers(rows, HEALTH_FIELDS, { labels: HEALTH_LABELS, labelField: 'fault_label' });
}

export function healthDatasetCsv(rows) {
  const fields = ['episode_id', 'split', 'sensor_id', 'fault_label', 'sim_time_ms', ...HEALTH_FIELDS];
  return fields.join(',') + '\r\n' + rows.map(row => fields.map(field => row[field]).join(',')).join('\r\n') + '\r\n';
}
