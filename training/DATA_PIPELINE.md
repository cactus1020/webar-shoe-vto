# Foot-data and size-model pipeline

## Principle

Public data can pretrain visual understanding. Only consented, calibrated local
captures with independent physical measurements can train or validate the size
recommendation layer.

## Dataset register

Start from `datasets/public-sources.json`. Before importing a dataset, record:

- source URL and release version;
- license/terms and whether commercial training is allowed;
- data fields, demographics, capture setup, and known bias;
- owner approval and download date.

Do not scrape product images or use brand assets without permission.

## Capture protocol for own data

For each consenting subject, capture left and right feet separately:

1. Top-down photo with the included 100 mm print reference beside the foot.
2. Medial 45-degree photo with the same reference visible.
3. Lateral 45-degree photo with the same reference visible.
4. Record length and forefoot width from an independent 3D scan, Brannock device,
   or calliper. Do not use the model's own estimate as ground truth.

Exclude face, name, payment cards, and other personal information. Keep a
consent record and a deletion path for raw images.

## Annotation and splitting

Annotate records using `annotations/foot-measurement-schema.v1.json`. Never
randomly split frames: all records from one `subject_id` must stay in one split.

```powershell
python training/split_by_subject.py training/annotations/records.json --output-dir training/splits
```

## Training stages

1. Pretrain foot detection, landmarks, and masks using approved public data.
2. Fine-tune all visual heads with local marker-visible captures.
3. Train the metric measurement head only against independent measured ground truth.
4. Validate on unseen people and devices before exposing size recommendations.

For a first pilot, target at least 200 people. Scale to 1,000+ people across
devices, lighting, foot shapes, and sizes before treating recommendations as a
customer-facing fit signal.

## Shoe-size chart contract

For every SKU, each size needs verified `innerLengthMm` and
`forefootWidthMm`. EU/US/UK labels or external sole length alone are invalid.
`src/sizing/SizeRecommendationEngine.js` rejects a chart without those fields.
