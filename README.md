# WebAR Shoe Virtual Try-On

Client-side WebAR shoe virtual try-on prototype built with Three.js, MediaPipe Tasks Vision, ONNX Runtime Web, and Vite.

This repo now separates two jobs that should not be mixed:

- Visual VTO: track the foot, place a 3D shoe, and keep it stable enough for a camera preview.
- Size recommendation: measure the foot with a printed 100 mm reference and compare that measurement against a verified shoe internal-length/width chart.

The app does not claim accurate shoe size from raw camera tracking. A phone photo without calibration cannot provide reliable real-world scale.

## Current Upgrade

- Added calibrated foot measurement flow in `src/sizing/CalibrationManager.js`.
- Added product-chart based recommendation logic in `src/sizing/SizeRecommendationEngine.js`.
- Added Bengali UI flow for starting a size scan and collecting reference/heel/toe/width points.
- Added printable calibration reference at `public/calibration/100mm-reference.svg`.
- Added dataset, annotation, and subject-split documentation under `training/`.
- Removed the old tracker-level EU/US size recommendation from simulation coverage.

## Local Development

```bash
cd webar-shoe-vto
npm install
npm.cmd run dev
```

Use `npm.cmd` in PowerShell if normal `npm` is blocked by execution policy.

Browsers require HTTPS or localhost for camera access. Vite is configured with the basic SSL plugin.

## Verification

```bash
node test_sizing.js
node test_vto_simulation.js
npm.cmd run build
```

## Accurate Sizing Workflow

1. Print `public/calibration/100mm-reference.svg` at 100% scale.
2. Put the reference line beside a bare foot on a flat floor.
3. Keep the phone as parallel to the floor as possible.
4. Open the size scan panel. Capture a frozen camera frame or upload a top-down photo containing the reference. Tap the reference start, reference end, heel, toe, left width, and right width on that image. Undo corrects the last point; restart clears the frame. Closing the panel preserves the current measurement.
5. Import a JSON chart matching the displayed product ID. It must contain `verified: true`, a nonempty `source`, and `sizes` with unique labels, numeric `innerLengthMm` and `forefootWidthMm`. The downloadable `public/calibration/size-chart-template.json` is intentionally unverified and contains example dimensions: replace them with measured product data before marking it verified. The flag records the importer's assertion; the app cannot independently authenticate it.
6. The app recommends the smallest chart size satisfying its default 10 mm length and 2 mm width clearance. These are provisional configurable rules, not fit validation. Low-resolution measurements require recapture. Resolution quality does not measure accuracy, camera tilt, or perspective error; a single reference line cannot correct perspective distortion.

Photos and charts are processed locally in memory and are not persisted across reloads.

## Public-data Training

The CMU/COCO pilot completed 20 CPU epochs on 400 real training images; 60 images
were used for validation and 60 separate images for held-out testing. The subset
contains 878 annotated feet across all splits. On the held-out set, landmark
mAP50 improved from 0.0061 for the previous synthetic baseline to 0.6772 for the
public-data candidate. Detection mAP50 was 0.6671. These are image landmark/detection
scores, not millimeter sizing accuracy.

The candidate checkpoint and checked ONNX are saved under
`training/runs/public/cmu_pilot/weights/`; full metrics and limitations are in
`training/runs/public/cmu_pilot/training_report.json`. The versioned public-data
candidate is now active through `public/models/footnet-release.json`; its training
time, model ID and app build time are shown in the header after it loads.
Legacy models are preserved but are not silently selected as fallback.
`training/Public_CMU_FootNet_Training.ipynb` provides a self-contained Colab T4 run
with a larger subset. See `training/PUBLIC_TRAINING.md` for provenance, commands,
supervised landmarks and evaluation limits. Public data has no metric foot width
or shoe-fit labels, so accurate sizing still requires measured local captures.

Tracking now uses full visible-frame letterboxing, per-detection heel/toe pairs,
NMS, actual landmark confidence and front-camera mirror mapping. Missing/stale
detections fade out. A guided **Align shoes** fallback freezes the camera view
for four heel/toe taps and fits the model endpoints to those screen points.
Manual placement does not follow foot/camera movement: reset to Auto and align
again after moving. The small public pilot did not confidently detect the user's
bare-foot screenshot, so automatic bare-foot reliability is not yet established.

`npm.cmd run test:tracking` checks crop/mirror geometry, duplicate suppression,
confidence, shoe endpoint projection, lost tracking and the active model hash/WASM.

For production accuracy, collect consented local measurement data and keep subject-level train/validation/test splits. The starting plan is documented in `training/DATA_PIPELINE.md`.

## Project Shape

```text
webar-shoe-vto/
  index.html
  public/
    calibration/100mm-reference.svg
    models/
    wasm/
  src/
    core/
    models/
    sizing/
      CalibrationManager.js
      SizeRecommendationEngine.js
    tracking/
    ui/
  training/
    annotations/foot-measurement-schema.v1.json
    datasets/public-sources.json
    split_by_subject.py
    DATA_PIPELINE.md
```

## Next Production Steps

- Populate the product-scoped chart store with measured production SKU data.
- Add automatic reference and foot landmark detection to the frozen-frame flow.
- Validate measurement error on real devices against ruler/brannock/manual ground truth.
- Replace synthetic-only training with approved public data plus your own measured dataset.
- Add visual QA on mobile and desktop before publishing.

## Reference studio upgrade — 2026-10-15

The reference HTML is integrated as a Vite-built `studio.html` with local CSS,
a locally hosted Shopify shoe (CC BY 4.0), material variants, toe-flex preview,
trouser occlusion controls and experimental eyewear tracking. The main app adds
that textured shoe to its carousel, centered/axis-normalized custom GLBs,
independent foot materials, resource cleanup, time-based screen-pose smoothing,
PBR environment reflections and a bounded camera-light exposure probe.

Both shoe experiences use the existing validated `cmu-pilot-20261005-1601`
FootNet release. The larger GPU model has reports but no local binaries, so it
has not been promoted. Toe flex in the studio is a demonstration; the foot
model does not measure flex or metric dimensions. Eyewear scale is assumed,
not a PD measurement. Arbitrary GLBs must have Y-up and toe along +Z (or +X
before automatic long-axis rotation); long-axis detection cannot infer front/back.

`npm run test:models` checks import geometry, independent materials and load races.
The former studio source is backed up under `backups/reference-upgrade/`.

## Assisted foot tracking — 2026-10-15

Both camera views now share FootNet/Pose/contrast selection. Weak landmarks no
longer block a valid fallback. Tap to track selects the foot colour and follows
its connected region; Auto / Reset clears selections. Missing regions and stalled
video hide the shoes instead of displaying fabricated default foot positions.
Viewport cropping and front-camera mirroring are applied consistently. Screen-fit
tracking disables guessed depth occluders that previously cut holes in shoes.

Contrast tracking is a geometric estimate, not a trained foot classifier: use a
plain contrasting floor, keep the entire foot visible and point toes toward the
top of the frame. Similar-colour objects may be mistaken for feet. Tap again if
tracking is lost; fixed manual alignment remains available. No new checkpoint was
trained or promoted. Actual phone/foot accuracy and metric sizing are not proven
by synthetic tests.

`npm run test:assisted` covers segmentation, independent regions, movement/loss,
fallback selection, viewport/mirror mapping and screen-fit occlusion. The local
camera fixture in `scripts/create_tracking_fixture.py` is synthetic and excluded
from deployment. Browser tests verified both views, tap selection and blank-frame
loss. Pre-change sources are saved in `backups/v3-upgrade/`.
