FROM python:3.12-slim AS base

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app

COPY apps/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend

FROM base AS development
CMD ["uvicorn", "app.main:asgi_app", "--host", "0.0.0.0", "--port", "4000", "--reload"]

FROM base AS production
CMD ["uvicorn", "app.main:asgi_app", "--host", "0.0.0.0", "--port", "4000"]
