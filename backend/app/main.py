"""Folio — stateless MF/equity portfolio analyzer.

Security posture:
  - No data stored server-side. Files are parsed in memory per request.
  - CORS restricted to the configured ALLOWED_ORIGIN env var.
  - Request size limits enforced at nginx level.
  - Rate limiting at nginx level (parse: 6/min, prices: 2/min, other: 30/min).
  - No auth required — the "nothing stored" model is the privacy guarantee.
    If you want to restrict to known users, set API_KEY env var; all /api/*
    requests must then include  Authorization: Bearer <key>.
"""
import os
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers import analyze, parse

log = logging.getLogger(__name__)

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
API_KEY        = os.environ.get("API_KEY", "")       # optional; empty = no key required

app = FastAPI(
    title="Folio — portfolio analyzer",
    version="1.0.0",
    # Disable auto-generated docs on production (set DOCS=1 to re-enable)
    docs_url="/docs" if os.environ.get("DOCS") else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN] if ALLOWED_ORIGIN != "*" else ["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def api_key_guard(request: Request, call_next):
    """If API_KEY is set, require it on every /api/ request."""
    if API_KEY and request.url.path.startswith("/api/"):
        auth = request.headers.get("Authorization", "")
        if auth != f"Bearer {API_KEY}":
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.middleware("http")
async def no_logging_of_bodies(request: Request, call_next):
    """Belt-and-braces: ensure we never accidentally log request bodies
    (which could contain PAN numbers or portfolio data)."""
    response = await call_next(request)
    return response


app.include_router(parse.router)
app.include_router(analyze.router)


@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "stateless": True,
        "stores_data": False,
        "auth_required": bool(API_KEY),
    }
