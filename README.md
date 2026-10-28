# HL7 Transform IT Act

<div align="center">

A privacy-first HL7 v2.5.1 generation pipeline for clinical datasets, built on top of `hl7_transform`.

Transforms source records into signed HL7 messages, pseudonymizes patient identity, streams pipeline progress to a web dashboard, and validates post-generation integrity.

![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-Frontend-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

</div>

## What It Does

- Generates HL7 v2.5.1 messages from MIMIC-IV and generic CSV datasets.
- Applies deterministic pseudonymization before patient data is written to HL7 fields.
- Appends a SHA-256 tamper-evident `ZSH` segment to every output message.
- Streams pipeline activity to a React dashboard over Server-Sent Events.
- Provides integrity validation, audit logging, breach scanning, lineage tracing, and compliance scoring.

## Why This Repo Exists

This repository extends the original [`hl7_transform`](https://github.com/pdyban/hl7_transform) library for a privacy-sensitive healthcare workflow. The core library remains intact while this project adds compliance-focused modules around it for anonymization, message signing, validation, and monitoring.

## Stack

- Backend: Python 3.8+, FastAPI, `hl7_transform`, `hl7apy`, pandas
- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4
- Data flow: CSV input -> transformation -> anonymization -> signed HL7 output -> integrity validation

## Project Layout

```text
hl7_transform_itact/
├── app.py                     # FastAPI backend + SSE endpoints
├── main.py                    # CLI entry point for pipeline runs
├── preprocess_mimic.py        # MIMIC-IV preprocessing
├── validate_integrity.py      # HL7 signature verification
├── pipelines/                 # MIMIC and generic dataset pipelines
├── hl7_transform/             # Original library + compliance extensions
├── frontend/                  # React dashboard
├── mappings/                  # HL7 field mappings
├── dataset/                   # Source CSV files (not tracked)
└── output/                    # Generated HL7 files (not tracked)
```

## Quick Start

### 1. Install backend dependencies

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python setup.py install
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Start the full app

```bash
bash start.sh
```

Development URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Run Pipelines

### MIMIC-IV pipeline

```bash
python main.py --type mimic --sample 50
```

### Generic CSV pipeline

```bash
python main.py --type generic --csv dataset/indian_liver_patient.csv --out output/liver/
```

## Validate Output Integrity

```bash
python validate_integrity.py
python validate_integrity.py output/10000032.hl7
```

Exit code `0` means all files passed. Exit code `1` means at least one file failed verification.

## Run the Backend and Frontend Separately

### Backend

```bash
python app.py
```

### Frontend

```bash
cd frontend
npm run dev
```

## Tests and Checks

```bash
python -m pytest hl7_transform/test/ -v
bash run_flake.sh
cd frontend && npm run lint
```

## Environment Tokens

- The dashboard expects `VITE_OPERATOR_TOKEN` to match the backend’s `OPERATOR_TOKEN`. Locally you can either let `start.sh` propagate the token (it mirrors `OPERATOR_TOKEN` into `VITE_OPERATOR_TOKEN` before spinning up Vite) or set both env vars manually: `export OPERATOR_TOKEN="<token>"` and `export VITE_OPERATOR_TOKEN="$OPERATOR_TOKEN"`.
- Pipeline, upload, download, and the compliance APIs reject requests that do not send `Authorization: Bearer <OPERATOR_TOKEN>`. `/api/health` stays open for readiness checks.
- `ADMIN_TOKEN` is a separate bearer token for admin-only actions: clearing the audit log, and revealing a name from the pseudonym vault. The vault page asks for it at reveal time. It is not written into the frontend bundle.
- When building the Docker image, pass the same operator token via `--build-arg OPERATOR_TOKEN=<token>` so the production bundle receives `VITE_OPERATOR_TOKEN`.

## Novel features

FHIR R4 export, a per-field PHI confidence report, and a reversible pseudonym vault are described in [FEATURES.md](FEATURES.md), including how to demo each one.

## Continuous Deployment

- The GitHub Actions workflow pushes `hl7-transform-itact` into your container registry (`REGISTRY_IMAGE`) when `REGISTRY_USERNAME`/`REGISTRY_PASSWORD` are set, tagging the image as `${{ github.sha }}` and `latest`.
- After the image push, the deploy job triggers Render’s API using `RENDER_SERVICE_ID` and `RENDER_API_KEY`, so the live service fetches the updated container.
- Set these repository secrets for CD to run:
  - `REGISTRY_IMAGE` (e.g., `docker.io/yourorg/hl7-transform-itact`)
  - `REGISTRY_USERNAME` and `REGISTRY_PASSWORD` for the registry
  - `RENDER_SERVICE_ID` and `RENDER_API_KEY` for `https://api.render.com/v1/services/{serviceId}/deploys`
- Render deploys only when the workflow runs on `master` pushes; feature branches just run the CI jobs before merging.

## Core Additions in This Fork

- `hl7_transform/anonymizer.py`: deterministic patient pseudonymization and note scrubbing
- `hl7_transform/integrity.py`: SHA-256 signing and `ZSH` segment creation
- `audit_logger.py`: structured compliance logging
- `breach_detector.py`: PII leak scanning
- `compliance_scorer.py`: rule-based compliance scoring
- `data_lineage.py`: source-to-HL7 traceability
- `risk_assessment.py`: risk matrix support
- `access_control.py`: RBAC simulation

## Compliance Focus

- DPDP Act 2023: de-identification and purpose-limited handling of personal data
- IT Act 2000: tamper evidence, auditability, and security controls for sensitive data workflows

## Notes for Contributors

- Do not modify the original core library files: `field.py`, `message.py`, `mapping.py`, `operations.py`, `transform.py`, `__main__.py`
- Use logging instead of `print` for runtime behavior
- Keep new compliance-related modules documented with module-level docstrings and legal references

## License

MIT License. See `LICENSE` for details.
