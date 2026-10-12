import os, sys
from pathlib import Path

achadas = []
for base in sys.path:
    n = Path(base) / "nvidia"
    if n.is_dir():
        for b in n.glob("*/bin"):
            os.add_dll_directory(str(b))
            os.environ["PATH"] = str(b) + os.pathsep + os.environ["PATH"]
            achadas.append(str(b))

print("Pastas registradas:", len(achadas))
for a in achadas:
    print(" -", a)

import ctranslate2
print("GPUs CUDA:", ctranslate2.get_cuda_device_count())
