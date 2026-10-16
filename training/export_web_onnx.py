"""
export_web_onnx.py
Quantizes, optimizes, and copies the trained FootNet ONNX model for WebAR deployment.
"""

import os
import sys
import shutil
import argparse
from pathlib import Path

def optimize_for_web(input_onnx: str, output_onnx: str = None, quantize: bool = False):
    in_path = Path(input_onnx).resolve()
    if not in_path.exists():
        raise FileNotFoundError(f"Input ONNX not found: {in_path}")

    out_path = Path(output_onnx).resolve() if output_onnx else in_path.parent / "footnet_nano_web.onnx"

    print(f"[FootNet] Optimizing {in_path.name} for WebGL / WebGPU browser runtime...")
    initial_size_mb = in_path.stat().st_size / (1024 * 1024)
    print(f"   Initial Size: {initial_size_mb:.2f} MB")

    # 1. Graph simplification
    try:
        import onnx
        import onnxsim
        print("   Running ONNX graph simplification...")
        model = onnx.load(str(in_path))
        model_simp, check = onnxsim.simplify(model)
        if check:
            onnx.save(model_simp, str(out_path))
            print("   [OK] Simplified graph saved.")
        else:
            shutil.copy(str(in_path), str(out_path))
    except Exception as e:
        print(f"   [Notice] onnxsim not available or failed ({e}), copying directly.")
        shutil.copy(str(in_path), str(out_path))

    # 2. Dynamic INT8 quantization (optional, drastically cuts size for mobile download)
    if quantize:
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType
            print("   Running dynamic INT8 quantization...")
            quant_path = out_path.parent / "footnet_nano_quant.onnx"
            quantize_dynamic(
                model_input=str(out_path),
                model_output=str(quant_path),
                weight_type=QuantType.QUInt8
            )
            out_path = quant_path
            print(f"   [OK] Quantized model saved: {quant_path.name}")
        except Exception as qe:
            print(f"   [Notice] Quantization skipped: {qe}")

    final_size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"   Final Web-Ready Model Size: {final_size_mb:.2f} MB")

    # 3. Deploy directly to webar-shoe-vto public/models
    web_models_dir = Path("e:/ai box E drive/webar-shoe-vto/public/models").resolve()
    if web_models_dir.exists():
        target_web_file = web_models_dir / "footnet_nano.onnx"
        shutil.copy(str(out_path), str(target_web_file))
        print(f"   [OK] Deployed to WebAR public folder: {target_web_file}")

    return out_path

def main():
    parser = argparse.ArgumentParser(description="Optimize FootNet ONNX for WebAR")
    parser.add_argument("--model", type=str, default="./runs/footnet/footnet_nano/weights/best.onnx", help="Path to input ONNX")
    parser.add_argument("--output", type=str, default="./footnet_nano.onnx", help="Output path")
    parser.add_argument("--quantize", action="store_true", help="Apply INT8 quantization")
    args = parser.parse_args()

    optimize_for_web(args.model, args.output, args.quantize)

if __name__ == "__main__":
    main()
