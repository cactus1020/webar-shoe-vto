/**
 * CalibrationManager
 *
 * A guided, manual fallback for collecting metric foot data before a trained
 * marker/landmark model is available. All six points must be selected on the
 * same physical plane: a printed 100 mm reference line beside the bare foot.
 *
 * It deliberately returns a measurement, not a shoe size. A size can only be
 * recommended after it is compared against a SKU's verified internal chart.
 */
const STEPS = [
  {
    id: 'reference-start',
    instruction: 'প্রিন্ট করা 100 mm রেফারেন্স লাইনের প্রথম প্রান্তে ট্যাপ করুন।'
  },
  {
    id: 'reference-end',
    instruction: 'একই 100 mm রেফারেন্স লাইনের অন্য প্রান্তে ট্যাপ করুন।'
  },
  {
    id: 'heel',
    instruction: 'পায়ের গোড়ালির সবচেয়ে পেছনের বিন্দুতে ট্যাপ করুন।'
  },
  {
    id: 'toe',
    instruction: 'সবচেয়ে লম্বা আঙুলের ডগায় ট্যাপ করুন।'
  },
  {
    id: 'width-left',
    instruction: 'পায়ের সবচেয়ে চওড়া অংশের এক পাশে ট্যাপ করুন।'
  },
  {
    id: 'width-right',
    instruction: 'একই চওড়া অংশের বিপরীত পাশে ট্যাপ করুন।'
  }
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class CalibrationManager {
  constructor({ referenceLengthMm = 100 } = {}) {
    this.referenceLengthMm = referenceLengthMm;
    this.reset();
  }

  reset() {
    this.status = 'idle';
    this.points = [];
    this.measurement = null;
    this.error = null;
  }

  start() {
    this.reset();
    this.status = 'collecting';
    return this.getState();
  }

  cancel() {
    this.reset();
    return this.getState();
  }

  isCollecting() {
    return this.status === 'collecting';
  }

  addPoint(x, y) {
    if (!this.isCollecting()) return this.getState();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return this.getState();

    this.points.push({ x, y });
    if (this.points.length === STEPS.length) {
      this._calculateMeasurement();
    }
    return this.getState();
  }

  undo() {
    if (!this.points.length) return this.getState();
    this.points.pop();
    this.measurement = null;
    this.error = null;
    this.status = 'collecting';
    return this.getState();
  }

  getState() {
    const step = this.isCollecting() ? STEPS[this.points.length] : null;
    return {
      status: this.status,
      pointCount: this.points.length,
      points: this.points.map(point => ({ ...point })),
      totalPoints: STEPS.length,
      instruction: step ? step.instruction : this._completionInstruction(),
      measurement: this.measurement,
      error: this.error
    };
  }

  getDisplayData() {
    if (!this.measurement) return null;
    return {
      lengthMm: this.measurement.lengthMm,
      widthMm: this.measurement.widthMm,
      quality: this.measurement.quality
    };
  }

  _completionInstruction() {
    if (this.status === 'complete') {
      return 'মাপ নেওয়া শেষ। জুতার verified insole chart যোগ হলে size recommendation পাওয়া যাবে।';
    }
    return '100 mm রেফারেন্স mat ব্যবহার করে পায়ের মাপ নিন।';
  }

  _calculateMeasurement() {
    const [referenceStart, referenceEnd, heel, toe, widthLeft, widthRight] = this.points;
    const referencePixels = distance(referenceStart, referenceEnd);
    const footLengthPixels = distance(heel, toe);
    const footWidthPixels = distance(widthLeft, widthRight);

    if (referencePixels < 80 || footLengthPixels < 100 || footWidthPixels < 25) {
      this.status = 'error';
      this.error = 'ছবি খুব দূর থেকে তোলা হয়েছে বা point ঠিক হয়নি। সমতলভাবে আবার মাপুন।';
      return;
    }

    const mmPerPixel = this.referenceLengthMm / referencePixels;
    const lengthMm = footLengthPixels * mmPerPixel;
    const widthMm = footWidthPixels * mmPerPixel;

    if (lengthMm < 180 || lengthMm > 340 || widthMm < 60 || widthMm > 150) {
      this.status = 'error';
      this.error = 'মাপটি মানব-পায়ের স্বাভাবিক সীমার বাইরে। রেফারেন্স line ও foot points আবার দিন।';
      return;
    }

    const sizeScore = Math.min(1, (referencePixels - 80) / 180);
    const framingScore = Math.min(1, (footLengthPixels - 100) / 220);
    const qualityScore = Math.round((sizeScore * 0.55 + framingScore * 0.45) * 100);

    this.measurement = {
      lengthMm: Math.round(lengthMm),
      widthMm: Math.round(widthMm),
      mmPerPixel,
      referencePixels,
      footLengthPixels,
      footWidthPixels,
      quality: qualityScore >= 75 ? 'good' : 'review',
      qualityScore
    };
    this.status = 'complete';
  }
}

export const CALIBRATION_STEPS = STEPS;
