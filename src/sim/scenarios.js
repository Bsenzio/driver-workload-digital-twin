const event = (id, label, start, end) => ({ id, label, start, end });

export const scenarios = [
  {
    id: 'highway-cruise', name: 'Highway Cruise', duration: 36_000, initialSpeed: 104,
    description: 'Watch the ECU budget jump during diagnostics while the vehicle holds its cruise.',
    acceleration: [[0, 0], [36, 0]],
    steering: [[0, 0], [6, 1.8], [14, -2], [22, 1], [30, -1], [36, 0]],
    events: [event('diagnostic-burst', 'Diagnostic burst', 12_000, 17_000)],
    reference: [[0, 7], [8, 9], [21, 8], [30, 9], [36, 7]],
  },
  {
    id: 'urban-stop-and-go', name: 'Urban Stop-and-Go', duration: 40_000, initialSpeed: 0,
    description: 'Follow two traffic stops and a right turn through changes in braking and steering.',
    acceleration: [[0, 0], [2, 2.25], [6, 2.25], [8, 0], [10, 0], [11, -3.5],
      [14, -3.5], [15, 0], [18, 0], [20, 2], [24, 1.2], [26, 0], [31, 0],
      [32, -3], [35, -3], [36, 0], [40, 0]],
    steering: [[0, 0], [20, 0], [21, 42], [23, 62], [24, 22], [25, 0], [40, 0]],
    events: [event('pull-away', 'Pull away', 1_000, 8_000), event('first-stop', 'First stop', 10_000, 15_000),
      event('right-turn', 'Right turn', 20_000, 25_000), event('second-stop', 'Second stop', 31_000, 36_000)],
    reference: [[0, 5], [3, 23], [8, 14], [10, 13], [12, 58], [15, 24], [17, 8],
      [20, 24], [22, 55], [25, 29], [28, 12], [31, 16], [33, 51], [36, 23], [40, 6]],
  },
  {
    id: 'sudden-hazard', name: 'Sudden Hazard', duration: 34_000, initialSpeed: 82,
    description: 'An obstacle triggers hard braking. Compare the estimated demand with the scripted reference.',
    acceleration: [[0, 0], [11.8, 0], [12.1, -7.6], [14.1, -7.6], [15, -1.8], [16, 0],
      [20, 0], [22, 1.8], [28, 1.8], [30, 0], [34, 0]],
    steering: [[0, 0], [11.9, 0], [12.3, -34], [13, 16], [14.5, 5], [16, 0], [34, 0]],
    events: [event('obstacle', 'Obstacle ahead', 12_000, 15_200), event('recovery', 'Recovery', 19_000, 30_000)],
    reference: [[0, 9], [11.7, 9], [12.2, 91], [13.2, 84], [15.6, 64], [18, 35],
      [21, 21], [26, 12], [34, 9]],
  },
];

export function interpolate(points, time) {
  if (time <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index++) {
    const [end, target] = points[index];
    if (time <= end) {
      const [start, initial] = points[index - 1];
      return initial + (target - initial) * (time - start) / (end - start);
    }
  }
  return points.at(-1)[1];
}

export function referenceAt(scenario, timeMs) {
  return interpolate(scenario.reference, timeMs / 1000);
}
