import { interpolate } from './scenarios.js';

const traffic = {
  'vehicle-cut-in': [
    { id: 'merging', label: 'Vehicle merging from the left', start: 4000, end: 38001,
      lane: -1, lanePath: [[4, -1], [8, -1], [10.5, 0], [38, 0]],
      gap: [[4, -18], [8, -3], [10.5, 9], [14, 16], [22, 24], [38, 36]], color: '#e3aa65' },
    { id: 'distant', label: 'Distant lead vehicle', start: 0, end: 38001, lane: 0,
      gap: [[0, 74], [10, 80], [20, 100], [38, 125]], color: '#a9b6cb' },
  ],
  'highway-cruise': [
    { id: 'pass', label: 'Vehicle passing on the left', start: 4_000, end: 24_000, lane: -1,
      gap: [[4, -25], [10, -8], [14, 8], [24, 46]], color: '#d1a052' },
  ],
  'urban-stop-and-go': [
    { id: 'queue', label: 'Lead vehicle in queue', start: 0, end: 40_001, lane: 0,
      gap: [[0, 16], [8, 12], [14, 6], [18, 7], [24, 26], [30, 13], [36, 7], [40, 7]], color: '#ad7ac0' },
    { id: 'oncoming', label: 'Oncoming traffic', start: 16_000, end: 24_000, lane: -1, oncoming: true,
      gap: [[16, 78], [21, 16], [24, -29]], color: '#b7c5cf' },
  ],
  'sudden-hazard': [
    { id: 'adjacent', label: 'Adjacent vehicle approaches', start: 5_000, end: 20_000, lane: -1,
      gap: [[5, -22], [10, -8], [12, 0], [15, 22], [20, 58]], color: '#e2a662' },
  ],
};

export function trafficAt(scenarioId, timeMs) {
  return (traffic[scenarioId] ?? [])
    .filter(actor => timeMs >= actor.start && timeMs < actor.end)
    .map(actor => ({ ...actor, lane: actor.lanePath ? interpolate(actor.lanePath, timeMs / 1000) : actor.lane,
      gapM: interpolate(actor.gap, timeMs / 1000) }));
}

export function driverCue(sample, actors) {
  const nearest = actors.reduce((closest, actor) =>
    !closest || Math.abs(actor.gapM) < Math.abs(closest.gapM) ? actor : closest, null);
  if (sample.hazard_active || sample.brake_pct >= 38) {
    return { state: 'Braking response', reason: sample.hazard_active ? 'Scripted obstacle ahead' : 'Brake command above 38%',
      look: 0, lean: 0.12, tone: 'alert' };
  }
  if (sample.event_ids.includes('recovery')) {
    return { state: 'Resuming cruise', reason: 'Scripted recovery phase', look: 0, lean: 0, tone: 'normal' };
  }
  if (Math.abs(sample.steer_deg) >= 20) {
    return { state: 'Turning', reason: 'Steering angle above 20° in magnitude', look: 0.32 * Math.sign(sample.steer_deg), lean: 0.03, tone: 'watch' };
  }
  if (nearest && Math.abs(nearest.gapM) <= 18) {
    return { state: 'Monitoring traffic', reason: 'Scripted vehicle within 18 m', look: nearest.lane * 0.27, lean: 0.04, tone: 'watch' };
  }
  return { state: 'Routine driving', reason: 'No nearby scripted traffic cue', look: 0, lean: 0, tone: 'normal' };
}
