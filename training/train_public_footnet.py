"""Train/evaluate a public-data pilot without replacing the app's existing model."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import time


def audit_dataset(data_path):
    import yaml
    config = yaml.safe_load(data_path.read_text(encoding="utf-8"))
    root = Path(config["path"]).resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("metric_ground_truth") is not False:
        raise ValueError("This pipeline expects nonmetric public pose data")
    if config.get("kpt_shape") != [6, 3] or config.get("names") != {0: "foot"}:
        raise ValueError("Expected the web engine's single-class, six-slot pose layout")
    seen = set()
    hash_splits = {}
    actual_counts = {split: 0 for split in ("train", "val", "test")}
    actual_feet = dict(actual_counts)
    for record in manifest["records"]:
        if record["split"] not in actual_counts:
            raise ValueError("Invalid dataset split")
        identity = record.get("source_identity", (record.get("coco_split"), record["image_id"]))
        if isinstance(identity, list):
            identity = tuple(identity)
        if identity in seen:
            raise ValueError("Source image duplicated across dataset records")
        seen.add(identity)
        image_hash = record.get('original_sha256')
        if image_hash and image_hash in hash_splits and hash_splits[image_hash] != record['split']:
            raise ValueError('Identical image contents appear in different splits')
        if image_hash:
            hash_splits[image_hash] = record['split']
        if "coco_split" in record and record["split"] == "train" and record["coco_split"] != "train2017":
            raise ValueError("Training must use official train images only")
        image = (root / record["file"]).resolve()
        if not image.is_relative_to(root):
            raise ValueError("Dataset image path escapes dataset directory")
        label = root / "labels" / record["split"] / (image.stem + ".txt")
        if not image.exists() or not label.exists():
            raise FileNotFoundError(image)
        if record.get("prepared_sha256") and hashlib.sha256(image.read_bytes()).hexdigest() != record["prepared_sha256"]:
            raise ValueError("Prepared dataset image hash has changed")
        actual_counts[record["split"]] += 1
        foot_count = 0
        for line in label.read_text().splitlines():
            values = [float(v) for v in line.split()]
            if (len(values) != 23 or not all(math.isfinite(v) for v in values)
                    or values[0] != 0 or any(not 0 <= v <= 1 for v in values[1:5])
                    or values[3] <= 0 or values[4] <= 0):
                raise ValueError(f"Invalid YOLO label: {label}")
            for index in range(6):
                x, y, visibility = values[5 + index * 3:8 + index * 3]
                if visibility not in (0, 1, 2) or not 0 <= x <= 1 or not 0 <= y <= 1:
                    raise ValueError(f"Invalid keypoint: {label}")
                if index in (2, 3) and visibility != 0:
                    raise ValueError("Unobserved metatarsals must not be fabricated")
            foot_count += 1
        if foot_count != record["foot_count"]:
            raise ValueError("Manifest foot count does not match labels")
        actual_feet[record["split"]] += foot_count
    if actual_counts != manifest["image_counts"] or actual_feet != manifest["foot_counts"]:
        raise ValueError("Manifest counts do not match actual dataset files")
    if any(count < 1 for count in actual_counts.values()):
        raise ValueError("All three splits are required")
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--weights", default="training/yolov8n-pose.pt")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--imgsz", type=int, default=256)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--freeze", type=int, default=10)
    parser.add_argument("--project", default="training/runs/public")
    parser.add_argument("--name", default="cmu_pilot")
    parser.add_argument("--baseline", default="")
    args = parser.parse_args()
    import torch
    from ultralytics import YOLO
    data = Path(args.data).resolve()
    manifest = audit_dataset(data)
    torch.set_num_threads(args.threads)
    started = time.time()
    model = YOLO(args.weights)
    # Freeze pretrained backbone for an affordable CPU pilot; --freeze 0 on GPU.
    results = model.train(data=str(data), epochs=args.epochs, imgsz=args.imgsz,
                          batch=args.batch, device=args.device, workers=0,
                          project=str(Path(args.project).resolve()), name=args.name,
                          exist_ok=False, optimizer="AdamW", lr0=0.001, lrf=0.01,
                          freeze=args.freeze, seed=42, deterministic=True,
                          amp=args.device != "cpu", plots=True, patience=15,
                          mosaic=0.2, close_mosaic=5, degrees=25, fliplr=0.5,
                          translate=0.1, scale=0.3)
    run = Path(model.trainer.save_dir)
    best = run / "weights" / "best.pt"
    candidate = YOLO(str(best))
    validation = candidate.val(data=str(data), split="val", imgsz=args.imgsz, device=args.device,
                               workers=0, project=str(run), name="validation", plots=False)
    test = candidate.val(data=str(data), split="test", imgsz=args.imgsz, device=args.device,
                         workers=0, project=str(run), name="heldout_test", plots=True)
    baseline_metrics = None
    if args.baseline:
        baseline = YOLO(args.baseline)
        baseline_test = baseline.val(data=str(data), split="test", imgsz=args.imgsz,
                                     device=args.device, workers=0, project=str(run),
                                     name="baseline_heldout", plots=False)
        baseline_metrics = {key: float(value) for key, value in baseline_test.results_dict.items()}
    export = candidate.export(format="onnx", imgsz=args.imgsz, batch=1, half=False,
                              dynamic=False, simplify=False, opset=17, device="cpu")
    import numpy as np
    import onnxruntime as ort
    session = ort.InferenceSession(str(export), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: np.zeros((1, 3, args.imgsz, args.imgsz), dtype=np.float32)})[0]
    if output.shape[0] != 1 or output.shape[1] != 23 or not np.isfinite(output).all():
        raise RuntimeError(f"Unexpected web output: {output.shape}")
    report = {"created_utc": datetime.now(timezone.utc).isoformat(), "stage": "public_data_pilot",
              "checkpoint": str(best), "onnx": str(export), "onnx_sha256": hashlib.sha256(Path(export).read_bytes()).hexdigest(),
              "onnx_input": session.get_inputs()[0].shape, "onnx_output": list(output.shape),
              "dataset_source": manifest["source"], "image_counts": manifest["image_counts"],
              "foot_counts": manifest["foot_counts"], "keypoints": manifest["keypoints"],
              "actual_epochs": len(model.trainer.csv.read_text().splitlines()) - 1,
              "training_config": vars(args), "elapsed_seconds": round(time.time() - started),
              "validation": {key: float(value) for key, value in validation.results_dict.items()},
              "heldout_test": {key: float(value) for key, value in test.results_dict.items()},
              "previous_synthetic_baseline_test": baseline_metrics,
              "metric_sizing_validated": False, "production_ready": False,
              "split_policy": manifest.get("split_policy"),
              "limitations": ["No foot length/width in mm or product fit labels",
                              "K2/K3 have no ground truth; do not use them for sizing",
                              "Image split, not a verified subject-exclusive split",
                              "Training images may differ from real mobile scans",
                              "Image rights vary by source; retain dataset attribution",
                              "Real-phone tracking and metric sizing require independent validation"]}
    (run / "training_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("PUBLIC TRAINING COMPLETE", flush=True)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
