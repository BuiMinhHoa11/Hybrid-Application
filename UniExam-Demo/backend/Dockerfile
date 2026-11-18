FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY database ./database
RUN pip install --no-cache-dir --no-deps ./database
COPY backend/pyproject.toml ./backend/
COPY backend/uniexam ./backend/uniexam
RUN pip install --no-cache-dir --no-deps ./backend && useradd --uid 10001 --create-home app
USER app
CMD ["uvicorn", "uniexam.public_app:app", "--host", "0.0.0.0", "--port", "4000"]
