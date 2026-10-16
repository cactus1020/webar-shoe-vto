// Charts stay scoped to the selected product; provenance is supplied by the importer.
export class ProductChartStore {
  constructor() { this.charts = new Map(); }

  importChart(document, productId) {
    if (!document || document.productId !== productId) {
      throw new Error('Chart-এর productId নির্বাচিত জুতার সঙ্গে মিলতে হবে।');
    }
    if (document.verified !== true || typeof document.source !== 'string' || !document.source.trim()) {
      throw new Error('যাচাই করা chart ও তার source দিতে হবে।');
    }
    if (!Array.isArray(document.sizes) || !document.sizes.length) {
      throw new Error('Chart-এ অন্তত একটি size থাকতে হবে।');
    }
    const labels = new Set();
    const sizes = document.sizes.map((row) => {
      if (typeof row.size !== 'string' || !row.size.trim() || labels.has(row.size.trim()) ||
          !Number.isFinite(row.innerLengthMm) || row.innerLengthMm <= 0 || row.innerLengthMm > 500 ||
          !Number.isFinite(row.forefootWidthMm) || row.forefootWidthMm <= 0 || row.forefootWidthMm > 250) {
        throw new Error('Size label আলাদা হতে হবে এবং ভেতরের দৈর্ঘ্য/প্রস্থ mm-এ দিতে হবে।');
      }
      labels.add(row.size.trim());
      return { size: row.size.trim(), innerLengthMm: row.innerLengthMm, forefootWidthMm: row.forefootWidthMm };
    });
    const chart = { productId, source: document.source.trim(), sizes };
    this.charts.set(productId, chart);
    return chart;
  }

  get(productId) { return this.charts.get(productId) || null; }
}
