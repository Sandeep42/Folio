#!/usr/bin/env python3
"""Freezes the FastAPI backend into a standalone binary with PyInstaller and
drops it into src-tauri/binaries/ under the name Tauri's sidecar loader
expects (binary name + "-" + rustc host triple [+ .exe on Windows]).

Cross-platform (macOS/Linux/Windows) so it can run the same way locally and
in GitHub Actions matrix builds.
"""
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
VENV_DIR = BACKEND_DIR / ".venv"
IS_WINDOWS = sys.platform.startswith("win")
VENV_PY = VENV_DIR / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")


def run(cmd, **kwargs):
    print("+", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, check=True, cwd=BACKEND_DIR, **kwargs)


def main():
    if not VENV_DIR.exists():
        run([sys.executable, "-m", "venv", str(VENV_DIR)])

    run([str(VENV_PY), "-m", "pip", "install", "-q", "--upgrade", "pip"])
    run([str(VENV_PY), "-m", "pip", "install", "-q", "-r", "requirements.txt", "pyinstaller"])

    for d in (BACKEND_DIR / "build", BACKEND_DIR / "dist"):
        if d.exists():
            shutil.rmtree(d)

    run([str(VENV_PY), "-m", "PyInstaller", "tauri_main.spec", "--noconfirm"])

    triple = subprocess.run(
        ["rustc", "-Vv"], check=True, capture_output=True, text=True
    ).stdout
    host = next(line.split(":", 1)[1].strip() for line in triple.splitlines() if line.startswith("host:"))

    dest_dir = BACKEND_DIR.parent / "src-tauri" / "binaries"
    dest_dir.mkdir(parents=True, exist_ok=True)

    src_name = "cas-analyzer-backend.exe" if IS_WINDOWS else "cas-analyzer-backend"
    dest_name = f"cas-analyzer-backend-{host}{'.exe' if IS_WINDOWS else ''}"
    src = BACKEND_DIR / "dist" / src_name
    dest = dest_dir / dest_name
    shutil.copy2(src, dest)
    print(f"Sidecar binary written to {dest}")


if __name__ == "__main__":
    main()
