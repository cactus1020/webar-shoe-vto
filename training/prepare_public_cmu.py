"""Download real CMU/COCO foot annotations and build a reproducible YOLO pose subset.

No synthetic landmarks are created. K2/K3 (metatarsal heads) are unlabelled.
COCO contains no reliable subject IDs or metric foot measurements.
"""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import math
from pathlib import Path
import random
import time
import urllib.request

MIRROR_REVISION = "5d99ff365a82073704e6feda1a4412065a0b62b1"
MIRROR = f"https://raw.githubusercontent.com/Eva20150932/coco-foot-and-leg/{MIRROR_REVISION}"
SOURCE = "https://cmu-perceptual-computing-lab.github.io/foot_keypoint_dataset/"
KEYPOINTS = ["heel", "ankle", "medial_ball_unlabelled", "lateral_ball_unlabelled", "big_toe", "small_toe"]


def download(url, destination):
    if destination.exists() and destination.stat().st_size:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    last_error = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "FootNet-public-research/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response, temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            temporary.replace(destination)
            return
        except Exception as error:
            last_error = error
            time.sleep(attempt + 1)
    raise RuntimeError(f"Download failed: {url}: {last_error}")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def foot_points(annotation, side):
    raw = annotation.get("keypoints", [])
    if len(raw) not in (18, 69):
        return None
    points = [raw[i:i + 3] for i in range(0, len(raw), 3)]
    offset = 17 if len(points) == 23 else 0
    big, small, heel = points[offset + side * 3:offset + side * 3 + 3]
    ankle = points[15 + side] if offset else [0, 0, 0]
    if not all(p[2] > 0 and all(math.isfinite(v) for v in p) for p in [heel, big, small]):
        return None
    if math.hypot(big[0] - heel[0], big[1] - heel[1]) < 20:
        return None
    return [heel, ankle, [0, 0, 0], [0, 0, 0], big, small]


def bbox_for_points(points, width, height):
    visible = [p for p in points if p[2] > 0]
    xs, ys = [p[0] for p in visible], [p[1] for p in visible]
    length = math.hypot(points[4][0] - points[0][0], points[4][1] - points[0][1])
    padding = max(6, length * 0.22)
    return [max(0, min(xs) - padding), max(0, min(ys) - padding),
            min(width, max(xs) + padding), min(height, max(ys) + padding)]


def convert_image(image_info, annotations, raw_path, output, split, coco_split):
    from PIL import Image
    with Image.open(raw_path) as image:
        image = image.convert("RGB")
        width, height = image.size
        if (width, height) != (image_info["width"], image_info["height"]):
            raise ValueError("Image dimensions disagree with annotations")
        feet = []
        for annotation in annotations:
            if annotation.get("iscrowd", 0):
                continue
            for side in (0, 1):
                points = foot_points(annotation, side)
                if points and all(0 <= p[0] <= width and 0 <= p[1] <= height for p in points if p[2] > 0):
                    feet.append((points, annotation["id"], "left" if side == 0 else "right"))
        if not feet:
            return None
        boxes = [bbox_for_points(points, width, height) for points, _, _ in feet]
        # One crop per source image keeps every annotated foot in that crop.
        x0 = max(0, math.floor(min(b[0] for b in boxes) - 24))
        y0 = max(0, math.floor(min(b[1] for b in boxes) - 24))
        x1 = min(width, math.ceil(max(b[2] for b in boxes) + 24))
        y1 = min(height, math.ceil(max(b[3] for b in boxes) + 24))
        crop_width, crop_height = x1 - x0, y1 - y0
        labels = []
        for (points, _, _), box in zip(feet, boxes):
            bx0, by0, bx1, by1 = box
            values = [0, ((bx0 + bx1) / 2 - x0) / crop_width, ((by0 + by1) / 2 - y0) / crop_height,
                      (bx1 - bx0) / crop_width, (by1 - by0) / crop_height]
            for px, py, visibility in points:
                values.extend([(px - x0) / crop_width, (py - y0) / crop_height, visibility] if visibility else [0, 0, 0])
            labels.append(" ".join(str(v) if i == 0 else f"{v:.6f}" for i, v in enumerate(values)))
        stem = f"cmu_{coco_split}_{image_info['id']:012d}"
        target = output / "images" / split / f"{stem}.jpg"
        image.crop((x0, y0, x1, y1)).save(target, quality=95)
        (output / "labels" / split / f"{stem}.txt").write_text("\n".join(labels) + "\n", encoding="utf-8")
    return {"image_id": image_info["id"], "coco_split": coco_split, "split": split,
            "file": f"images/{split}/{stem}.jpg", "image_url": image_info.get("coco_url"),
            "image_license_id": image_info.get("license"), "original_sha256": sha256(raw_path),
            "crop": [x0, y0, x1, y1], "foot_count": len(feet),
            "annotation_ids": sorted({aid for _, aid, _ in feet})}


def prepare(output, train_images=600, val_images=80, test_images=80, seed=42, workers=8):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    for split in ("train", "val", "test"):
        for folder in ("images", "labels"):
            destination = output / folder / split
            destination.mkdir(parents=True, exist_ok=True)
            if list(destination.glob("*.jpg")) or list(destination.glob("*.txt")):
                raise RuntimeError(f"Use a new output directory to prevent stale sample mixing: {destination}")
    if min(train_images, val_images, test_images) < 1:
        raise ValueError("Every split needs at least one image")
    rng = random.Random(seed)
    manifests, errors, annotation_sources, image_licenses = [], [], [], {}
    for coco_split in ("train2017", "val2017"):
        name = f"person_keypoints_{coco_split}_foot_v1.json"
        annotation_path = output / "raw" / name
        url = f"{MIRROR}/{name}"
        print(f"Downloading {coco_split} annotations from pinned CMU mirror", flush=True)
        download(url, annotation_path)
        document = json.loads(annotation_path.read_text(encoding="utf-8"))
        annotation_sources.append({"url": url, "sha256": sha256(annotation_path)})
        image_licenses[coco_split] = document.get("licenses", [])
        grouped = defaultdict(list)
        for annotation in document["annotations"]:
            grouped[annotation["image_id"]].append(annotation)
        candidates = [image for image in document["images"] if any(
            foot_points(annotation, side) for annotation in grouped[image["id"]] for side in (0, 1))]
        rng.shuffle(candidates)
        limits = {"train": train_images} if coco_split == "train2017" else {"val": val_images, "test": test_images}
        required = sum(limits.values())
        candidates = candidates[:required]
        jobs = []
        cursor = 0
        for split, count in limits.items():
            for image in candidates[cursor:cursor + count]:
                jobs.append((split, image))
            cursor += count

        def work(job):
            split, image = job
            raw_path = output / "raw" / coco_split / f"{image['id']:012d}.jpg"
            # COCO's official download endpoint uses HTTP and has no account requirement.
            image_url = f"http://images.cocodataset.org/{coco_split}/{image['id']:012d}.jpg"
            download(image_url, raw_path)
            record = convert_image(image, grouped[image["id"]], raw_path, output, split, coco_split)
            if record:
                record["download_url"] = image_url
            return record

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(work, job): job for job in jobs}
            for index, future in enumerate(as_completed(futures), 1):
                try:
                    record = future.result()
                    if record:
                        manifests.append(record)
                except Exception as error:
                    errors.append({"image_id": futures[future][1]["id"], "error": str(error)})
                if index % 50 == 0 or index == len(futures):
                    print(f"{coco_split}: {index}/{len(futures)} processed, total {len(manifests)} images", flush=True)
    counts = {split: sum(r["split"] == split for r in manifests) for split in ("train", "val", "test")}
    foot_counts = {split: sum(r["foot_count"] for r in manifests if r["split"] == split) for split in counts}
    report = {"source": SOURCE, "annotation_license": "CC BY 4.0 (CMU); mirror does not replace upstream terms",
              "mirror_revision": MIRROR_REVISION, "annotation_sources": annotation_sources,
              "image_licenses": image_licenses, "seed": seed, "image_counts": counts, "foot_counts": foot_counts,
              "keypoints": KEYPOINTS, "unlabelled_keypoints": [2, 3], "metric_ground_truth": False,
              "split_policy": "Official COCO train vs val; val image IDs partitioned into validation/test. No subject identity guarantee.",
              "records": sorted(manifests, key=lambda r: (r["split"], r["image_id"])), "download_errors": errors}
    (output / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if any(count < 1 for count in counts.values()):
        raise RuntimeError(f"Empty split: {counts}. Inspect manifest download_errors.")
    yaml = f"path: {output.as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\nkpt_shape: [6, 3]\nflip_idx: [0, 1, 2, 3, 4, 5]\nnames:\n  0: foot\n"
    (output / "data.yaml").write_text(yaml, encoding="utf-8")
    print(json.dumps({"images": counts, "feet": foot_counts, "errors": len(errors), "data": str(output / "data.yaml")}), flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="training/public_cmu_pilot")
    parser.add_argument("--train-images", type=int, default=600)
    parser.add_argument("--val-images", type=int, default=80)
    parser.add_argument("--test-images", type=int, default=80)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    prepare(args.output, args.train_images, args.val_images, args.test_images, args.seed, args.workers)
