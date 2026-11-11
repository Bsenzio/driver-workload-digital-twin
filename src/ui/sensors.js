import { FAULTS, SENSORS, healthFeatures, readingStatus } from '../sim/sensors.js';
import { csvCell } from '../sim/csv.js';
import { generateHealthDataset, healthDatasetCsv, trainHealthModels } from '../ml/sensor-health.js';
import { downloadCsv } from './download.js';

const sensorName = id => SENSORS.find(sensor => sensor.id === id).name;
const healthName = id => ({ healthy: 'Healthy', noise: 'Noisy signal', delay: 'Delayed signal', dropout: 'Sample loss' })[id];
const faultName = id => FAULTS.find(fault => fault.id === id)?.name ?? id;
const positions = { radar: [50, 10], camera: [50, 33], steering: [25, 45], imu: [66, 54],
  pedals: [25, 62], pressure: [75, 24], wheels: [77, 81] };

export function sensorCsv(session, selected) {
  const sensor = SENSORS.find(item => item.id === selected);
  const fields = ['sim_time_ms', 'scenario_id', 'seed', 'fault_target', 'fault_mode', 'sensor_id', 'signal', 'unit',
    'truth', 'healthy_baseline', 'measured', 'sample_time_ms', 'age_ms', 'quality'];
  const rows = session.sensors.history.flatMap(snapshot => sensor.fields.map(([key, , unit]) => {
    const reading = snapshot.readings[selected];
    const values = [
      snapshot.time, session.scenario.id, session.initial.seed, session.sensorConfig.target, session.sensorConfig.mode,
      selected, key, unit, snapshot.truth[selected][key], snapshot.baseline[selected]?.values[key] ?? '',
      reading?.values[key] ?? '', reading?.sampledAt ?? '', reading ? snapshot.time - reading.sampledAt : '',
      readingStatus(sensor, reading, snapshot.time),
    ];
    return values.map(value => csvCell(typeof value === 'number' ? Number(value.toFixed(4)) : value)).join(',');
  }));
  return fields.join(',') + '\r\n' + rows.join('\r\n') + '\r\n';
}

export function mountSensors(host, getSession, reset) {
  host.innerHTML = `
    <header class="panel-head"><div><span class="eyebrow">SENSOR INSTRUMENTATION</span><h2 id="sensors-title">Inside the signal chain</h2></div>
      <label class="sensor-toggle"><input id="sensor-overlay" type="checkbox" checked> Show 3D sensors</label></header>
    <p class="lab-intro">Select a sensor on the vehicle to inspect its simulated value, measured output and sample age. Apply one controlled fault and replay the same drive to compare it with the healthy baseline.</p>
    <div class="sensor-controls">
      <label class="select-label">Inspect sensor<select id="sensor-selected">${SENSORS.map(sensor => '<option value="' + sensor.id + '">' + sensor.name + '</option>').join('')}</select></label>
      <label class="select-label">Fault target<select id="sensor-target">${SENSORS.map(sensor => '<option value="' + sensor.id + '">' + sensor.name + '</option>').join('')}</select></label>
      <label class="select-label">Fault injection<select id="sensor-mode">${FAULTS.map(fault => '<option value="' + fault.id + '">' + fault.name + '</option>').join('')}</select></label>
      <button id="sensor-apply" type="button" class="primary">Apply &amp; restart</button>
      <button id="sensor-export" type="button" disabled>Export selected sensor CSV</button>
    </div>
    <p id="sensor-config" class="lab-status" role="status"></p>
    <div class="sensor-grid">
      <div class="sensor-visual">
        <div class="sensor-map" aria-label="Sensor positions on a schematic vehicle">
          <svg viewBox="0 0 180 260" aria-hidden="true">
            <path d="M49 28Q90 12 131 28L144 84V206Q90 238 36 206V84Z" fill="#245a67" stroke="#8abac2" stroke-width="2"/>
            <path d="m53 72 74 0-10-32H63zm0 11-6 77h86l-6-77z" fill="#182c3a" stroke="#678391"/>
            <path d="M24 69h16v40H24zm116 0h16v40h-16zM24 166h16v40H24zm116 0h16v40h-16z" fill="#222b35" stroke="#8395a4"/>
            <path d="M44 182h92" stroke="#ff978c" stroke-width="3"/>
            <path d="m90 5-6 10h12z" fill="#b5c8d6"/>
          </svg>
          ${SENSORS.map(sensor => '<button type="button" class="sensor-hotspot" data-sensor="' + sensor.id +
            '" style="left:' + positions[sensor.id][0] + '%;top:' + positions[sensor.id][1] + '%" aria-label="' + sensor.name +
            '" aria-pressed="false">' + ({ wheels: 'WHEELS', steering: 'STEER', pressure: 'BRAKE', camera: 'CAM', radar: 'RADAR', imu: 'IMU', pedals: 'PEDALS' })[sensor.id] + '</button>').join('')}
        </div>
        <div class="sensor-fov"><h3>Geometric field of view</h3><svg id="sensor-fov" viewBox="0 0 260 260" role="img" aria-label="Simulated sensor field of view and target positions"></svg><p id="sensor-detection"></p></div>
      </div>
      <section class="sensor-detail" aria-labelledby="sensor-name">
        <div class="sensor-heading"><h3 id="sensor-name"></h3><span id="sensor-quality"></span></div>
        <p id="sensor-info"></p>
        <div class="sensor-table-scroll" tabindex="0" role="region" aria-label="Sensor values"><table><thead><tr><th scope="col">Signal</th><th scope="col">Truth</th><th scope="col">Healthy</th><th scope="col">Measured</th></tr></thead><tbody id="sensor-values"></tbody></table></div>
        <div class="sensor-legend"><span>Solid · measured</span><span>Dashed · paired healthy baseline</span><span>Dotted · simulated truth</span></div>
        <p id="sensor-trace-title"></p>
        <svg id="sensor-trace" viewBox="0 0 530 135" role="img" aria-label="Sensor history comparing measured, healthy baseline and simulated truth"></svg>
        <p class="lab-note">Schematic locations and kinematic signals. Camera and radar use geometric visibility. Healthy and degraded streams share the same drive and baseline noise seed.</p>
      </section>
    </div>
    <section class="sensor-health"><div class="sensor-heading"><h3>Signal quality classifiers</h3><button id="sensor-training" type="button">Download quality training CSV</button></div>
      <p>Three models classify a 2 s window as healthy, noisy, delayed or losing samples. Training and evaluation use separate replay episodes. Residual features use the simulator's known truth.</p>
      <div id="sensor-models" class="lab-models"></div>
    </section>
  `;
  const el = id => host.querySelector('#' + id);
  const rows = generateHealthDataset();
  const models = trainHealthModels(rows);
  let selected = 'radar';
  let applied = { target: 'radar', mode: 'healthy' };
  let lastVersion;
  el('sensor-selected').value = selected;
  el('sensor-target').value = selected;
  el('sensor-models').innerHTML = models.map(model => '<article class="lab-model"><h4>' + model.name +
    '</h4><p>Held-out balanced accuracy · ' + (model.balanced * 100).toFixed(1) +
    '%</p><div class="lab-prediction"><span>LIVE WINDOW PREDICTION</span><strong data-health="' + model.id + '">Collecting 2 s…</strong></div></article>').join('');

  function select(id) {
    selected = id;
    el('sensor-selected').value = id;
    lastVersion = undefined;
    update();
  }

  function trace(session, sensor) {
    const history = session.sensors.history.slice(-100);
    const field = sensor.fields[0][0];
    const values = history.flatMap(item => [item.truth[selected][field], item.readings[selected]?.values[field], item.baseline[selected]?.values[field]])
      .filter(value => value !== undefined);
    let low = values.length ? Math.min(...values) : 0;
    let high = values.length ? Math.max(...values) : 1;
    const padding = Math.max((high - low) * 0.15, sensor.fields[0][5] || 0.1);
    low -= padding;
    high += padding;
    const end = Math.max(10000, session.current.sim_time_ms);
    const x = time => 44 + (time - (end - 10000)) / 10000 * 472;
    const y = value => 105 - (value - low) / (high - low) * 90;
    const series = [
      { color: '#b3c4d2', dash: '2 4', value: item => item.truth[selected][field] },
      { color: '#d5bc82', dash: '6 4', value: item => item.baseline[selected]?.values[field] },
      { color: '#85e8cd', dash: '', value: item => item.readings[selected]?.values[field] },
    ];
    el('sensor-trace').innerHTML = '<text x="5" y="15">' + high.toFixed(1) +
      '</text><text x="5" y="106">' + low.toFixed(1) + '</text><text x="44" y="128">' +
      Math.max(0, (end - 10000) / 1000).toFixed(1) + ' s</text><text x="480" y="128">' + (end / 1000).toFixed(1) + ' s</text>' +
      series.map(series => '<path fill="none" stroke="' + series.color + '" stroke-width="2" stroke-dasharray="' + series.dash +
        '" d="' + history.filter(item => series.value(item) !== undefined).map((item, index) =>
        (index ? 'L' : 'M') + x(item.time).toFixed(1) + ',' + y(series.value(item)).toFixed(1)).join(' ') + '"/>').join('');
  }

  function fieldOfView(session, sensor) {
    const perception = sensor.range ? sensor : SENSORS.find(item => item.id === 'radar');
    const range = perception.range;
    const a = perception.halfAngle * Math.PI / 180;
    const scale = 1.7;
    const dx = Math.sin(a) * range * scale;
    const dy = Math.cos(a) * range * scale;
    const targets = session.sensors.latest?.detected[perception.id] ?? [];
    el('sensor-fov').innerHTML = '<path d="M20 0h220v260H20z" fill="#19232e"/><path d="M130 0v260" stroke="#526678" stroke-dasharray="6 8"/>' +
      '<path d="M130 230L' + (130 - dx) + ' ' + (230 - dy) + 'A' + range * scale + ' ' + range * scale +
      ' 0 0 1 ' + (130 + dx) + ' ' + (230 - dy) + 'Z" fill="#367d7760" stroke="#7de2c1"/>' +
      targets.map(target => '<rect x="' + (130 + target.x * scale - 5) + '" y="' + (230 - target.ahead * scale - 7) +
        '" width="10" height="14" rx="2" fill="#efb66d"><title>' + target.id + '</title></rect>').join('') +
      '<rect x="122" y="220" width="16" height="25" rx="4" fill="#80cad3"/><text x="12" y="18">' +
      perception.name + ' · ' + range + ' m</text>';
    el('sensor-detection').textContent = targets.length + ' geometric targets · ±' + perception.halfAngle + '° · forward range ' + range + ' m';
  }

  function update() {
    const session = getSession();
    if (!session?.sensors || lastVersion === session.current) return;
    lastVersion = session.current;
    const suite = session.sensors;
    const sensor = SENSORS.find(item => item.id === selected);
    const reading = suite.readings[selected];
    const baseline = suite.baseline[selected];
    const time = session.current.sim_time_ms;
    el('sensor-config').textContent = 'Applied · ' + faultName(applied.mode) + ' · ' + sensorName(applied.target) + ' · changing controls requires Apply & restart';
    for (const button of host.querySelectorAll('[data-sensor]')) button.setAttribute('aria-pressed', String(button.dataset.sensor === selected));
    el('sensor-name').textContent = sensor.name;
    el('sensor-quality').textContent = readingStatus(sensor, reading, time);
    el('sensor-quality').dataset.stale = String(!reading || time - reading.sampledAt >= sensor.period * 2);
    el('sensor-info').textContent = (1000 / sensor.period) + ' Hz · CAN ' + sensor.can + ' · sample ' +
      (reading ? reading.sampledAt + ' ms · age ' + (time - reading.sampledAt) + ' ms' : 'pending');
    const format = value => value === undefined ? '—' : value.toFixed(2);
    el('sensor-values').innerHTML = sensor.fields.map(([key, label, unit]) =>
      '<tr><th scope="row">' + label + (unit ? ' (' + unit + ')' : '') + '</th><td>' +
      format(suite.latest.truth[selected][key]) + '</td><td>' + format(baseline?.values[key]) +
      '</td><td>' + format(reading?.values[key]) + '</td></tr>').join('');
    el('sensor-trace-title').textContent = 'History · ' + sensor.fields[0][1] + ' (' + sensor.fields[0][2] + ')';
    trace(session, sensor);
    fieldOfView(session, sensor);
    const window = suite.windows[selected];
    for (const model of models) {
      const prediction = window.length < 20 ? 'Collecting 2 s…' : healthName(model.predict(healthFeatures(window)));
      host.querySelector('[data-health="' + model.id + '"]').textContent = prediction;
    }
    el('sensor-export').disabled = !suite.history.length;
  }

  el('sensor-selected').addEventListener('change', event => select(event.target.value));
  for (const button of host.querySelectorAll('[data-sensor]')) button.addEventListener('click', () => select(button.dataset.sensor));
  el('sensor-apply').addEventListener('click', () => {
    applied = { target: el('sensor-target').value, mode: el('sensor-mode').value };
    selected = applied.target;
    el('sensor-selected').value = selected;
    reset();
  });
  el('sensor-training').addEventListener('click', () => downloadCsv(healthDatasetCsv(rows), 'sensor-quality-training.csv'));
  el('sensor-export').addEventListener('click', () => {
    const session = getSession();
    downloadCsv(sensorCsv(session, selected), session.scenario.id + '_' + selected + '_' + applied.mode + '_sensors.csv');
  });
  return {
    update, select,
    config: () => ({ ...applied }),
    view: () => ({ id: selected, show: el('sensor-overlay').checked, latest: getSession()?.sensors?.latest,
      stale: readingStatus(SENSORS.find(item => item.id === selected), getSession()?.sensors?.readings[selected], getSession()?.current.sim_time_ms) === 'Stale' }),
  };
}
