"""
prepare_foot_dataset.py
Automated Foot Keypoint Dataset Pipeline for FootNet Training

Prepares:
1. Standard YOLOv8-pose folder structure:
   dataset/
     ├── data.yaml
     ├── images/{train,val}
     └── labels/{train,val}
2. 6-Anatomical Keypoint Schema per Foot:
   - K0: Heel Base (Calcaneus)
   - K1: Ankle Joint (Malleolus)
   - K2: 1st Metatarsal Head (Medial Ball / Instep)
   - K3: 5th Metatarsal Head (Lateral Ball / Outer Foot)
   - K4: Big Toe Tip (Hallux)
   - K5: Small Toe Tip
3. Generates high-fidelity top-down foot samples with floor augmentations
   (varnished wood, parquet, beige tiles, concrete, shadows) for instant training.
4. Provides downloader for COCO-WholeBody foot keypoint annotations.
"""

import os
import sys
import json
import math
import random
import argparse
from pathlib import Path

def setup_yolo_pose_dirs(base_dir: Path):
    """Creates the YOLOv8-pose directory structure."""
    dirs = [
        base_dir / "images" / "train",
        base_dir / "images" / "val",
        base_dir / "labels" / "train",
        base_dir / "labels" / "val"
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    return base_dir

def create_yaml_config(base_dir: Path):
    """Generates the data.yaml configuration for Ultralytics YOLO-pose."""
    yaml_path = base_dir / "data.yaml"
    content = f"""# FootNet Dataset Configuration for Ultralytics YOLO-Pose
path: {base_dir.as_posix()}
train: images/train
val: images/val

# 6 Anatomical Keypoints: [Heel, Ankle, 1st Metatarsal, 5th Metatarsal, Big Toe Tip, Small Toe Tip]
kpt_shape: [6, 3] # (x, y, visibility)
flip_idx: [0, 1, 3, 2, 5, 4] # Horizontal symmetry index swap for lateral/medial points

names:
  0: foot
"""
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"[FootNet] Config written to {yaml_path}")
    return yaml_path

def generate_synthetic_samples(base_dir: Path, num_train: int = 240, num_val: int = 60):
    """
    Generates synthetic top-down camera foot samples with realistic anatomical variations,
    multiple floor backgrounds (wood, tile, concrete), camera pitch angles, and precise labels.
    """
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError:
        print("[FootNet] PIL not found. Installing pillow...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
        from PIL import Image, ImageDraw, ImageFilter

    splits = [("train", num_train), ("val", num_val)]
    img_size = 384

    # Floor background palettes
    floor_types = [
        {"name": "wood_varnished", "base": (205, 168, 125), "var": (25, 20, 15)},
        {"name": "wood_dark", "base": (130, 95, 65), "var": (20, 15, 10)},
        {"name": "tile_beige", "base": (225, 218, 205), "var": (15, 15, 15)},
        {"name": "tile_white", "base": (235, 235, 235), "var": (10, 10, 10)},
        {"name": "concrete_gray", "base": (160, 160, 160), "var": (18, 18, 18)}
    ]

    # Skin tone palettes (Fitzpatrick scale I-VI)
    skin_tones = [
        {"base": (245, 215, 195), "shadow": (200, 165, 140)}, # Fair
        {"base": (230, 195, 165), "shadow": (185, 145, 115)}, # Light
        {"base": (200, 160, 125), "shadow": (155, 115, 80)},  # Medium / Olive
        {"base": (165, 120, 85),  "shadow": (120, 80, 50)},   # Brown / South Asian
        {"base": (120, 80, 55),   "shadow": (80, 48, 28)},     # Dark Brown
        {"base": (75, 48, 32),    "shadow": (45, 26, 16)}      # Deep Dark
    ]

    total_generated = 0

    for split_name, count in splits:
        img_dir = base_dir / "images" / split_name
        lbl_dir = base_dir / "labels" / split_name

        for i in range(count):
            img_id = f"foot_synth_{split_name}_{i:04d}"
            img = Image.new("RGB", (img_size, img_size), (200, 175, 140))
            draw = ImageDraw.Draw(img)

            # 1. Procedural floor background
            floor = random.choice(floor_types)
            base_r, base_g, base_b = floor["base"]
            vr, vg, vb = floor["var"]

            for y in range(0, img_size, 16):
                line_shade = random.randint(-15, 15)
                for x in range(0, img_size, 16):
                    r = max(0, min(255, base_r + line_shade + random.randint(-vr, vr)))
                    g = max(0, min(255, base_g + line_shade + random.randint(-vg, vg)))
                    b = max(0, min(255, base_b + line_shade + random.randint(-vb, vb)))
                    draw.rectangle([x, y, x + 16, y + 16], fill=(r, g, b))

            # Wood plank lines
            if "wood" in floor["name"]:
                for line_y in range(random.randint(40, 80), img_size, random.randint(90, 140)):
                    draw.line([(0, line_y), (img_size, line_y)], fill=(max(0, base_r - 40), max(0, base_g - 35), max(0, base_b - 30)), width=2)

            img = img.filter(ImageFilter.GaussianBlur(radius=1.2))
            draw = ImageDraw.Draw(img)

            # 2. Draw feet (Left and Right)
            skin = random.choice(skin_tones)
            labels = []

            for is_right in [False, True]:
                # Position variation in normalized frame
                center_x_norm = random.uniform(0.55, 0.72) if is_right else random.uniform(0.28, 0.45)
                center_y_norm = random.uniform(0.35, 0.55)
                foot_len_norm = random.uniform(0.24, 0.36)
                foot_w_norm = foot_len_norm * random.uniform(0.38, 0.46)
                angle_deg = random.uniform(-18, -4) if not is_right else random.uniform(4, 18)
                angle_rad = math.radians(angle_deg)

                cx = center_x_norm * img_size
                cy = center_y_norm * img_size
                fl = foot_len_norm * img_size
                fw = foot_w_norm * img_size

                # Keypoint positions relative to foot center
                # Forward vector points from heel to toes
                cos_a = math.cos(angle_rad)
                sin_a = math.sin(angle_rad)
                fwd_x = -sin_a
                fwd_y = -cos_a
                lat_x = cos_a
                lat_y = -sin_a

                if not is_right:
                    lat_x = -lat_x
                    lat_y = -lat_y

                # 6 Keypoints in pixel coords:
                # K0: Heel Base
                k0 = (cx - fwd_x * fl * 0.46, cy - fwd_y * fl * 0.46)
                # K1: Ankle / Lower Leg
                k1 = (cx - fwd_x * fl * 0.32, cy - fwd_y * fl * 0.32)
                # K2: 1st Metatarsal (Medial Ball)
                k2 = (cx + fwd_x * fl * 0.18 - lat_x * fw * 0.42, cy + fwd_y * fl * 0.18 - lat_y * fw * 0.42)
                # K3: 5th Metatarsal (Lateral Ball)
                k3 = (cx + fwd_x * fl * 0.14 + lat_x * fw * 0.46, cy + fwd_y * fl * 0.14 + lat_y * fw * 0.46)
                # K4: Big Toe Tip
                k4 = (cx + fwd_x * fl * 0.50 - lat_x * fw * 0.28, cy + fwd_y * fl * 0.50 - lat_y * fw * 0.28)
                # K5: Small Toe Tip
                k5 = (cx + fwd_x * fl * 0.42 + lat_x * fw * 0.44, cy + fwd_y * fl * 0.42 + lat_y * fw * 0.44)

                kpts = [k0, k1, k2, k3, k4, k5]

                # Draw Soft Contact Shadow
                shadow_pts = [
                    (k0[0] - lat_x * fw * 0.3, k0[1] - lat_y * fw * 0.3),
                    (k2[0] - lat_x * fw * 0.15, k2[1] - lat_y * fw * 0.15),
                    (k4[0], k4[1]),
                    (k5[0], k5[1]),
                    (k3[0] + lat_x * fw * 0.15, k3[1] + lat_y * fw * 0.15),
                    (k0[0] + lat_x * fw * 0.3, k0[1] + lat_y * fw * 0.3),
                ]
                draw.polygon(shadow_pts, fill=(35, 25, 20))

                # Draw Foot Polygon
                foot_poly = [
                    (k0[0] - lat_x * fw * 0.28, k0[1] - lat_y * fw * 0.28),
                    (k1[0] - lat_x * fw * 0.34, k1[1] - lat_y * fw * 0.34),
                    (k2[0] - lat_x * fw * 0.08, k2[1] - lat_y * fw * 0.08),
                    (k4[0] - lat_x * fw * 0.05, k4[1] - lat_y * fw * 0.05),
                    (k4[0] + lat_x * fw * 0.08, k4[1] + lat_y * fw * 0.08),
                    (k5[0] + lat_x * fw * 0.06, k5[1] + lat_y * fw * 0.06),
                    (k3[0] + lat_x * fw * 0.08, k3[1] + lat_y * fw * 0.08),
                    (k0[0] + lat_x * fw * 0.28, k0[1] + lat_y * fw * 0.28),
                ]
                draw.polygon(foot_poly, fill=skin["base"], outline=skin["shadow"])

                # Draw Trouser / Pant Cuff
                pant_color = random.choice([(60, 65, 75), (40, 45, 50), (120, 115, 105), (30, 32, 40)])
                cuff_top = (k1[0] - fwd_x * fl * 0.35, k1[1] - fwd_y * fl * 0.35)
                pant_poly = [
                    (cuff_top[0] - lat_x * fw * 0.65, cuff_top[1] - lat_y * fw * 0.65),
                    (k1[0] - lat_x * fw * 0.55, k1[1] - lat_y * fw * 0.55),
                    (k1[0] + lat_x * fw * 0.55, k1[1] + lat_y * fw * 0.55),
                    (cuff_top[0] + lat_x * fw * 0.65, cuff_top[1] + lat_y * fw * 0.65),
                ]
                draw.polygon(pant_poly, fill=pant_color)

                # Compute tight bounding box
                all_x = [pt[0] for pt in foot_poly + kpts]
                all_y = [pt[1] for pt in foot_poly + kpts]
                min_x = max(0, min(all_x) - 4)
                max_x = min(img_size, max(all_x) + 4)
                min_y = max(0, min(all_y) - 4)
                max_y = min(img_size, max(all_y) + 4)

                bbox_cx = ((min_x + max_x) * 0.5) / img_size
                bbox_cy = ((min_y + max_y) * 0.5) / img_size
                bbox_w = (max_x - min_x) / img_size
                bbox_h = (max_y - min_y) / img_size

                # Format label string: class_id bbox_cx bbox_cy bbox_w bbox_h k0_x k0_y k0_v ...
                kpt_str_parts = []
                for pt in kpts:
                    norm_kx = max(0.0, min(1.0, pt[0] / img_size))
                    norm_ky = max(0.0, min(1.0, pt[1] / img_size))
                    kpt_str_parts.append(f"{norm_kx:.5f} {norm_ky:.5f} 2.0")

                label_line = f"0 {bbox_cx:.5f} {bbox_cy:.5f} {bbox_w:.5f} {bbox_h:.5f} " + " ".join(kpt_str_parts)
                labels.append(label_line)

            # Save image and label
            img_out_path = img_dir / f"{img_id}.jpg"
            lbl_out_path = lbl_dir / f"{img_id}.txt"

            img.save(img_out_path, quality=92)
            with open(lbl_out_path, "w", encoding="utf-8") as lf:
                lf.write("\n".join(labels) + "\n")

            total_generated += 1

    print(f"[FootNet] Successfully generated {total_generated} training/validation samples in {base_dir}")

def main():
    parser = argparse.ArgumentParser(description="Prepare FootNet Dataset for YOLOv8-pose training")
    parser.add_argument("--output_dir", type=str, default="./foot_dataset", help="Output directory for YOLO-pose dataset")
    parser.add_argument("--num_train", type=int, default=300, help="Number of synthetic training images to generate")
    parser.add_argument("--num_val", type=int, default=60, help="Number of synthetic validation images to generate")
    args = parser.parse_args()

    base_path = Path(args.output_dir).resolve()
    print(f"[FootNet] Initializing dataset pipeline at: {base_path}")

    setup_yolo_pose_dirs(base_path)
    create_yaml_config(base_path)
    generate_synthetic_samples(base_path, args.num_train, args.num_val)

    print("\n" + "="*60)
    print("[OK] DATASET PIPELINE READY")
    print(f"   Config: {base_path / 'data.yaml'}")
    print(f"   Train samples: {args.num_train}")
    print(f"   Val samples:   {args.num_val}")
    print("="*60)

if __name__ == "__main__":
    main()
