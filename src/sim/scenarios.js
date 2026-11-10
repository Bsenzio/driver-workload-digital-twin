const event = (id, label, start, end) => ({ id, label, start, end });

const cityJunctions = [
  { name: 'Market Street', distance: 70, amber: 4500, red: 5500, green: 14500 },
  { name: 'Civic Avenue', distance: 176, amber: 26200, red: 27200, green: 36500 },
];

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
  {
    id: 'city-intersections', name: 'City Intersections', duration: 44_000, initialSpeed: 32.4,
    description: 'Stop at Market Street and Civic Avenue while cross traffic moves through two signalized intersections.',
    junctions: cityJunctions,
    acceleration: [[0, 0], [4.5, 0], [5.5, -2.8], [8.5, -2.8], [9.5, -0.45], [14.5, -0.45], [15, 0],
      [15.7, 2.15], [19.4, 2.15], [20.4, 0], [26.2, 0], [27.2, -2.9], [29.7, -2.9],
      [30.7, -0.45], [36.5, -0.45], [37, 0], [37.7, 2], [41.3, 2], [42.3, 0], [44, 0]],
    steering: [[0, 0], [7, 1], [16, 0], [24, -1.1], [33, 0], [44, 0]],
    events: cityJunctions.flatMap((junction, index) => [
      event('city-amber-' + index, junction.name + ' · amber', junction.amber, junction.red),
      event('city-red-' + index, junction.name + ' · red', junction.red, junction.green),
      event('city-green-' + index, junction.name + ' · green', junction.green, junction.green + 4200),
    ]),
    reference: [[0, 10], [4, 13], [6.5, 41], [9, 26], [13, 22], [15, 28], [20, 14],
      [26, 17], [28, 43], [31, 26], [35, 23], [37, 29], [42, 13], [44, 10]],
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
