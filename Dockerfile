FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Built from the repository root: the app needs both Backend/ (Python, data)
# and Frontend/ (templates, static files). Railway's Root Directory must be /.
WORKDIR /app

COPY Backend/requirements.txt Backend/
RUN python -m pip install --upgrade pip \
    && python -m pip install -r Backend/requirements.txt

COPY Backend/ Backend/
COPY Frontend/ Frontend/

WORKDIR /app/Backend

# One worker process, several threads: the simulation gate, progress counter
# and graph caches are process-global, and a minutes-long simulation must not
# block /simulation-status polls, /check-pin or static files while it runs.
CMD ["sh", "-c", "exec gunicorn app:app --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 8 --timeout 300"]
