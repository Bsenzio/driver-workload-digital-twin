import { BASELINE, GROUPS, SOURCES, addTotal, datasetCsv, generateDataset, observedFeatures, readDatasetCsv } from '../ml/data.js';
import { trainClassifiers } from '../ml/models.js';
import { downloadCsv } from './download.js';

const controls = [
  ['motion_fps', 'Motion · 0x120', 0, 200, 1],
  ['pedal_fps', 'Pedals · 0x121', 0, 200, 1],
  ['hazard_fps', 'Hazard · 0x122', 0, 200, 1],
  ['diagnostic_fps', 'Diagnostics · 0x7A0', 0, 200, 1],
  ['speed_kmh', 'Speed · km/h', 0, 180, 0.1],
  ['brake_pct', 'Brake · %', 0, 100, 0.1],
  ['steer_deg', 'Steering · °', -85, 85, 0.1],
  ['long_accel_mps2', 'Acceleration · m/s²', -10, 10, 0.1],
  ['hazard_active', 'Obstacle flag · 0 / 1', 0, 1, 1],
];

const sourceName = id => SOURCES.find(source => source.id === id)?.name ?? 'Unlabeled window';
const percent = score => (100 * score).toFixed(1) + '%';

export function mountLab(host, getSession) {
  host.innerHTML = `
    <header class="panel-head">
      <div><span class="eyebrow">02 / SYNTHETIC ML EXPERIMENT</span><h2 id="lab-title">CAN traffic classifier lab</h2></div>
      <span class="status">Runs in this browser</span>
    </header>
    <p class="lab-intro">Train three classifiers to identify the scripted source of extra frames among the original four CAN IDs (0x120, 0x121, 0x122, 0x7A0). Try removing the CAN IDs to see how much the models can infer from total traffic and driving signals alone.</p>
    <div class="lab-columns">
      <section class="lab-card" aria-labelledby="dataset-title">
        <h3 id="dataset-title">1 · Training data</h3>
        <p>Each CSV row represents one simulated second. Labels come from the burst script. Entire episodes are reserved for testing.</p>
        <div class="lab-actions">
          <button type="button" id="lab-export">Download labeled CSV</button>
          <button type="button" id="lab-default">Restore generated data</button>
        </div>
        <label class="lab-file">Load a labeled lab CSV <input id="lab-import" type="file" accept=".csv,text/csv"></label>
        <fieldset class="lab-features"><legend>Signals available to the models</legend>
          ${GROUPS.map(group => '<label><input type="checkbox" value="' + group.id + '" checked> ' + group.name + '</label>').join('')}
        </fieldset>
        <button class="primary" id="lab-train" type="button">Train &amp; evaluate</button>
        <p class="lab-status" id="lab-status" role="status"></p>
      </section>
      <section class="lab-card" aria-labelledby="probe-title">
        <h3 id="probe-title">2 · Try a signal window</h3>
        <div class="lab-actions">
          <label class="select-label">Scripted preset<select id="lab-preset">
            ${SOURCES.map(source => '<option value="' + source.id + '">' + source.name + '</option>').join('')}
            <option value="">Custom / replay</option></select></label>
          <button type="button" id="lab-replay" disabled>Use current replay window</button>
        </div>
        <div class="lab-inputs">
          ${controls.map(([id, label, min, max, step]) => '<label>' + label + '<input type="number" id="probe-' + id +
            '" min="' + min + '" max="' + max + '" step="' + step + '" inputmode="decimal"></label>').join('')}
        </div>
        <p class="lab-status" id="probe-status"></p>
      </section>
    </div>
    <section class="lab-results" aria-labelledby="results-title">
      <h3 id="results-title">3 · Compare the classifiers</h3>
      <div id="lab-models" class="lab-models"></div>
      <div class="lab-matrix">
        <label class="select-label">Confusion matrix<select id="lab-matrix-select"></select></label>
        <p>Rows are scripted labels and columns are predictions on held-out episodes.</p>
        <div class="lab-table" tabindex="0" role="region" aria-label="Confusion matrix"><table id="lab-confusion"></table></div>
      </div>
    </section>
    <p class="lab-note">The models classify synthetic traffic profiles. Extra frames are injected by the training script. Scores measure performance on this dataset and do not establish a physical fault, ECU load, or a driver's state. Edited or live windows may contain mixtures outside the training profiles.</p>
  `;

  const el = id => host.querySelector('#' + id);
  const generated = readDatasetCsv(datasetCsv(generateDataset()));
  const preset = el('lab-preset');
  const matrixSelect = el('lab-matrix-select');
  const featureChecks = [...host.querySelectorAll('.lab-features input')];
  let dataset = generated;
  let classifiers = [];
  let inputRevision = 0;
  let origin = 'Generated data · seed 42';
  let probeOrigin = 'Scripted preset';

  function confusion() {
    const selected = classifiers.find(model => model.id === matrixSelect.value);
    const headings = SOURCES.map(source => '<th scope="col" title="' + source.name + '">' + source.short + '</th>').join('');
    const rows = selected.confusion.map((row, label) => '<tr><th scope="row">' + SOURCES[label].short + '</th>' +
      row.map((value, prediction) => '<td class="' + (label === prediction ? 'correct-cell' : '') + '">' + value + '</td>').join('') + '</tr>');
    el('lab-confusion').innerHTML = '<caption class="sr-only">' + selected.name +
      ' confusion matrix</caption><thead><tr><th scope="col">Actual ↓ / predicted →</th>' + headings +
      '</tr></thead><tbody>' + rows.join('') + '</tbody>';
  }

  function probe() {
    const inputs = controls.map(([id, , min, max]) => {
      const input = el('probe-' + id);
      const value = input.valueAsNumber;
      return { id, value, valid: Number.isFinite(value) && value >= min && value <= max &&
        (id !== 'hazard_active' || Number.isInteger(value)) };
    });
    if (inputs.some(input => !input.valid)) {
      el('probe-status').textContent = 'Enter values within the displayed ranges to classify this window.';
      for (const node of host.querySelectorAll('[data-prediction]')) node.textContent = '—';
      return;
    }
    const features = addTotal(Object.fromEntries(inputs.map(({ id, value }) => [id, value])));
    el('probe-status').textContent = features.total_fps.toFixed(1) + ' frames/s · ' + probeOrigin +
      (preset.value ? ' · ' + sourceName(preset.value) : '');
    for (const model of classifiers) {
      host.querySelector('[data-prediction="' + model.id + '"]').textContent = sourceName(model.predict(features));
    }
  }

  function setProbe(values) {
    for (const [id] of controls) el('probe-' + id).value = Number(values[id].toFixed(3));
    probe();
  }

  function setPreset() {
    if (!preset.value) {
      probeOrigin = 'Custom window';
      probe();
      return;
    }
    probeOrigin = 'Scripted preset';
    const features = { ...BASELINE, speed_kmh: 72, brake_pct: 4, steer_deg: 0, long_accel_mps2: 0, hazard_active: 0 };
    if (preset.value !== 'baseline') features[preset.value + '_fps'] += 34;
    setProbe(features);
  }

  function train() {
    const chosen = featureChecks.filter(node => node.checked).map(node => node.value);
    if (!chosen.length) {
      el('lab-status').textContent = 'Choose at least one signal group. Existing models are still shown.';
      return;
    }
    const fields = GROUPS.filter(group => chosen.includes(group.id)).flatMap(group => group.fields);
    classifiers = trainClassifiers(dataset, fields);
    const trainCount = dataset.filter(row => row.split === 'train').length;
    el('lab-status').textContent = origin + ' · ' + trainCount + ' training / ' +
      (dataset.length - trainCount) + ' test windows · ' + fields.length + ' features';
    const previous = matrixSelect.value;
    matrixSelect.innerHTML = classifiers.map(model => '<option value="' + model.id + '">' + model.name + '</option>').join('');
    if (previous) matrixSelect.value = previous;
    el('lab-models').innerHTML = classifiers.map(model => `
      <article class="lab-model">
        <h4>${model.name}</h4><p>${model.description}</p>
        <dl><div><dt>Test accuracy</dt><dd>${percent(model.accuracy)}</dd></div>
        <div><dt>Balanced accuracy</dt><dd>${percent(model.balanced)}</dd></div></dl>
        <div class="lab-prediction"><span>WINDOW PREDICTION</span><strong data-prediction="${model.id}"></strong></div>
      </article>`).join('');
    confusion();
    probe();
  }

  el('lab-train').addEventListener('click', train);
  matrixSelect.addEventListener('change', confusion);
  preset.addEventListener('change', setPreset);
  for (const [id] of controls) el('probe-' + id).addEventListener('input', () => {
    preset.value = '';
    probeOrigin = 'Custom window';
    probe();
  });
  el('lab-replay').addEventListener('click', () => {
    const session = getSession();
    preset.value = '';
    probeOrigin = session.scenario.name + ' · ' + (session.current.sim_time_ms / 1000).toFixed(1) + ' s';
    setProbe(observedFeatures(session));
  });
  el('lab-export').addEventListener('click', () => downloadCsv(datasetCsv(dataset), 'can-classifier-training.csv'));
  el('lab-default').addEventListener('click', () => {
    inputRevision++;
    el('lab-import').value = '';
    dataset = generated;
    origin = 'Generated data · seed 42';
    train();
  });
  el('lab-import').addEventListener('change', async () => {
    const file = el('lab-import').files[0];
    const revision = ++inputRevision;
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Choose a lab CSV under 1 MB.');
      const parsed = readDatasetCsv(await file.text());
      if (revision !== inputRevision) return;
      dataset = parsed;
      origin = 'Imported labeled data';
      train();
    } catch (error) {
      if (revision === inputRevision) el('lab-status').textContent = error.message + ' The current dataset is still loaded.';
    }
  });
  preset.value = 'diagnostic';
  setPreset();
  train();
  return { update() { el('lab-replay').disabled = getSession().current.sim_time_ms < 1000; } };
}
