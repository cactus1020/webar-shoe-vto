import { CalibrationManager } from './src/sizing/CalibrationManager.js';
import { SizeRecommendationEngine } from './src/sizing/SizeRecommendationEngine.js';
import { ProductChartStore } from './src/sizing/ProductChartStore.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const calibration = new CalibrationManager({ referenceLengthMm: 100 });
calibration.start();
[
  [0, 0], [200, 0],       // 100 mm reference
  [50, 100], [50, 620],   // 260 mm foot length
  [0, 360], [192, 360]    // 96 mm foot width
].forEach(([x, y]) => calibration.addPoint(x, y));

const measurement = calibration.getDisplayData();
assert(measurement.lengthMm === 260, 'Expected 260 mm foot length');
assert(measurement.widthMm === 96, 'Expected 96 mm foot width');
assert(measurement.quality === 'good', 'Expected good calibration quality');

const sizing = new SizeRecommendationEngine();
const recommendation = sizing.recommend(measurement, [
  { size: 'EU 41', innerLengthMm: 269, forefootWidthMm: 99 },
  { size: 'EU 42', innerLengthMm: 276, forefootWidthMm: 102 }
]);
assert(recommendation.status === 'recommended', 'Expected a size recommendation');
assert(recommendation.size === 'EU 42', 'Expected EU 42 because EU 41 lacks toe allowance');

const unverified = sizing.recommend(measurement, []);
assert(unverified.reason === 'verified_size_chart_required', 'Expected verified chart requirement');

assert(sizing.recommend({ ...measurement, quality: 'review' }, [{ size: '42', innerLengthMm: 276, forefootWidthMm: 102 }]).reason === 'measurement_review_required', 'Low-resolution measurement should require recapture');
assert(sizing.recommend({ lengthMm: -1, widthMm: 96 }, []).reason === 'calibration_required', 'Negative dimensions must be rejected');
calibration.undo();
assert(calibration.getDisplayData() === null, 'Undo must invalidate previous measurement');
calibration.addPoint(192, 360);
assert(calibration.getDisplayData().lengthMm === 260, 'Corrected point should recompute measurement');
const charts = new ProductChartStore();
const chart = { productId: 'shoe-a', verified: true, source: 'Measured sample', sizes: [{ size: '42', innerLengthMm: 276, forefootWidthMm: 102 }] };
charts.importChart(chart, 'shoe-a');
assert(charts.get('shoe-b') === null, 'Charts must not leak across products');
for (const invalid of [
  { ...chart, verified: false },
  { ...chart, productId: 'shoe-b' },
  { ...chart, source: '' },
  { ...chart, sizes: [...chart.sizes, ...chart.sizes] },
  { ...chart, sizes: [{ size: '42', innerLengthMm: '276', forefootWidthMm: 102 }] }
]) {
  let rejected = false;
  try { charts.importChart(invalid, 'shoe-a'); } catch { rejected = true; }
  assert(rejected, 'Invalid/unverified chart must be rejected');
}
console.log('Sizing calibration, chart isolation and validation tests passed.');
