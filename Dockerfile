# Stage 1: Build frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
ARG OPERATOR_TOKEN
ENV VITE_OPERATOR_TOKEN=${OPERATOR_TOKEN}
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY requirements.txt setup.py setup.cfg README.md ./
COPY hl7_transform/ hl7_transform/
RUN pip install --no-cache-dir -r requirements.txt && python setup.py install

# Copy application code
COPY pipelines/ pipelines/
COPY app.py security.py preprocess_mimic.py validate_integrity.py ./

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create temp directory for stateless processing
RUN mkdir -p temp

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
