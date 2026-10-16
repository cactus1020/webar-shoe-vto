import json
from pathlib import Path
import tempfile
import unittest

from prepare_public_cmu import foot_points, convert_image
from train_public_footnet import audit_dataset


class PublicLabelsTest(unittest.TestCase):
    def test_three_source_points_keep_unobserved_slots_masked(self):
        annotation = {"keypoints": [80, 20, 2, 100, 25, 2, 85, 90, 2,
                                    140, 20, 2, 160, 25, 2, 145, 90, 2]}
        left = foot_points(annotation, 0)
        self.assertEqual(left[0], [85, 90, 2])
        self.assertEqual(left[4], [80, 20, 2])
        self.assertEqual(left[5], [100, 25, 2])
        self.assertEqual(left[1:4], [[0, 0, 0]] * 3)

    def test_body_annotation_provides_ankle_without_inventing_ball(self):
        raw = [0, 0, 0] * 23
        raw[45:48] = [85, 70, 2]
        raw[51:60] = [80, 20, 2, 100, 25, 2, 85, 90, 2]
        points = foot_points({"keypoints": raw}, 0)
        self.assertEqual(points[1], [85, 70, 2])
        self.assertEqual(points[2:4], [[0, 0, 0], [0, 0, 0]])

    def test_missing_heel_cannot_generate_foot(self):
        self.assertIsNone(foot_points({"keypoints": [80, 20, 2, 100, 25, 2, 0, 0, 0] * 2}, 0))

    def test_crop_labels_remain_inside_image(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for folder in [root / "images/train", root / "labels/train"]:
                folder.mkdir(parents=True)
            raw_path = root / "sample.jpg"
            Image.new("RGB", (200, 120)).save(raw_path)
            annotation = {"id": 1, "keypoints": [80, 20, 2, 100, 25, 2, 85, 90, 2,
                                                 140, 20, 2, 160, 25, 2, 145, 90, 2]}
            record = convert_image({"id": 1, "width": 200, "height": 120}, [annotation], raw_path, root, "train", "train2017")
            labels = (root / "labels/train/cmu_train2017_000000000001.txt").read_text().splitlines()
            self.assertEqual(record["foot_count"], 2)
            for line in labels:
                values = list(map(float, line.split()))
                self.assertEqual(len(values), 23)
                self.assertTrue(all(0 <= v <= 1 for v in values[1:5]))
                self.assertEqual(values[11:17], [0] * 6)

    def test_downloaded_dataset_split_audit(self):
        data = Path(__file__).parent / "public_cmu_pilot/data.yaml"
        if not data.exists():
            self.skipTest("Local public dataset not downloaded")
        report = audit_dataset(data)
        self.assertEqual(report["image_counts"], {"train": 400, "val": 60, "test": 60})


if __name__ == "__main__":
    unittest.main()
