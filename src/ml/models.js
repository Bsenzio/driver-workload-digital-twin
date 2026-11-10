import { SOURCES } from './data.js';

const classes = SOURCES.map(source => source.id);
const classIndex = label => classes.indexOf(label);
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const strongest = scores => scores.indexOf(Math.max(...scores));

function votes(rows) {
  const counts = Array(classes.length).fill(0);
  for (const row of rows) counts[row.label]++;
  return counts;
}

function nearestNeighbors(train) {
  return vector => {
    const nearest = train.map(row => ({
      label: row.label,
      distance: row.vector.reduce((sum, value, feature) => sum + (value - vector[feature]) ** 2, 0),
    })).sort((a, b) => a.distance - b.distance).slice(0, 7);
    return strongest(votes(nearest));
  };
}

function naiveBayes(train) {
  const stats = classes.map((_, label) => {
    const rows = train.filter(row => row.label === label);
    return {
      prior: Math.log(rows.length / train.length),
      features: rows[0].vector.map((_, feature) => {
        const values = rows.map(row => row.vector[feature]);
        const mean = average(values);
        const variance = Math.max(0.025, average(values.map(value => (value - mean) ** 2)));
        return { mean, variance };
      }),
    };
  });
  return vector => strongest(stats.map(({ prior, features }) =>
    features.reduce((score, { mean, variance }, feature) =>
      score - 0.5 * (Math.log(variance) + (vector[feature] - mean) ** 2 / variance), prior)));
}

function impurity(counts, total) {
  return 1 - counts.reduce((sum, count) => sum + (count / total) ** 2, 0);
}

function decisionTree(train) {
  function grow(rows, depth) {
    const counts = votes(rows);
    const label = strongest(counts);
    if (depth === 6 || rows.length < 8 || counts[label] === rows.length) return () => label;
    let best;
    for (let feature = 0; feature < rows[0].vector.length; feature++) {
      const ordered = [...rows].sort((a, b) => a.vector[feature] - b.vector[feature]);
      const left = counts.map(() => 0);
      const right = [...counts];
      for (let i = 0; i < ordered.length - 1; i++) {
        const row = ordered[i];
        left[row.label]++;
        right[row.label]--;
        const a = row.vector[feature];
        const b = ordered[i + 1].vector[feature];
        const count = i + 1;
        const remaining = rows.length - count;
        if (a === b || count < 4 || remaining < 4) continue;
        const loss = (count * impurity(left, count) + remaining * impurity(right, remaining)) / rows.length;
        if (!best || loss < best.loss) best = { feature, threshold: (a + b) / 2, loss };
      }
    }
    if (!best || best.loss >= impurity(counts, rows.length)) return () => label;
    const { feature, threshold } = best;
    const low = grow(rows.filter(row => row.vector[feature] <= threshold), depth + 1);
    const high = grow(rows.filter(row => row.vector[feature] > threshold), depth + 1);
    return vector => (vector[feature] <= threshold ? low : high)(vector);
  }
  return grow(train, 0);
}

const algorithms = [
  { id: 'tree', name: 'Decision tree', description: 'Learned threshold rules', fit: decisionTree },
  { id: 'bayes', name: 'Gaussian naive Bayes', description: 'Per-class signal distributions', fit: naiveBayes },
  { id: 'knn', name: '7-nearest neighbors', description: 'Votes from similar training windows', fit: nearestNeighbors },
];

export function trainClassifiers(rows, fields) {
  const train = rows.filter(row => row.split === 'train');
  const test = rows.filter(row => row.split === 'test');
  const scalers = fields.map(field => {
    const values = train.map(row => row[field]);
    const mean = average(values);
    const scale = Math.sqrt(average(values.map(value => (value - mean) ** 2))) || 1;
    return { mean, scale };
  });
  const vector = row => fields.map((field, index) => (row[field] - scalers[index].mean) / scalers[index].scale);
  const training = train.map(row => ({ label: classIndex(row.scripted_source), vector: vector(row) }));
  return algorithms.map(({ fit, ...metadata }) => {
    const classify = fit(training);
    const confusion = classes.map(() => classes.map(() => 0));
    for (const row of test) confusion[classIndex(row.scripted_source)][classify(vector(row))]++;
    const accuracy = confusion.reduce((sum, counts, index) => sum + counts[index], 0) / test.length;
    const balanced = average(confusion.map((counts, index) => counts[index] / counts.reduce((a, b) => a + b, 0)));
    return { ...metadata, accuracy, balanced, confusion, predict: row => classes[classify(vector(row))] };
  });
}
