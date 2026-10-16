"""Generate a credential-free cloud notebook for a data-only barefoot COCO ZIP."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
cells = []


def cell(kind, source):
    value = {"cell_type": kind, "metadata": {}, "source": source.splitlines(keepends=True)}
    if kind == "code":
        value.update(execution_count=None, outputs=[])
    cells.append(value)


cell("markdown", """# Public barefoot heel/toe fine-tuning — Colab GPU
Select **Runtime → Change runtime type → T4 GPU**.
This notebook does not use Roboflow training credits, API keys, or Google Drive mounts.
Upload only the official **Foot Keypoints Detection v5 COCO data ZIP**.
An optional checkpoint must match the project's known CMU pilot hash below.

Publisher: AI Training, Roboflow Universe. Declared license: Public Domain / CC0.
Source: https://universe.roboflow.com/ai-training-rvswa/foot-keypoints-detection/dataset/5
The publisher reports 820 unaugmented images (574/164/82); actual usable counts
are calculated after import. This is not a verified subject- or video-separated split.

Downloaded code is never executed. ZIP paths, file types, sizes and links are
checked before data is read. Images are decoded and newly encoded. These checks
reduce risk but are not a malware-free certification. No millimeter foot measurements,
metatarsal labels or shoe-fit outcomes are available, so this is not a sizing model.
""")
cell("code", "%pip install -q ultralytics==8.4.143 onnx onnxruntime pillow pyyaml\n")
cell("code", """import torch
if not torch.cuda.is_available():
    raise RuntimeError('GPU required. Select a T4 runtime; no silent CPU fallback.')
print('CUDA:', torch.cuda.is_available(), 'GPU:', torch.cuda.get_device_name(0))
""")
for name in ("prepare_public_barefoot.py", "train_public_footnet.py", "validate_public_onnx.py"):
    cell("code", f"%%writefile {name}\n" + (root / name).read_text(encoding="utf-8"))

trusted_checkpoint = root / "runs/public/cmu_pilot/weights/best.pt"
trusted_hash = hashlib.sha256(trusted_checkpoint.read_bytes()).hexdigest()
cell("markdown", """## Data input
Upload the COCO ZIP. Optionally upload the trusted project checkpoint `best.pt`
from the previous CMU pilot; its SHA-256 must match the embedded hash.
Do not upload private phone captures, credentials, vendor scripts or arbitrary weights.
Files remain in the temporary Colab runtime; download results before it disconnects.
""")
cell("code", f"""from google.colab import files
from pathlib import Path
import hashlib

uploaded = files.upload()
zips = [name for name in uploaded if Path(name).suffix.lower() == '.zip']
weights = [name for name in uploaded if Path(name).suffix.lower() == '.pt']
if len(zips) != 1 or len(weights) > 1 or len(uploaded) != len(zips) + len(weights):
    raise ValueError('Upload one public COCO ZIP and optionally the trusted best.pt only.')
dataset_zip = Path(zips[0]).resolve()
initial_weights = 'yolov8n-pose.pt'  # official Ultralytics pretrained weights
baseline_weights = ''
if weights:
    checkpoint = Path(weights[0]).resolve()
    if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != '{trusted_hash}':
        raise ValueError('Unrecognised checkpoint; do not load or execute arbitrary weights.')
    initial_weights = str(checkpoint)
    baseline_weights = str(checkpoint)
print('Dataset ZIP SHA-256:', hashlib.sha256(dataset_zip.read_bytes()).hexdigest())
""")
cell("code", """from prepare_public_barefoot import prepare
from train_public_footnet import audit_dataset

data_dir = Path('/content/public_barefoot_rf5')
if (data_dir / 'data.yaml').exists():
    manifest = audit_dataset(data_dir / 'data.yaml')
    if manifest['archive_sha256'] != hashlib.sha256(dataset_zip.read_bytes()).hexdigest():
        raise ValueError('Runtime contains a different dataset. Use a clean runtime.')
else:
    manifest = prepare(dataset_zip, data_dir)
    audit_dataset(data_dir / 'data.yaml')
print('Actual images:', manifest['image_counts'])
print('Actual labelled feet:', manifest['foot_counts'])
print('Split limitation:', manifest['split_policy'])
""")
cell("code", """import subprocess, sys

# Forward logs to notebook output instead of losing subprocess stdout.
def run_stream(command):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, bufsize=1)
    for line in process.stdout:
        print(line, end='', flush=True)
    code = process.wait()
    if code:
        raise subprocess.CalledProcessError(code, command)

command = [sys.executable, '-u', 'train_public_footnet.py', '--data', str(data_dir / 'data.yaml'),
           '--weights', initial_weights, '--epochs', '60', '--batch', '32', '--imgsz', '256',
           '--device', '0', '--freeze', '0', '--project', '/content/runs', '--name', 'barefoot_rf5_gpu']
if baseline_weights:
    command += ['--baseline', baseline_weights]
run_stream(command)
""")
cell("code", """import json, shutil

reports = sorted(Path('/content/runs').glob('barefoot_rf5_gpu*/training_report.json'),
                 key=lambda path: path.stat().st_mtime)
if not reports:
    raise RuntimeError('Training has not completed; no release candidate is ready.')
report_path = reports[-1]
run_stream([sys.executable, '-u', 'validate_public_onnx.py', '--run', str(report_path.parent),
            '--images', str(data_dir / 'images/test')])
report = json.loads(report_path.read_text())
print('Trained UTC:', report['created_utc'])
print('Actual epochs:', report['actual_epochs'])
print('Held-out pose metrics (not sizing accuracy):', report['heldout_test'])
print('Candidate ONNX SHA-256:', report['onnx_sha256'])
shutil.copy(data_dir / 'manifest.json', report_path.parent / 'dataset_manifest.json')
result_zip = shutil.make_archive('/content/barefoot_public_results', 'zip', report_path.parent)
files.download(result_zip)
""")

notebook = {"cells": cells, "metadata": {"colab": {"name": "Public_Barefoot_FineTuning.ipynb"},
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "accelerator": "GPU"}, "nbformat": 4, "nbformat_minor": 5}
destination = root / "Public_Barefoot_FineTuning.ipynb"
destination.write_text(json.dumps(notebook, indent=2, ensure_ascii=False), encoding="utf-8")
print(destination)
