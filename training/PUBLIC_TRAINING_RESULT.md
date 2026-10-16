# Public training result — 2026-10-05

Completed locally: CMU/COCO real-image pilot, 20 epochs, YOLOv8n-pose, 256px,
CPU, pretrained backbone frozen for the first run. Runtime: 323 seconds.

| Split | Images | Labelled feet |
| --- | ---: | ---: |
| Train | 400 | 677 |
| Validation | 60 | 105 |
| Held-out test | 60 | 96 |

| Held-out metric | Previous synthetic baseline | Public-data candidate |
| --- | ---: | ---: |
| Detection mAP50 | 0.00296 | 0.66714 |
| Detection mAP50–95 | 0.00064 | 0.18748 |
| Pose mAP50 | 0.00611 | 0.67719 |
| Pose mAP50–95 | 0.00094 | 0.29173 |

Scores are on this small image split only; they are not size accuracy. No
millimeter dimensions, foot width labels or fitting outcomes are in this data.
Unlabelled metatarsal slots are masked. Subjects are not identified, so the
image-separated split cannot certify independence by person.

Checkpoint: `runs/public/cmu_pilot/weights/best.pt`.
ONNX: `runs/public/cmu_pilot/weights/best.onnx` (12,452,253 bytes).
Report: `runs/public/cmu_pilot/training_report.json`.
Dataset provenance: `public_cmu_pilot/manifest.json`.

The ONNX output is `[1, 23, 1344]` for input `[1, 3, 256, 256]`, matching the web
engine's tensor layout. On three real held-out square crops, maximum absolute
PyTorch/ONNX difference was 0.000214. This verifies export equivalence, not mobile
tracking quality. On 2026-10-06 the validation was rerun using the current
full-image letterbox preprocessing; the maximum difference was 0.000275 and
still passed the 0.01 export-equivalence tolerance. See
`runs/public/cmu_pilot/onnx_validation.json`. This is the old pilot's export check,
not evaluation of the in-progress cloud model.

At the time of this initial training result, the app's model files had not been
replaced. The pilot was subsequently activated as `cmu-pilot-20261005-1601` with
stricter inference checks and a manual-alignment fallback. Automatic barefoot
detection remains unreliable; no production tracking or metric sizing is certified.

Prepared Colab notebook:
<https://colab.research.google.com/drive/1g4F48-Y2PC04eIwmKDxtbxb2vEn8e4pE>

The uploaded notebook is configured for a T4, 4,000 training images and 60 epochs.
On 2026-10-05 Colab reported "Failed to assign a backend" with a possible location
restriction, so that day's cloud run did not execute. Kaggle navigation also
timed out from the in-app browser. No paid compute or subscription was purchased.

On 2026-10-06, after the user completed Colab's presence verification, the same
notebook connected to a Tesla T4 (`CUDA: True`). Dataset preparation completed,
and the GPU run subsequently completed with 4,000/120/120 actual images, all 60
epochs, 256px, batch 32 and an unfrozen backbone. Held-out pose mAP50 was 0.795883;
numerical ONNX validation passed. This run is separate from the pilot above and
uses a different held-out split. See `CLOUD_RUN_20261006.md` for verified results
and the pending result-ZIP download. The new cloud candidate is not deployed.
