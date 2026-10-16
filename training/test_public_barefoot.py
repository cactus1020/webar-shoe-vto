from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from PIL import Image
from prepare_public_barefoot import inspect_archive, label_line, prepare, safe_member
from train_public_footnet import audit_dataset

CATEGORY = {"id": 1, "name": "left_foot", "keypoints": ["big_toe", "small_toe", "heel"]}
ANNOTATION = {"id": 1, "image_id": 0, "category_id": 1, "bbox": [20, 10, 70, 95],
              "keypoints": [50, 20, 2, 70, 22, 2, 50, 90, 2]}


def image_bytes(colour):
    result = BytesIO()
    Image.new("RGB", (120, 120), colour).save(result, format="JPEG")
    return result.getvalue()


def fixture_zip(path, duplicate=False):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for split, colour in (("train", "red"), ("valid", "green"), ("test", "blue")):
            images = [{"id": 0, "file_name": "sample.jpg", "width": 120, "height": 120}]
            annotations = [ANNOTATION]
            archive.writestr(f"{split}/sample.jpg", image_bytes(colour))
            if split == "train" and duplicate:
                images.append({"id": 1, "file_name": "duplicate.jpg", "width": 120, "height": 120})
                annotations.append({**ANNOTATION, "id": 2, "image_id": 1})
                archive.writestr("train/duplicate.jpg", image_bytes("blue"))
            archive.writestr(f"{split}/_annotations.coco.json", json.dumps({
                "images": images, "annotations": annotations, "categories": [CATEGORY]}))


class BarefootImportTests(unittest.TestCase):
    def test_dangerous_paths_rejected(self):
        for name in ("../evil.jpg", "C:/evil.jpg", "/evil.jpg", "train\\evil.jpg", "train/../evil.jpg", "train//a.jpg"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                safe_member(name)

    def test_executable_is_not_extracted(self):
        data = BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("train/installer.exe", b"MZ")
        with zipfile.ZipFile(data) as archive, self.assertRaises(ValueError):
            inspect_archive(archive)

    def test_symlink_rejected(self):
        data = BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            member = zipfile.ZipInfo("train/a.jpg")
            member.external_attr = 0o120777 << 16
            archive.writestr(member, b"../other")
        with zipfile.ZipFile(data) as archive, self.assertRaises(ValueError):
            inspect_archive(archive)

    def test_source_order_is_mapped_without_inventing_landmarks(self):
        values = list(map(float, label_line(ANNOTATION, CATEGORY, 120, 120).split()))
        self.assertEqual(len(values), 23)
        self.assertAlmostEqual(values[5], 50 / 120, places=5)
        self.assertAlmostEqual(values[6], 90 / 120, places=5)
        self.assertEqual(values[8:17], [0] * 9)
        self.assertAlmostEqual(values[18], 20 / 120, places=5)

    def test_unknown_keypoint_names_stop_import(self):
        category = {**CATEGORY, "keypoints": ["kp1", "kp2", "kp3"]}
        with self.assertRaises(ValueError):
            label_line(ANNOTATION, category, 120, 120)

    def test_nested_source_points_supported(self):
        annotation = {**ANNOTATION, "keypoints": [[50, 20, 2], [70, 22, 2], [50, 90, 2]]}
        self.assertEqual(label_line(annotation, CATEGORY, 120, 120), label_line(ANNOTATION, CATEGORY, 120, 120))

    def test_missing_heel_is_not_a_fake_negative(self):
        annotation = {**ANNOTATION, "keypoints": [50, 20, 2, 70, 22, 2, 0, 0, 0]}
        self.assertIsNone(label_line(annotation, CATEGORY, 120, 120))

    def test_duplicate_removal_and_training_audit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture_zip(root / "fixture.zip", duplicate=True)
            report = prepare(root / "fixture.zip", root / "prepared")
            self.assertEqual(report["image_counts"], {"train": 1, "val": 1, "test": 1})
            self.assertEqual(len(report["excluded"]), 1)
            audited = audit_dataset(root / "prepared/data.yaml")
            self.assertEqual(audited["foot_counts"], {"train": 1, "val": 1, "test": 1})
            prepared = root / "prepared" / report["records"][0]["file"]
            prepared.write_bytes(b"changed")
            with self.assertRaises(ValueError):
                audit_dataset(root / "prepared/data.yaml")

    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "keep.txt").write_text("user data")
            with self.assertRaises(ValueError):
                prepare(root / "missing.zip", root)
            self.assertEqual((root / "keep.txt").read_text(), "user data")


if __name__ == "__main__":
    unittest.main()
