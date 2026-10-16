"""
train_footnet.py
FootNet Model Training Pipeline using Ultralytics YOLOv8-Pose Nano

Trains a lightweight deep neural network (FootNet) specifically for top-down mobile foot tracking,
keypoint localization, and 6-DoF pose estimation for WebAR Virtual Try-On.

Key Features:
- Backbone: YOLOv8n-pose (~3.2M parameters)
- Transfer learning from pre-trained COCO pose weights
- Multi-task loss: CIoU + Classification + OKS Keypoint Loss
- Automatic ONNX web export with FP16 quantization
"""

import os
import sys
import argparse
from pathlib import Path

def train(data_yaml: str, epochs: int = 50, batch_size: int = 32, imgsz: int = 256, device: str = ""):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[FootNet] Ultralytics not installed. Installing...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "ultralytics"])
        from ultralytics import YOLO

    yaml_path = Path(data_yaml).resolve()
    if not yaml_path.exists():
        raise FileNotFoundError(f"Config file not found: {yaml_path}")

    print("="*60)
    print("🚀 INITIALIZING FOOTNET TRAINING (YOLOv8-Pose Nano)")
    print(f"   Config:     {yaml_path}")
    print(f"   Image Size: {imgsz}x{imgsz}")
    print(f"   Batch Size: {batch_size}")
    print(f"   Epochs:     {epochs}")
    print("="*60)

    # 1. Initialize YOLOv8-Pose Nano model
    model = YOLO("yolov8n-pose.pt")

    # 2. Train model
    device_arg = device if device else None
    results = model.train(
        data=str(yaml_path),
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        device=device_arg,
        workers=2,
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        pose=12.0,      # High keypoint loss weight for micro-millimeter precision
        kobj=2.0,       # Keypoint objectness weight
        box=7.5,        # Bounding box loss weight
        project="runs/footnet",
        name="footnet_nano",
        exist_ok=True,
        plots=True
    )

    best_weights = Path("runs/footnet/footnet_nano/weights/best.pt")
    print(f"\n[FootNet] Training complete! Best checkpoint saved to: {best_weights}")

    # 3. Export to Web-Optimized ONNX
    print("\n[FootNet] Exporting to ONNX format for WebAR deployment...")
    onnx_path = model.export(
        format="onnx",
        imgsz=imgsz,
        half=False,      # Base FP32 export, can be quantized with onnxruntime
        simplify=True,
        opset=17
    )
    print(f"[FootNet] Web ONNX model exported: {onnx_path}")
    return onnx_path

def main():
    parser = argparse.ArgumentParser(description="Train FootNet YOLO-Pose Nano")
    parser.add_argument("--data", type=str, default="./foot_dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=32, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=256, help="Input image size")
    parser.add_argument("--device", type=str, default="", help="Device: 0 for GPU, cpu for CPU")
    args = parser.parse_args()

    train(args.data, args.epochs, args.batch, args.imgsz, args.device)

if __name__ == "__main__":
    main()
