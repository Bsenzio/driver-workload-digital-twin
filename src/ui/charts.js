const SVG = 'http://www.w3.org/2000/svg';
const W = 410;
const H = 109;
const bounds = { left: 36, top: 8, right: 396, bottom: 84 };

function element(tag, attributes, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export const chartGroups = [
  [
    { title: 'Speed', unit: 'km/h', max: 140, lines: [{ field: 'speed_kmh', color: 'cyan' }] },
    { title: 'Brake', unit: '%', max: 100, lines: [{ field: 'brake_pct', color: 'amber' }] },
  ],
  [
    { title: 'Demand & reference', unit: '0–100', max: 100, lines: [
      { field: 'driver_demand_index', color: 'mint' }, { field: 'synthetic_reference_index', color: 'muted', dashed: true },
    ] },
  ],
  [
    { title: 'ECU utilization', unit: '%', max: 100, lines: [{ field: 'ecu_cpu_sim_pct', color: 'violet' }] },
    { title: 'CAN activity', unit: 'frames/s', max: 80, lines: [{ field: 'can_frames_per_s', color: 'cyan' }] },
  ],
];

export function createChart(config, host) {
  const title = document.createElement('h3');
  title.className = 'plot-title';
  title.textContent = config.title;
  const unit = document.createElement('span');
  unit.textContent = config.unit;
  title.append(unit);
  const svg = element('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': true });
  host.append(title, svg);
  const cursor = element('line', { class: 'cursor', y1: bounds.top, y2: bounds.bottom });
  const lines = config.lines.map(series => element('path', {
    class: 'trace ' + series.color, 'stroke-dasharray': series.dashed ? '5 4' : 'none',
  }));
  let x;
  const y = value => bounds.bottom - value / config.max * (bounds.bottom - bounds.top);

  function reset(scenario) {
    x = time => bounds.left + time / scenario.duration * (bounds.right - bounds.left);
    svg.replaceChildren();
    for (const tick of [0, config.max / 2, config.max]) {
      svg.append(element('line', { class: 'gridline', x1: bounds.left, x2: bounds.right, y1: y(tick), y2: y(tick) }));
      svg.append(element('text', { x: 28, y: y(tick) + 3, 'text-anchor': 'end' }, tick));
    }
    for (const fraction of [0, 0.5, 1]) {
      const time = scenario.duration * fraction;
      svg.append(element('text', { x: x(time), y: 103, 'text-anchor': 'middle' }, time / 1000 + 's'));
    }
    for (const event of scenario.events) {
      const marker = element('line', { class: 'event-line', x1: x(event.start), x2: x(event.start), y1: 8, y2: 84 });
      marker.append(element('title', {}, event.label + ' · ' + event.start / 1000 + ' s'));
      svg.append(marker);
    }
    svg.append(...lines, cursor);
  }

  function draw(session) {
    const current = session.current;
    const history = [session.initial, ...session.samples];
    lines.forEach((path, index) => {
      const field = config.lines[index].field;
      const points = history.filter(sample => sample[field] !== null);
      const command = points.map((sample, i) =>
        (i ? 'L' : 'M') + x(sample.sim_time_ms).toFixed(1) + ',' + y(sample[field]).toFixed(1)).join(' ');
      path.setAttribute('d', command);
    });
    cursor.setAttribute('x1', x(current.sim_time_ms));
    cursor.setAttribute('x2', x(current.sim_time_ms));
  }
  return { reset, draw };
}
