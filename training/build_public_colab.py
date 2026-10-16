"""Generate a self-contained Colab notebook from the audited training scripts."""
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
cells = []


def cell(kind, text):
    result = {"cell_type": kind, "metadata": {}, "source": text.splitlines(keepends=True)}
    if kind == "code":
        result.update(execution_count=None, outputs=[])
    cells.append(result)


cell("markdown", """# Public CMU FootNet training
Select **Runtime → Change runtime type → T4 GPU**, then Run all.
This notebook downloads real CMU/COCO data, trains a six-slot pose model, evaluates
on separate images and exports a candidate ONNX. It does not train metric sizing.
CMU annotations: CC BY 4.0. Retain original COCO image licenses and attribution.
K2/K3 are unlabelled; no guessed metatarsal coordinates are used.
The annotation mirror is pinned; its license does not supersede upstream terms.
""")
cell("code", "%pip install -q ultralytics==8.4.143 onnx onnxruntime pillow pyyaml\n")
cell("code", """import torch
print('CUDA:', torch.cuda.is_available())
if not torch.cuda.is_available():
    raise RuntimeError('Select a GPU runtime before the full run.')
print(torch.cuda.get_device_name(0))
""")
for name in ("prepare_public_cmu.py", "train_public_footnet.py", "validate_public_onnx.py"):
    cell("code", f"%%writefile {name}\n" + (root / name).read_text(encoding="utf-8"))
cell("markdown", """Default GPU run: 4,000 train, 120 validation and 120 held-out test images,
60 epochs at 256px. An image is never in more than one split. COCO does not provide
subject IDs, so subject overlap cannot be ruled out. Reduce `--train-images` for a
quick pilot. Free sessions may disconnect; download checkpoints before stopping.
""")
cell("code", """import subprocess, sys
from pathlib import Path
from train_public_footnet import audit_dataset
def run_stream(command):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, bufsize=1)
    for line in process.stdout:
        print(line, end='', flush=True)
    code = process.wait()
    if code:
        raise subprocess.CalledProcessError(code, command)

data_path = Path('/content/public_cmu/data.yaml')
if data_path.exists():
    print('Reusing audited dataset:', audit_dataset(data_path)['image_counts'])
else:
    run_stream([sys.executable, '-u', 'prepare_public_cmu.py', '--output', '/content/public_cmu',
                    '--train-images', '4000', '--val-images', '120', '--test-images', '120',
                    '--workers', '12'])
""")
cell("code", """run_stream([sys.executable, '-u', 'train_public_footnet.py', '--data', '/content/public_cmu/data.yaml',
                '--weights', 'yolov8n-pose.pt', '--epochs', '60', '--batch', '32',
                '--device', '0', '--freeze', '0', '--project', '/content/runs',
                '--name', 'cmu_public_gpu'])
""")
cell("code", """from pathlib import Path
import json, shutil
reports = sorted(Path('/content/runs').glob('*/training_report.json'), key=lambda p: p.stat().st_mtime)
if not reports:
    raise RuntimeError('Training did not finish; inspect the preceding cell.')
report_path = reports[-1]
run_stream([sys.executable, '-u', 'validate_public_onnx.py', '--run', str(report_path.parent),
            '--images', '/content/public_cmu/images/test'])
shutil.copy('/content/public_cmu/manifest.json', report_path.parent / 'dataset_manifest.json')
print(report_path.read_text())
shutil.make_archive('/content/footnet_public_results', 'zip', report_path.parent)
from google.colab import files
files.download('/content/footnet_public_results.zip')
""")
notebook = {"cells": cells, "metadata": {"colab": {"name": "Public_CMU_FootNet_Training.ipynb"},
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "accelerator": "GPU"}, "nbformat": 4, "nbformat_minor": 5}
destination = root / "Public_CMU_FootNet_Training.ipynb"
destination.write_text(json.dumps(notebook, indent=2, ensure_ascii=False), encoding="utf-8")
with zipfile.ZipFile(root / "public_training_bundle.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for name in ("prepare_public_cmu.py", "train_public_footnet.py", "validate_public_onnx.py", destination.name):
        bundle.write(root / name, name)
print(destination)
