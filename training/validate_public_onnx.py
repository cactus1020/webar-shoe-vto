"""Check exported ONNX numerical agreement on real held-out image crops."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
import torch
import onnxruntime as ort
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument('--run', default='training/runs/public/cmu_pilot')
parser.add_argument('--images', default='training/public_cmu_pilot/images/test')
args = parser.parse_args()
run = Path(args.run)
torch.set_num_threads(4)
model = YOLO(str(run / 'weights/best.pt')).model.eval()
session = ort.InferenceSession(str(run / 'weights/best.onnx'), providers=['CPUExecutionProvider'])
input_name = session.get_inputs()[0].name
size = session.get_inputs()[0].shape[2]
records = []
for path in sorted(Path(args.images).glob('*.jpg'))[:3]:
    with Image.open(path) as image:
        image = image.convert('RGB')
        width, height = image.size
        # Preserve the whole visible image with a grey letterbox, as the current
        # web inference geometry does. Do not silently crop portrait feet away.
        scale = min(size / width, size / height)
        draw_width, draw_height = round(width * scale), round(height * scale)
        boxed = Image.new('RGB', (size, size), (114, 114, 114))
        resized = image.resize((draw_width, draw_height), Image.Resampling.BILINEAR)
        boxed.paste(resized, ((size - draw_width) // 2, (size - draw_height) // 2))
        pixels = np.asarray(boxed, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    with torch.no_grad():
        torch_output = model(torch.from_numpy(pixels))[0].numpy()
    onnx_output = session.run(None, {input_name: pixels})[0]
    if not np.isfinite(onnx_output).all() or onnx_output.shape != torch_output.shape:
        raise RuntimeError('Invalid real-image ONNX output')
    difference = np.abs(torch_output - onnx_output)
    if difference.max() > 0.01:
        raise RuntimeError(f'ONNX export disagreement: {difference.max()}')
    records.append({'image': path.name, 'shape': list(onnx_output.shape),
                    'max_absolute_difference': float(difference.max()),
                    'mean_absolute_difference': float(difference.mean())})
if len(records) != 3:
    raise RuntimeError('Three held-out images are required')
report = {'status': 'passed', 'tolerance': 0.01, 'preprocessing': 'full-image RGB letterbox, grey 114', 'records': records,
          'scope': 'Numerical export equivalence only; not mobile performance or sizing accuracy'}
(run / 'onnx_validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
