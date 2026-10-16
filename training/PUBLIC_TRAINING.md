# Public-data FootNet training

`prepare_public_cmu.py` downloads CMU Human Foot Keypoint annotations from a pinned
mirror and selected official COCO 2017 images. The original CMU download host was
unavailable on 2026-10-05. Annotation SHA-256s, original image SHA-256s, image
license IDs, crop geometry and split assignments are in the dataset manifest.

Attribution: Zhe Cao, Gines Hidalgo, Tomas Simon, Shih-En Wei and Yaser Sheikh,
Carnegie Mellon University. *OpenPose: Realtime Multi-Person 2D Pose Estimation
using Part Affinity Fields*, 2018, arXiv:1812.08008.

Original annotations: <https://cmu-perceptual-computing-lab.github.io/foot_keypoint_dataset/>

Annotation license: CC BY 4.0. Original COCO image rights are separate and vary per
image; see <https://cocodataset.org/#termsofuse>. Downloaded original license metadata
is retained in `manifest.json`. This is a local training research subset, not a
redistribution of image rights. Ultralytics and its pretrained weights have their
own terms; this project already uses the Ultralytics training stack.

Mirror: <https://github.com/Eva20150932/coco-foot-and-leg>, revision
`5d99ff365a82073704e6feda1a4412065a0b62b1`. Its declared license does not replace CMU
or image-source terms. Only annotation data is downloaded; mirror code is not run.

## Local pilot

```powershell
python training/prepare_public_cmu.py --train-images 400 --val-images 60 --test-images 60
python training/test_public_pipeline.py
python training/train_public_footnet.py --data training/public_cmu_pilot/data.yaml --weights training/yolov8n-pose.pt --epochs 20 --batch 16 --device cpu --freeze 10 --baseline training/runs/pose/runs/footnet/footnet_nano/weights/best.pt
python training/validate_public_onnx.py
```

Use a new `--output` directory to change dataset size; rerunning preparation into
a populated image directory is refused to prevent stale split mixing. Downloads
can resume from the raw cache, but final split images must be built into a clean
output directory. The training output uses incremented run directories and does
not overwrite `public/models`.

## Colab GPU

Upload `Public_CMU_FootNet_Training.ipynb` to Colab, select a T4 GPU, then Run all.
The notebook is self-contained: no Google Drive mount or API key is needed.
It defaults to 4,000 training images, 120 validation images, 120 held-out test images
and 60 epochs. Its final cell downloads a ZIP with checkpoints, ONNX and metrics.
Rebuild it with `python training/build_public_colab.py` after changing the scripts.

## Barefoot-specific public-data follow-up

`prepare_public_barefoot.py` imports the official COCO ZIP from AI Training's
[Foot Keypoints Detection v5](https://universe.roboflow.com/ai-training-rvswa/foot-keypoints-detection/dataset/5).
The publisher reports 820 unaugmented images (574 train / 164 validation / 82 test),
bare feet and socks, and heel/big-toe/small-toe landmarks. Its overview currently
lists 716 project images; version counts and actual imported counts must not be
conflated. The published license is Public Domain, linked to CC0.

Download requires a free-account sign-in. On 2026-10-06 sign-in succeeded, but
ZIP/code export stalled and the workspace picker reported "Couldn't load workspaces."
No Roboflow dataset ZIP or model has been obtained or trained yet.

The importer never runs dataset scripts or uses `extractall`. It rejects unsafe
paths, executable/unexpected extensions, symlinks, encrypted entries and oversized
or highly compressed members before reading. It only reads JSON/images, re-encodes
images, masks unobserved ankle/metatarsal slots, and rejects unknown keypoint names
instead of guessing their order. Exact pixel duplicates are removed, prioritising
test > validation > training. This does not prove independence by person or video,
and it is not antivirus certification. Prepared image hashes and label counts
are checked before training. No source image is deployed to the website.

```powershell
python training/test_public_barefoot.py
python training/build_barefoot_colab.py
```

`Public_Barefoot_FineTuning.ipynb` runs only on a cloud GPU and accepts the public
COCO data ZIP, plus an optional SHA-256-verified checkpoint from this project's
previous CMU pilot. It needs no Roboflow API key or Drive mount. The notebook uses
60 epochs, 256px, batch 32, and an unfrozen backbone; actual epochs and usable
image/foot counts are reported. It does not promote a model to the live app.

On 2026-10-06 the existing CMU Colab notebook connected to a Tesla T4 after the
user completed Colab's verification. Its 4,000/120/120 dataset preparation, all
60 training epochs, held-out evaluation and ONNX numerical check completed.
See `CLOUD_RUN_20261006.md` for actual counts/results and the pending ZIP-download
handoff. The new candidate is not live; no real-phone or metric-sizing accuracy
has been validated.

## What the CMU model learns

Six-slot output keeps the existing web tensor shape. Supervision is available for
heel, big toe and small toe, plus ankle in the training annotations that include
COCO body points. K2/K3 metatarsal heads are absent and remain visibility zero.
Their predictions must never be treated as measured forefoot boundaries.

All feet from the same original image stay together. Official train images are
only used for training; official validation images are divided into validation
and held-out testing before any training. COCO provides no stable subject IDs, so
this is not proof of subject-exclusive evaluation. Cropped images contain shoes,
side views and diverse poses; mobile top-down captures are a different domain.

The data has no independent metric foot dimensions or product fit feedback.
Pose mAP is an image landmark score, not sizing accuracy. This model cannot
validate millimeter measurements, foot width or accurate size recommendation.
The training report deliberately marks metric sizing and production readiness
false, even if pose scores improve. Keep ruler/marker calibration and verified
SKU dimensions for the size flow; fine-tune on measured local foot captures next.
