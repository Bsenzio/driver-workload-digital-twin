import { interpolate } from './scenarios.js';

export function signalPhase(junction, timeMs) {
  if (timeMs >= junction.red && timeMs < junction.green) return 'red';
  if (timeMs >= junction.amber && timeMs < junction.red) return 'amber';
  return 'green';
}

const oncoming = [
  { id: 'market-oncoming', color: '#9ebfdf', path: [[0, 115], [5.5, 80], [14.5, 80], [19, 45], [25, -15]] },
  { id: 'civic-oncoming', color: '#d3a876', path: [[16, 260], [27.2, 186], [36.5, 186], [43, 128], [44, 116]] },
];
const crossing = [
  { delay: 0, duration: 4.1, east: true, color: '#d1a052' },
  { delay: 0.9, duration: 4.5, east: false, color: '#ad7ac0' },
  { delay: 2.9, duration: 4.4, east: true, color: '#72b4a5' },
  { delay: 4.2, duration: 4.0, east: false, color: '#bf776c' },
];

export function cityTrafficAt(scenario, timeMs, distance) {
  const time = timeMs / 1000;
  const vehicles = oncoming.filter(vehicle => time >= vehicle.path[0][0] && time <= vehicle.path.at(-1)[0])
    .map(vehicle => ({ ...vehicle, x: -2.6, z: -interpolate(vehicle.path, time), heading: Math.PI }));
  vehicles.push({ id: 'city-follower', color: '#7488a3', x: 2.6, z: 17 - distance, heading: 0 });
  scenario.junctions.forEach((junction, index) => {
    if (signalPhase(junction, timeMs) !== 'red') return;
    for (const [carIndex, car] of crossing.entries()) {
      const progress = (time - junction.red / 1000 - car.delay) / car.duration;
      if (progress < 0 || progress >= 1) continue;
      const sign = car.east ? 1 : -1;
      vehicles.push({
        id: 'cross-' + index + '-' + carIndex, color: car.color, crossing: true,
        x: sign * (-47 + progress * 94), z: -junction.distance + sign * 2.6,
        heading: -sign * Math.PI / 2,
      });
    }
  });
  return vehicles;
}

export function cityContext(scenario, sample) {
  if (!scenario.junctions) return null;
  const junction = scenario.junctions.find(item => sample.distance_m <= item.distance + 8);
  if (!junction) return null;
  const phase = signalPhase(junction, sample.sim_time_ms);
  const gap = junction.distance - sample.distance_m;
  const crossingCount = cityTrafficAt(scenario, sample.sim_time_ms, sample.distance_m)
    .filter(car => car.crossing && Math.abs(car.x) < 20).length;
  return { name: junction.name, phase, gap, crossingCount };
}

export function cityDriverCue(context, sample) {
  if (!context || context.gap > 30) return null;
  if (context.phase === 'red' && sample.speed_kmh < 0.5) {
    return { state: 'Waiting at red', reason: 'Cross street has the right of way',
      look: context.crossingCount ? -0.34 : 0, lean: 0.035, tone: 'watch' };
  }
  if (context.phase !== 'green') {
    return { state: 'Slowing for signal', reason: context.name + ' · ' + context.phase,
      look: 0, lean: 0.10, tone: 'alert' };
  }
  return { state: 'Checking intersection', reason: context.name + ' · green',
    look: 0.18, lean: 0.035, tone: 'normal' };
}
