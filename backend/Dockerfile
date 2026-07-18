# Backend: FastAPI + PyMuPDF (ships manylinux wheels, so slim base is fine)
FROM python:3.12-slim

WORKDIR /app

# Layer-cache dependencies separately from source
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# data/ holds portfolio.json + isin_symbols.csv — mounted as a volume in compose

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
