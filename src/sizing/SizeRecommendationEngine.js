/**
 * Converts a calibrated foot measurement into a product-specific recommendation.
 *
 * The caller must supply verified INTERNAL shoe measurements. It intentionally
 * refuses to recommend from only an EU/US label or an external shoe length.
 */
export class SizeRecommendationEngine {
  constructor({ minToeAllowanceMm = 10, minWidthAllowanceMm = 2 } = {}) {
    this.minToeAllowanceMm = minToeAllowanceMm;
    this.minWidthAllowanceMm = minWidthAllowanceMm;
  }

  recommend(measurement, sizeChart) {
    if (!measurement || !Number.isFinite(measurement.lengthMm) || !Number.isFinite(measurement.widthMm) || measurement.lengthMm <= 0 || measurement.widthMm <= 0) {
      return { status: 'unavailable', reason: 'calibration_required' };
    }
    if (measurement.quality === 'review') {
      return { status: 'unavailable', reason: 'measurement_review_required' };
    }
    if (!Array.isArray(sizeChart) || sizeChart.length === 0) {
      return { status: 'unavailable', reason: 'verified_size_chart_required' };
    }

    const eligibleSizes = sizeChart
      .filter((size) => Number.isFinite(size.innerLengthMm) && Number.isFinite(size.forefootWidthMm))
      .map((size) => ({
        ...size,
        lengthClearanceMm: size.innerLengthMm - measurement.lengthMm,
        widthClearanceMm: size.forefootWidthMm - measurement.widthMm
      }))
      .filter((size) => (
        size.lengthClearanceMm >= this.minToeAllowanceMm &&
        size.widthClearanceMm >= this.minWidthAllowanceMm
      ))
      .sort((a, b) => (
        a.lengthClearanceMm - b.lengthClearanceMm ||
        a.widthClearanceMm - b.widthClearanceMm
      ));

    if (eligibleSizes.length === 0) {
      return { status: 'unavailable', reason: 'no_matching_verified_size' };
    }

    const recommended = eligibleSizes[0];
    return {
      status: 'recommended',
      size: recommended.size,
      lengthClearanceMm: Math.round(recommended.lengthClearanceMm),
      widthClearanceMm: Math.round(recommended.widthClearanceMm),
      source: 'verified_internal_dimensions'
    };
  }
}
