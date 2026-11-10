import './style.css';
import './extension.css';
import { createVehicleView } from './scene/scene.js';
import { CAN, decodeFrame, hexId, hexPayload } from './sim/can.js';
import { createClock } from './sim/clock.js';
import { telemetryCsv } from './sim/csv.js';
import { scenarios } from './sim/scenarios.js';
import { createSession } from './sim/session.js';
import { chartGroups, createChart } from './ui/charts.js';
import { driverCue, trafficAt } from './sim/traffic.js';
import { cityContext, cityDriverCue } from './sim/city.js';
import { downloadCsv } from './ui/download.js';
import { mountLab } from './ui/lab.js';

const metrics = [
  { id: 'demand', name: 'Driver demand estimate', unit: '/ 100', tag: 'HEURISTIC', accent: 'mint', field: 'driver_demand_index', max: 100 },
  { id: 'reference', name: 'Synthetic reference (unvalidated)', unit: '/ 100', tag: 'SCRIPTED', accent: 'muted', field: 'synthetic_reference_index', max: 100 },
  { id: 'ecu', name: 'Simulated ECU CPU utilization', unit: '%', tag: 'BUDGET MODEL', accent: 'violet', field: 'ecu_cpu_sim_pct', max: 100 },
  { id: 'bus', name: 'CAN frame activity', unit: 'frames/s', tag: '1 S WINDOW', accent: 'cyan', field: 'can_frames_per_s', max: 80 },
];

const app = document.querySelector('#app');
app.innerHTML = `
  <a class="skip" href="#controls">Skip to playback controls</a>
  <header class="masthead">
    <div class="identity"><span class="brand-mark" aria-hidden="true">◈</span><span>WORKLOAD LAB <small>SIMULATION STUDY</small></span></div>
    <span class="badge"><i></i> Synthetic data <b>·</b> Browser simulation</span>
  </header>
  <main>
    <section class="intro" aria-labelledby="title">
      <div class="eyebrow">01 / DRIVING TELEMETRY</div>
      <h1 id="title">Driver Workload <span>Digital Twin</span></h1>
      <p>Replay scripted drives, watch the driver avatar respond to traffic, and experiment with <a href="#classifier-lab">CAN traffic classifiers</a>.</p>
    </section>
    <section class="controls panel" id="controls" aria-label="Playback controls">
      <label class="select-label">Scenario<select id="scenario">${scenarios.map(s => '<option value="' + s.id + '">' + s.name + '</option>').join('')}</select></label>
      <div class="transport">
        <button id="play" type="button" class="primary"><span aria-hidden="true">▶</span> Play</button>
        <button id="pause" type="button" disabled><span aria-hidden="true">Ⅱ</span> Pause</button>
        <button id="reset" type="button"><span aria-hidden="true">↻</span> Reset</button>
      </div>
      <label class="select-label rate-label">Rate<select id="rate"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
      <div class="clock-readout"><span>SIM TIME</span><strong id="time"></strong><small id="seed"></small></div>
      <div class="export"><button id="export" type="button" disabled aria-describedby="export-hint"><span aria-hidden="true">↓</span> Download CSV</button><small id="export-hint">Available after the first step</small></div>
    </section>
    <section class="dashboard" aria-label="Vehicle and live metrics">
      <article class="panel vehicle-panel">
        <header class="panel-head"><div><span class="eyebrow">LIVE VIEW</span><h2>Vehicle playback</h2></div><span class="status" id="play-status" role="status"></span></header>
        <div class="viewport">
          <div id="vehicle" class="vehicle" role="img" aria-label="Follow-camera view of a generic prototype vehicle">
            <img id="scene-fallback" src="${import.meta.env.BASE_URL}models/static-vehicle.svg" alt="">
          </div>
          <div class="scene-top"><span id="model-status" class="model-status" role="status">Loading vehicle…</span><span id="active-event" class="scene-event" role="status" hidden></span></div>
          <div id="city-signal" class="city-signal" hidden>
            <i aria-hidden="true"></i><div><strong id="city-phase"></strong><span id="city-junction"></span></div>
          </div>
          <figure id="cabin-frame" class="cabin-frame">
            <img src="${import.meta.env.BASE_URL}models/static-cabin.svg" alt="">
            <figcaption><span>CABIN CAM</span><small>SIMULATED</small></figcaption>
          </figure>
          <div class="scene-data"><div><strong id="speed"></strong><span>KM/H</span></div><div><strong id="brake"></strong><span>BRAKE %</span></div><div><strong id="steer"></strong><span>STEER °</span></div></div>
        </div>
        <div class="driver-strip"><div><span class="eyebrow">SCRIPTED DRIVER RESPONSE</span><strong id="driver-state"></strong></div>
          <p><span id="driver-reason"></span><span id="traffic-cue"></span></p></div>
        <footer class="scene-footer"><strong id="scenario-title"></strong><span id="scenario-description"></span></footer>
      </article>
      <aside class="metrics panel" aria-labelledby="metrics-title">
        <header class="panel-head"><div><span class="eyebrow">CURRENT STEP</span><h2 id="metrics-title">Telemetry signals</h2></div><span class="subtle">100 ms</span></header>
        <div class="metric-stack">${metrics.map(m => `
          <div class="metric ${m.accent}">
            <div><span class="metric-tag">${m.tag}</span><h3>${m.name}</h3></div>
            <div class="metric-reading"><strong id="${m.id}">—</strong><span>${m.unit}</span></div>
            <div class="meter"><i id="${m.id}-bar"></i></div>
          </div>`).join('')}</div>
      </aside>
    </section>
    <section class="panel timeline" aria-labelledby="timeline-title">
      <header class="panel-head"><div><span class="eyebrow">SYNCHRONIZED HISTORY</span><h2 id="timeline-title">Scenario timeline</h2></div>
        <div class="legend"><span><i></i> Estimate</span><span><i class="dashed"></i> Scripted reference</span><span><i class="dotted"></i> Event start</span></div></header>
      <ul class="event-list" id="event-list" aria-label="Scripted event start times"></ul>
      <div class="plot-grid" id="plots"></div>
    </section>
    <section class="panel can-panel" aria-labelledby="can-title">
      <header class="panel-head"><div><span class="eyebrow">SYNTHETIC CLASSIC CAN</span><h2 id="can-title">Frame inspector</h2></div>
        <label class="select-label">Filter by CAN ID<select id="filter"><option value="">All IDs</option>${CAN.map(m => '<option value="' + m.id + '">' + hexId(m.id) + ' · ' + m.name + '</option>').join('')}</select></label></header>
      <p id="frame-count" class="subtle"></p>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Recent CAN frames">
        <table><thead><tr><th scope="col">Time (ms)</th><th scope="col">ID</th><th scope="col">DLC</th><th scope="col">Payload (hex)</th><th scope="col">Decoded signals</th></tr></thead><tbody id="frames"></tbody></table>
      </div>
    </section>
    <section class="panel classifier-lab" id="classifier-lab" aria-labelledby="lab-title"></section>
    <section class="panel method" aria-labelledby="method-title">
      <header class="panel-head"><div><span class="eyebrow">MODEL NOTES</span><h2 id="method-title">How the numbers are made</h2></div></header>
      <div class="method-grid">
        <article><h3>01 / Driver demand estimate</h3><p>The 0–100 heuristic combines brake (30%), absolute jerk (20%), steering rate (15%), acceleration (10%) and hazard state (25%). Each step blends 30% of the new score with 70% of the previous score.</p></article>
        <article><h3>02 / Scripted reference</h3><p>Independent keyframes define this unvalidated 0–100 curve. The signals and reference share a scenario script. The comparison illustrates timing and shape.</p></article>
        <article><h3>03 / Simulated ECU CPU</h3><p>A 100 ms budget starts with 12 ms of baseline work. Each motion, pedal, hazard and diagnostic frame adds 2, 1, 1 and 10 ms respectively. CAN activity counts frames over simulated time and omits physical bus occupancy.</p></article>
      </div>
    </section>
  </main>
  <footer class="site-footer"><span>Independent portfolio prototype · Synthetic data · No physical vehicle connection or human validation.</span><a href="https://github.com/bsenzio/driver-workload-digital-twin">Source on GitHub ↗</a></footer>
`;

const el = id => document.getElementById(id);
const plots = chartGroups.flatMap(group => {
  const column = document.createElement('div');
  column.className = 'plot-column';
  el('plots').append(column);
  return group.map(config => {
    const host = document.createElement('div');
    host.className = 'plot';
    column.append(host);
    return createChart(config, host);
  });
});

const vehicle = createVehicleView(el('vehicle'), el('cabin-frame'), (label, state) => {
  el('model-status').textContent = label;
  el('model-status').dataset.state = state;
});
const metricNodes = metrics.map(metric => ({ ...metric, value: el(metric.id), bar: el(metric.id + '-bar') }));
let session;
let previous;
let lastTick;
let dirty = true;
const lab = mountLab(el('classifier-lab'), () => session);
const clock = createClock(() => {
  previous = session.current;
  session.step();
  dirty = true;
  return !session.complete;
});

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function controls() {
  const label = session.complete ? 'Complete' : clock.active ? 'Playing' : session.samples.length ? 'Paused' : 'Ready';
  const status = el('play-status');
  status.dataset.state = label.toLowerCase();
  text(status, label);
  el('play').disabled = clock.active || session.complete;
  el('pause').disabled = !clock.active;
  el('export').disabled = session.samples.length === 0;
  text(el('export-hint'), session.samples.length ? session.samples.length + ' samples captured' : 'Available after the first step');
}

function renderFrames() {
  const filter = el('filter').value;
  const visible = session.recentFrames.filter(frame => !filter || frame.id === Number(filter)).sort((a, b) => b.timeMs - a.timeMs || a.id - b.id);
  el('frame-count').textContent = visible.length + ' shown · Latest ' + session.recentFrames.length + ' of up to 100 buffered frames';
  el('frames').innerHTML = visible.length ? visible.map(frame => {
    const fields = decodeFrame(frame).map(field => field.label + ' ' +
      (field.key === 'hazard_active' ? (field.value ? 'active' : 'clear') : field.value + (field.unit ? ' ' + field.unit : '')));
    return '<tr><td>' + frame.timeMs + '</td><td class="frame-id">' + hexId(frame.id) + '</td><td>' + frame.dlc +
      '</td><td class="payload">' + hexPayload(frame.data) + '</td><td>' + fields.join(' · ') + '</td></tr>';
  }).join('') : '<tr><td colspan="5">No matching frames in this session window.</td></tr>';
}

function drawTelemetry() {
  const current = session.current;
  text(el('time'), (current.sim_time_ms / 1000).toFixed(1) + ' / ' + session.scenario.duration / 1000 + ' s');
  text(el('speed'), current.speed_kmh.toFixed(1));
  text(el('brake'), current.brake_pct.toFixed(0));
  text(el('steer'), current.steer_deg.toFixed(1));
  const active = session.scenario.events.filter(event => current.event_ids.split('|').includes(event.id));
  text(el('active-event'), active.map(event => event.label).join(' · '));
  el('active-event').hidden = !active.length;
  const traffic = trafficAt(session.scenario.id, current.sim_time_ms);
  const junction = cityContext(session.scenario, current);
  const cue = cityDriverCue(junction, current) ?? driverCue(current, traffic);
  el('city-signal').hidden = !junction;
  if (junction) {
    el('city-signal').dataset.phase = junction.phase;
    text(el('city-phase'), junction.phase.toUpperCase() + ' SIGNAL');
    text(el('city-junction'), junction.name + ' · ' + (junction.gap > 0 ? Math.round(junction.gap) + ' m ahead' : 'crossing'));
  }
  text(el('driver-state'), cue.state);
  el('driver-state').dataset.tone = cue.tone;
  text(el('driver-reason'), cue.reason);
  const nearest = [...traffic].sort((a, b) => Math.abs(a.gapM) - Math.abs(b.gapM))[0];
  if (session.scenario.junctions) {
    const crossing = junction?.crossingCount ?? 0;
    const crossTraffic = crossing === 1 ? '1 vehicle crossing' : crossing + ' vehicles crossing';
    text(el('traffic-cue'), crossing ? crossTraffic : 'Signalized city corridor');
  } else {
    text(el('traffic-cue'), nearest ? nearest.label + ' · ' + Math.abs(nearest.gapM).toFixed(0) +
      ' m ' + (nearest.gapM < 0 ? 'behind' : 'ahead') : 'No traffic actor in view');
  }
  lab.update();
  for (const metric of metricNodes) {
    const value = current[metric.field];
    text(metric.value, value === null ? '—' : value.toFixed(metric.id === 'ecu' ? 0 : 1));
    metric.bar.style.width = Math.min(100, 100 * (value ?? 0) / metric.max) + '%';
  }
  for (const plot of plots) plot.draw(session);
  renderFrames();
  controls();
}

function reset() {
  clock.reset();
  const scenario = scenarios.find(item => item.id === el('scenario').value);
  session = createSession(scenario);
  const fallback = scenario.junctions ? 'static-city.svg' : 'static-vehicle.svg';
  const asset = import.meta.env.BASE_URL + 'models/' + fallback;
  if (el('scene-fallback').getAttribute('src') !== asset) el('scene-fallback').src = asset;
  previous = session.initial;
  lastTick = undefined;
  el('filter').value = '';
  el('scenario-title').textContent = scenario.name;
  el('scenario-description').textContent = scenario.description;
  el('seed').textContent = 'SEED ' + session.initial.seed;
  el('event-list').innerHTML = scenario.events.map(event =>
    '<li><b>' + (event.start / 1000).toFixed(1) + 's</b> ' + event.label + '</li>').join('');
  vehicle.reset();
  for (const plot of plots) plot.reset(scenario);
  dirty = true;
  drawTelemetry();
}

el('scenario').addEventListener('change', reset);
el('reset').addEventListener('click', reset);
el('play').addEventListener('click', () => { clock.play(); lastTick = undefined; controls(); });
el('pause').addEventListener('click', () => { clock.pause(); controls(); });
el('filter').addEventListener('change', renderFrames);
document.addEventListener('visibilitychange', () => { lastTick = undefined; });
el('export').addEventListener('click', () => {
  downloadCsv(telemetryCsv(session.samples), session.scenario.id + '_seed-' + session.initial.seed + '_telemetry.csv');
});

function tick(now) {
  if (lastTick !== undefined && !document.hidden) clock.advance(now - lastTick, Number(el('rate').value));
  lastTick = document.hidden ? undefined : now;
  if (dirty) {
    drawTelemetry();
    dirty = false;
  }
  vehicle.draw(previous, session.current, session.complete ? 1 : clock.alpha, session.scenario);
  requestAnimationFrame(tick);
}

const requestedScenario = new URLSearchParams(location.search).get('scenario');
if (scenarios.some(scenario => scenario.id === requestedScenario)) el('scenario').value = requestedScenario;
reset();
requestAnimationFrame(tick);
