"""Create deterministic train/validation/test splits without subject leakage.

Input format: a JSON array, or an object with a `records` array. Every record
must contain `subject_id`, as required by annotations/foot-measurement-schema.v1.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def bucket(subject_id: str) -> str:
    value = int(hashlib.sha256(subject_id.encode("utf-8")).hexdigest()[:8], 16) % 100
    if value < 70:
        return "train"
    if value < 85:
        return "val"
    return "test"


def main() -> None:
    parser = argparse.ArgumentParser(description="Split calibrated foot records by subject.")
    parser.add_argument("input", type=Path, help="JSON annotation file")
    parser.add_argument("--output-dir", type=Path, default=Path("splits"))
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    records = payload.get("records", []) if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise ValueError("Expected a JSON list or an object with a records list.")

    splits = {"train": [], "val": [], "test": []}
    for record in records:
        subject_id = record.get("subject_id")
        if not subject_id:
            raise ValueError(f"Missing subject_id in record: {record.get('capture_id', '<unknown>')}")
        splits[bucket(str(subject_id))].append(record)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for split_name, split_records in splits.items():
        destination = args.output_dir / f"{split_name}.json"
        destination.write_text(json.dumps({"records": split_records}, indent=2), encoding="utf-8")
        print(f"{split_name}: {len(split_records)} records -> {destination}")


if __name__ == "__main__":
    main()
