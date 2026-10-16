"""Read a Roboflow COCO data ZIP; never extract or execute downloaded code.

Only the published heel/big-toe/small-toe annotations are supervised. Ankle and
metatarsal slots remain masked. All output files are newly encoded data files.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

SOURCE = "https://universe.roboflow.com/ai-training-rvswa/foot-keypoints-detection/dataset/5"
KEYPOINTS = ["heel", "ankle_unlabelled", "medial_ball_unlabelled", "lateral_ball_unlabelled", "big_toe", "small_toe"]
SPLITS = {"train": "train", "valid": "val", "val": "val", "test": "test"}
MAX_MEMBER = 32 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_member(name):
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or ".." in path.parts or "\\" in name
            or ":" in name or "\x00" in name or str(path) != name.rstrip("/")):
        raise ValueError(f"Unsafe ZIP path: {name!r}")
    return path


def inspect_archive(archive):
    """Reject executable payloads, ZIP bombs, links and unsafe paths before reading."""
    counts = defaultdict(int)
    total = 0
    seen = set()
    members = archive.infolist()
    if len(members) > 5000:
        raise ValueError("Too many ZIP members")
    for member in members:
        path = safe_member(member.filename)
        if member.filename in seen:
            raise ValueError("Duplicate ZIP member name")
        seen.add(member.filename)
        if stat.S_ISLNK(member.external_attr >> 16):
            raise ValueError("ZIP symlinks are not permitted")
        if member.flag_bits & 1:
            raise ValueError("Encrypted ZIP members are not permitted")
        if member.is_dir():
            continue
        suffix = path.suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".json", ".txt"}:
            raise ValueError(f"Unexpected file type (not extracted): {suffix}")
        if suffix == ".txt" and path.name not in {"README.dataset.txt", "README.roboflow.txt"}:
            raise ValueError("Only dataset readme text is allowed in a COCO export")
        if member.file_size > MAX_MEMBER or member.file_size > max(1, member.compress_size) * 300:
            raise ValueError("Oversized or suspiciously compressed ZIP member")
        total += member.file_size
        if total > MAX_TOTAL:
            raise ValueError("ZIP exceeds the uncompressed data budget")
        counts[suffix] += 1
    return {"status": "data_only_structure_passed", "file_types": dict(counts),
            "uncompressed_bytes": total, "note": "Structural allowlist checks; not an antivirus certification"}


def semantic_name(name):
    cleaned = re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")
    cleaned = re.sub(r"^(left|right)_", "", cleaned)
    aliases = {"heel": "heel", "big_toe": "big_toe", "bigtoe": "big_toe",
               "small_toe": "small_toe", "smalltoe": "small_toe", "little_toe": "small_toe"}
    return aliases.get(cleaned)


def source_points(annotation, category, width, height):
    names = category.get("keypoints", [])
    mapping = [semantic_name(name) for name in names]
    if len(names) != 3 or set(mapping) != {"heel", "big_toe", "small_toe"}:
        raise ValueError(f"Unrecognised keypoint names; no guessed mapping: {names}")
    raw = annotation.get("keypoints", [])
    if len(raw) == 3 and all(isinstance(point, list) and len(point) == 3 for point in raw):
        triples = raw
    elif len(raw) == 9 and all(isinstance(value, (int, float)) for value in raw):
        triples = [raw[index:index + 3] for index in range(0, 9, 3)]
    else:
        raise ValueError("Expected exactly three labelled source keypoints")
    points = {}
    for name, point in zip(mapping, triples):
        x, y, visibility = point
        if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in point):
            raise ValueError("Nonfinite keypoint")
        if visibility not in (0, 1, 2):
            raise ValueError("Invalid keypoint visibility")
        if visibility and not (0 <= x <= width and 0 <= y <= height):
            raise ValueError("Keypoint outside image")
        points[name] = point if visibility else [0, 0, 0]
    if not points["heel"][2] or not points["big_toe"][2]:
        return None
    heel, toe = points["heel"], points["big_toe"]
    if math.hypot(toe[0] - heel[0], toe[1] - heel[1]) < 10:
        return None
    return [heel, [0, 0, 0], [0, 0, 0], [0, 0, 0], toe, points["small_toe"]]


def label_line(annotation, category, width, height):
    if annotation.get("iscrowd", 0):
        return None
    points = source_points(annotation, category, width, height)
    if points is None:
        return None
    box = annotation.get("bbox", [])
    if len(box) != 4 or not all(isinstance(value, (int, float)) and math.isfinite(value) for value in box):
        raise ValueError("Invalid source bbox")
    x, y, box_width, box_height = box
    if (box_width <= 0 or box_height <= 0 or x < 0 or y < 0
            or x + box_width > width + 1 or y + box_height > height + 1):
        raise ValueError("Source bbox outside image")
    box_width, box_height = min(box_width, width - x), min(box_height, height - y)
    values = [0, (x + box_width / 2) / width, (y + box_height / 2) / height,
              box_width / width, box_height / height]
    for px, py, visibility in points:
        values.extend([px / width, py / height, visibility] if visibility else [0, 0, 0])
    return " ".join(str(value) if index == 0 else f"{value:.6f}" for index, value in enumerate(values))


def prepare(zip_path, output):
    from PIL import Image
    output = Path(output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError("Use an empty output directory; existing data is preserved")
    zip_path = Path(zip_path)
    if zip_path.stat().st_size > MAX_TOTAL:
        raise ValueError("ZIP exceeds the compressed data budget")
    archive_bytes = zip_path.read_bytes()
    records, excluded, categories_record, annotation_sources = [], [], {}, []
    hashes = set()
    with zipfile.ZipFile(BytesIO(archive_bytes)) as archive:
        security = inspect_archive(archive)
        annotations = [name for name in archive.namelist() if name.endswith("_annotations.coco.json")]
        configs = {}
        for annotation_file in annotations:
            parent = PurePosixPath(annotation_file).parent
            split = SPLITS.get(parent.name)
            if split is None or split in configs:
                raise ValueError("Expected one COCO annotation file per split")
            annotation_bytes = archive.read(annotation_file)
            document = json.loads(annotation_bytes, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
            configs[split] = (parent, document)
            annotation_sources.append({"file": annotation_file, "sha256": digest(annotation_bytes)})
        if set(configs) != {"train", "val", "test"}:
            raise ValueError("COCO export must contain train, validation and test")
        output.mkdir(parents=True, exist_ok=True)
        for split in ("test", "val", "train"):
            parent, document = configs[split]
            categories = {category["id"]: category for category in document["categories"]}
            categories_record[split] = list(categories.values())
            grouped = defaultdict(list)
            for annotation in document["annotations"]:
                grouped[annotation["image_id"]].append(annotation)
            (output / "images" / split).mkdir(parents=True)
            (output / "labels" / split).mkdir(parents=True)
            seen_ids = set()
            for info in document["images"]:
                if type(info["id"]) is not int or info["id"] < 0:
                    raise ValueError("Image IDs must be nonnegative integers")
                if info["id"] in seen_ids:
                    raise ValueError("Duplicate COCO image ID in split")
                seen_ids.add(info["id"])
                source_file = str(parent / safe_member(info["file_name"]))
                data = archive.read(source_file)
                with Image.open(BytesIO(data)) as image:
                    image.verify()
                with Image.open(BytesIO(data)) as image:
                    if image.format not in {"JPEG", "PNG"} or image.width * image.height > 32_000_000:
                        raise ValueError("Unsupported image content or dimensions")
                    image = image.convert("RGB")
                    width, height = image.size
                    if (width, height) != (info["width"], info["height"]):
                        raise ValueError("Image and annotation dimensions disagree")
                    pixel_hash = digest(image.tobytes() + f"{width}x{height}".encode())
                    if pixel_hash in hashes:
                        excluded.append({"file": source_file, "reason": "exact_pixel_duplicate; evaluation takes precedence"})
                        continue
                    lines = [line for annotation in grouped[info["id"]]
                             if (line := label_line(annotation, categories[annotation["category_id"]], width, height))]
                    if not lines:
                        excluded.append({"file": source_file, "reason": "no usable heel-toe annotation; not treated as a negative"})
                        continue
                    hashes.add(pixel_hash)
                    stem = f"rf5_{split}_{info['id']}"
                    prepared = output / "images" / split / f"{stem}.jpg"
                    image.save(prepared, quality=95)
                (output / "labels" / split / f"{stem}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
                records.append({"source_identity": source_file, "image_id": info["id"], "split": split,
                                "file": f"images/{split}/{stem}.jpg", "source_file": source_file,
                                "original_sha256": digest(data), "pixel_sha256": pixel_hash,
                                "prepared_sha256": digest(prepared.read_bytes()), "foot_count": len(lines)})
    counts = {split: sum(record["split"] == split for record in records) for split in ("train", "val", "test")}
    feet = {split: sum(record["foot_count"] for record in records if record["split"] == split) for split in counts}
    report = {"source": SOURCE, "created_utc": datetime.now(timezone.utc).isoformat(),
              "archive_sha256": digest(archive_bytes), "archive_security_check": security,
              "declared_license": "Public Domain / CC0 as declared by AI Training on Roboflow Universe",
              "annotation_sources": annotation_sources, "source_categories": categories_record,
              "keypoints": KEYPOINTS, "unlabelled_keypoints": [1, 2, 3], "metric_ground_truth": False,
              "image_counts": counts, "foot_counts": feet, "records": records, "excluded": excluded,
              "split_policy": "Publisher image split; exact pixel duplicates removed with test > val > train priority. No subject/video-exclusive guarantee."}
    (output / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if any(count < 1 for count in counts.values()):
        raise ValueError("A split has no usable images; do not train")
    yaml = (f"path: {output.as_posix()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
            "kpt_shape: [6, 3]\nflip_idx: [0, 1, 2, 3, 4, 5]\nnames:\n  0: foot\n")
    (output / "data.yaml").write_text(yaml, encoding="utf-8")
    print(json.dumps({"images": counts, "feet": feet, "excluded": len(excluded), "archive_check": security}), flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True)
    parser.add_argument("--output", default="training/public_barefoot_rf5")
    args = parser.parse_args()
    prepare(args.zip, args.output)
