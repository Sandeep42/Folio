# PyInstaller spec for the Tauri sidecar binary.
# Build with: pyinstaller tauri_main.spec --noconfirm
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = []
binaries = []
hiddenimports = collect_submodules("app")

# yfinance and its transitive deps do a lot of dynamic importing that
# PyInstaller's static analysis can't see through.
for pkg in ["yfinance", "curl_cffi", "multitasking", "peewee", "frozendict", "platformdirs"]:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

hiddenimports += ["uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
                  "uvicorn.protocols", "uvicorn.protocols.http",
                  "uvicorn.protocols.http.auto", "uvicorn.protocols.websockets",
                  "uvicorn.protocols.websockets.auto", "uvicorn.lifespan",
                  "uvicorn.lifespan.on"]

a = Analysis(
    ["tauri_main.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="cas-analyzer-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
