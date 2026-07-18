"""Entry point for the PyInstaller-frozen backend used by the Tauri desktop
build. Not used by the Docker/web deployment (that runs `uvicorn app.main:app`
directly) — this just binds the same FastAPI app to a fixed localhost port
so the Tauri sidecar has a stable address to talk to.
"""
import os

import uvicorn

from app.main import app

if __name__ == "__main__":
    port = int(os.environ.get("CAS_ANALYZER_PORT", "8756"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
