import asyncio
import io
import json
import logging
import os
import shutil
import time
import uuid
import zipfile
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pipelines.mimic_pipeline import build_hl7_message
from pipelines.generic_pipeline import run_generic_pipeline
from hl7_transform.anonymizer import Anonymizer
from hl7_transform.integrity import IntegrityManager
from hl7_transform.encryption import EncryptionComparator
from hl7_transform.audit_logger import AuditLogger
from hl7_transform.breach_detector import BreachDetector
from hl7_transform.compliance_scorer import ComplianceScorer
from hl7_transform.data_lineage import DataLineageTracker
from hl7_transform.risk_assessment import RiskAssessor
from hl7_transform.access_control import AccessControlSimulator
from hl7_transform.fhir_export import hl7_to_fhir_bundle
from hl7_transform.phi_report import build_phi_report
from hl7_transform.pseudonym_vault import PseudonymVault, VaultError
from preprocess_mimic import preprocess
from security import ApiRole, require_admin_role, require_operator_role

app = FastAPI()
logger = logging.getLogger("hl7_pipeline.app")

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "5")) * 1024 * 1024  # 5MB default
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")

# Stateless working directory (created per-run, cleaned after)
TEMP_ROOT = Path("temp")
TEMP_ROOT.mkdir(parents=True, exist_ok=True)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared compliance module instances (stateless — no patient data stored)
audit_logger = AuditLogger()
encryption_comparator = EncryptionComparator()
compliance_scorer = ComplianceScorer()
data_lineage = DataLineageTracker()
risk_assessor = RiskAssessor()
access_control = AccessControlSimulator()
vault = PseudonymVault.from_env()

# ---------------------------------------------------------------------------
# Short-lived download store (token → ZIP bytes, auto-expire after 15 min)
# ---------------------------------------------------------------------------
_download_store: Dict[str, dict] = {}  # token → {"data": bytes, "created": float}
_DOWNLOAD_TTL_SECONDS = 15 * 60

def _cleanup_expired_downloads():
    """Remove expired download tokens."""
    now = time.time()
    expired = [k for k, v in _download_store.items() if now - v["created"] > _DOWNLOAD_TTL_SECONDS]
    for k in expired:
        del _download_store[k]


# ---------------------------------------------------------------------------
# Short-lived encryption results store keyed by run ID
# ---------------------------------------------------------------------------
_encryption_results_store: Dict[str, dict] = {}  # run_id → {"results": list, "created": float}


def _normalize_run_id(raw_run_id: str) -> str:
    """Validate run IDs before using them in filesystem paths."""
    try:
        return str(uuid.UUID(raw_run_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=404, detail="Run directory not found.")


def _get_run_dir(raw_run_id: str, *, must_exist: bool = True) -> Tuple[str, Path]:
    """Return a validated temp run directory under TEMP_ROOT only."""
    run_id = _normalize_run_id(raw_run_id)
    run_dir = (TEMP_ROOT / run_id).resolve()
    if run_dir.parent != TEMP_ROOT.resolve():
        raise HTTPException(status_code=404, detail="Run directory not found.")
    if must_exist and not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run directory not found.")
    return run_id, run_dir


def _store_encryption_results(run_id: str, results: list) -> None:
    """Persist run-scoped encryption results for short-lived UI lookups."""
    _cleanup_expired_downloads()
    _encryption_results_store[run_id] = {"results": results, "created": time.time()}
    now = time.time()
    expired = [k for k, v in _encryption_results_store.items() if now - v["created"] > _DOWNLOAD_TTL_SECONDS]
    for k in expired:
        del _encryption_results_store[k]


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------
class RunConfig(BaseModel):
    dataset: str
    runId: str  # UUID of the temp dir where files were uploaded
    filePath: Optional[str] = None  # For backward compat with generic mode


class SinglePatientRequest(BaseModel):
    """Request body for single-patient HL7 generation."""
    fields: dict  # e.g. {"gender": "M", "age": "45", ...}
    observations: list  # e.g. [{"header": "BIL-TOT", "value": "1.2"}, ...]


class Record(BaseModel):
    id: str
    pseudonym: str
    sex: str
    cohort: str
    labEvents: int
    output: str
    seal: str


class FhirExportRequest(BaseModel):
    hl7: str


class PhiReportRequest(BaseModel):
    hl7: Optional[str] = None
    csv: Optional[str] = None


class VaultEnrollRequest(BaseModel):
    subject_id: str
    original_name: str


class VaultRevealRequest(BaseModel):
    subject_id: str
    reason: str


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    """Readiness probe for deployment platforms."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------------------
# Dataset Info (kept for landing page)
# ---------------------------------------------------------------------------
@app.get("/api/datasets")
async def get_datasets():
    return [
        {"id": "mimic", "name": "MIMIC-IV v3.1", "description": "Clinical research database (PhysioNet)"},
        {"id": "liver", "name": "Indian Liver Patient", "description": "Generic medical CSV workload"}
    ]


# ---------------------------------------------------------------------------
# File Upload — Stateless (saved to temp/{uuid}/)
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    _role: ApiRole = Depends(require_operator_role),
):
    """Upload a file for processing. Files are saved to a temp directory and
    deleted after processing completes. Max 5MB per file.

    [DPDP Act §8(1)] — Data collected only for declared processing purpose.
    """
    # Read contents and enforce size limit
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit. "
                   f"Please upload a smaller file."
        )

    # Sanitize filename
    safe_name = Path(file.filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Enforce allowed extensions
    allowed_extensions = {".csv", ".gz"}
    file_ext = Path(safe_name).suffix.lower()
    # .csv.gz has suffix .gz which is allowed
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file_ext}' not allowed. Only CSV and CSV.GZ files are accepted."
        )

    # Check for existing runId in form data or create new one
    # We use a query param approach: frontend sends runId if it already has one
    run_id = str(uuid.uuid4())
    run_dir = TEMP_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    file_path = run_dir / safe_name
    file_path.write_bytes(contents)

    audit_logger.log(
        event_type="FILE_UPLOADED",
        details={"filename": safe_name, "size_bytes": len(contents), "run_id": run_id},
        legal_reference="DPDP §8(1) (Data collection for processing)",
        severity="INFO",
    )

    return {"filename": safe_name, "path": str(file_path), "runId": run_id}


@app.post("/api/upload/{run_id}")
async def upload_file_to_run(
    run_id: str,
    file: UploadFile = File(...),
    _role: ApiRole = Depends(require_operator_role),
):
    """Upload additional files to an existing run directory (for MIMIC 3-file upload).

    [DPDP Act §8(1)] — Data collected only for declared processing purpose.
    """
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit."
        )

    safe_name = Path(file.filename).name
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    run_id, run_dir = _get_run_dir(run_id)

    file_path = run_dir / safe_name
    file_path.write_bytes(contents)

    audit_logger.log(
        event_type="FILE_UPLOADED",
        details={"filename": safe_name, "size_bytes": len(contents), "run_id": run_id},
        legal_reference="DPDP §8(1) (Data collection for processing)",
        severity="INFO",
    )

    return {"filename": safe_name, "path": str(file_path), "runId": run_id}


# ---------------------------------------------------------------------------
# Batch Pipeline — SSE streaming (stateless)
# ---------------------------------------------------------------------------
@app.post("/api/run")
async def run_pipeline(
    config: RunConfig,
    _role: ApiRole = Depends(require_operator_role),
):
    """Run the HL7 transformation pipeline on uploaded files.
    Streams results via SSE. At completion, emits a download token for the ZIP.
    All temp files are deleted after the ZIP is built.

    [IT Act §67C] — Record preservation during processing.
    """
    run_id, run_dir = _get_run_dir(config.runId)

    # Create output subdir within the run's temp dir
    out_dir = run_dir / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    async def event_generator():
        try:
            if config.dataset.lower().startswith("mimic"):
                # -------------------------------------------------------
                # MIMIC Pipeline — uses preprocess() on uploaded files
                # -------------------------------------------------------
                audit_logger.log(
                    event_type="PIPELINE_START",
                    details={"dataset": config.dataset, "mode": "batch_mimic", "run_id": run_id},
                    legal_reference="IT Act §67C (Record preservation)",
                    severity="INFO",
                )

                yield f"data: {json.dumps({'status': 'progress', 'stage': 0, 'message': 'Initializing Preprocessor'})}\n\n"
                await asyncio.sleep(0.1)

                # preprocess() reads from the temp dir where user uploaded MIMIC files
                df = preprocess(data_dir=str(run_dir), sample_size=999999)
                anonymizer = Anonymizer(locale="en_IN")
                integrity = IntegrityManager()

                patient_groups = list(df.groupby("subject_id"))
                total = len(patient_groups)

                yield f"data: {json.dumps({'status': 'progress', 'stage': 1, 'message': f'Ready to process {total} patients'})}\n\n"
                await asyncio.sleep(0.1)

                all_encryption_results = []

                for i, (subject_id, group) in enumerate(patient_groups):
                    audit_logger.log(
                        event_type="RECORD_INGESTED",
                        subject_id=str(subject_id),
                        details={"lab_events": len(group), "index": i},
                        legal_reference="DPDP §8(1) (Processing grounds)",
                        severity="INFO",
                    )

                    yield f"data: {json.dumps({'status': 'processing', 'subject_id': str(subject_id), 'index': i, 'total': total})}\n\n"

                    hl7_msg = build_hl7_message(subject_id=int(subject_id), patient_rows=group, anonymizer=anonymizer)

                    audit_logger.log(
                        event_type="PII_ANONYMISED",
                        subject_id=str(subject_id),
                        details={"method": "deterministic_pseudonymisation", "locale": "en_IN"},
                        legal_reference="DPDP §8(7) (De-identification)",
                        severity="INFO",
                    )

                    signed_msg = integrity.sign_message(hl7_msg)

                    audit_logger.log(
                        event_type="INTEGRITY_SEALED",
                        subject_id=str(subject_id),
                        details={"algorithm": "SHA-256", "segment": "ZSH"},
                        legal_reference="IT Act §14 (Secure Electronic Record)",
                        severity="INFO",
                    )

                    enc_results = encryption_comparator.compare(hl7_msg)
                    enc_dicts = [asdict(r) for r in enc_results]
                    all_encryption_results.append({
                        "subject_id": str(subject_id),
                        "results": enc_dicts,
                    })

                    audit_logger.log(
                        event_type="ENCRYPTION_APPLIED",
                        subject_id=str(subject_id),
                        details={
                            "algorithms": [r.name for r in enc_results],
                            "fastest_ms": min(r.time_ms for r in enc_results),
                            "slowest_ms": max(r.time_ms for r in enc_results),
                        },
                        legal_reference="IT Act §43A (Reasonable security practices)",
                        severity="INFO",
                    )

                    filename = f"{subject_id}.hl7"
                    out_file = out_dir / filename
                    with open(out_file, "w", encoding="utf-8") as fh:
                        fh.write(signed_msg)

                    first_row = group.iloc[0]
                    last_name, first_name = anonymizer.anonymize_name(int(subject_id))

                    record = {
                        "id": str(subject_id),
                        "pseudonym": f"{first_name} {last_name}",
                        "sex": str(first_row.get("gender", "U")),
                        "cohort": str(first_row.get("anchor_year", "N/A")),
                        "labEvents": len(group),
                        "output": filename,
                        "seal": "Valid",
                        "encryption": enc_dicts,
                        "content": signed_msg,
                    }

                    audit_logger.log(
                        event_type="RECORD_COMPLETE",
                        subject_id=str(subject_id),
                        details={"output_file": filename},
                        legal_reference="IT Act §67C (Record preserved)",
                        severity="INFO",
                    )

                    yield f"data: {json.dumps({'status': 'completed', 'record': record})}\n\n"
                    await asyncio.sleep(0.05)

                # Build ZIP in memory and store with a download token
                download_token = _build_and_store_zip(out_dir)

                audit_logger.log(
                    event_type="PIPELINE_END",
                    details={"total_records": total, "run_id": run_id},
                    legal_reference="IT Act §67C (Record preservation)",
                    severity="INFO",
                )

                _store_encryption_results(run_id, all_encryption_results)

                yield f"data: {json.dumps({'status': 'success', 'message': f'Processed {total} records successfully', 'downloadToken': download_token, 'encryptionResults': all_encryption_results, 'runId': run_id})}\n\n"

            elif config.dataset.lower().startswith("liver") or \
                 config.dataset.lower().startswith("generalized") or \
                 config.dataset.lower() == "ilpd" or \
                 config.filePath:
                # -------------------------------------------------------
                # Generic Pipeline
                # -------------------------------------------------------
                # Determine which CSV to process
                if config.filePath:
                    resolved = Path(config.filePath).resolve()
                    allowed_root = Path(str(run_dir)).resolve()
                    if not str(resolved).startswith(str(allowed_root)):
                        yield f"data: {json.dumps({'status': 'error', 'message': 'Invalid file path'})}\n\n"
                        return
                    csv_to_process = str(resolved)
                else:
                    # Find any CSV in the run dir
                    csv_files = list(run_dir.glob("*.csv"))
                    if not csv_files:
                        yield f"data: {json.dumps({'status': 'error', 'message': 'No CSV file found in upload'})}\n\n"
                        return
                    csv_to_process = str(csv_files[0])

                if not os.path.exists(csv_to_process):
                    yield f"data: {json.dumps({'status': 'error', 'message': f'File not found: {csv_to_process}'})}\n\n"
                    return

                df = pd.read_csv(csv_to_process)
                total = len(df)
                logger.debug("[Generic Pipeline] Dataframe length: %d", total)

                audit_logger.log(
                    event_type="PIPELINE_START",
                    details={"dataset": "generic", "file": csv_to_process, "total_records": total},
                    legal_reference="DPDP §8 (Data collection for processing)",
                    severity="INFO",
                )

                yield f"data: {json.dumps({'status': 'progress', 'stage': 0, 'message': 'Initializing Generic Pipeline'})}\n\n"
                await asyncio.sleep(0.1)

                anonymizer = Anonymizer(locale="en_IN")
                integrity = IntegrityManager()

                cols = df.columns.tolist()
                gender_col = next((c for c in cols if "gender" in c.lower() or "sex" in c.lower()), None)
                age_col = next((c for c in cols if "age" in c.lower()), None)
                numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
                if age_col and age_col in numeric_cols:
                    numeric_cols.remove(age_col)

                all_encryption_results = []

                for index, row in df.iterrows():
                    subject_id = 900000 + index

                    now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
                    segments = [
                        f"MSH|^~\\&|GENERIC_PIPELINE|CSV_SOURCE|||{now}||ORU^R01^ORU_R01|{index}|P|2.5.1"
                    ]

                    last, first = anonymizer.anonymize_name(subject_id)
                    gender = "U"
                    if gender_col:
                        g = str(row[gender_col]).upper()
                        if g.startswith("M"):
                            gender = "M"
                        elif g.startswith("F"):
                            gender = "F"

                    age = 0
                    if age_col:
                        try:
                            age = int(row[age_col])
                        except Exception:
                            pass

                    birth_year = datetime.now().year - age
                    segments.append(f"PID|1||{subject_id}^^^CSV^MR||{last}^{first}^^^||{birth_year}0101|{gender}")

                    obx_id = 1
                    for col in numeric_cols:
                        val = row[col]
                        segments.append(f"OBX|{obx_id}|NM|{col}^GENERIC||{val}||||||F")
                        obx_id += 1

                    hl7_msg = "\n".join(segments)

                    enc_results = encryption_comparator.compare(hl7_msg)
                    enc_dicts = [asdict(r) for r in enc_results]
                    all_encryption_results.append({
                        "subject_id": str(subject_id),
                        "results": enc_dicts,
                    })

                    signed_msg = integrity.sign_message(hl7_msg)

                    filename = f"gen_{subject_id}.hl7"
                    out_file = out_dir / filename
                    with open(out_file, "w", encoding="utf-8") as f:
                        f.write(signed_msg)

                    safe_data = {col: row[col] for col in numeric_cols if col in row.index}
                    record = {
                        "id": str(subject_id),
                        "pseudonym": f"{first} {last}",
                        "sex": gender,
                        "cohort": "Generic CSV",
                        "labEvents": len(numeric_cols),
                        "output": filename,
                        "seal": "Valid",
                        "encryption": enc_dicts,
                        "raw_data": safe_data,
                        "content": signed_msg,
                    }

                    yield f"data: {json.dumps({'status': 'completed', 'record': record})}\n\n"
                    await asyncio.sleep(0.05)

                download_token = _build_and_store_zip(out_dir)

                _store_encryption_results(run_id, all_encryption_results)

                yield f"data: {json.dumps({'status': 'success', 'message': f'Processed {total} records successfully', 'downloadToken': download_token, 'encryptionResults': all_encryption_results, 'runId': run_id})}\n\n"
            else:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Unsupported dataset'})}\n\n"

        except Exception as e:
            logging.error("Streaming error: %s", str(e))
            audit_logger.log(
                event_type="PIPELINE_END",
                details={"error": str(e)},
                legal_reference="DPDP §15 (Breach notification)",
                severity="ERROR",
            )
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
        finally:
            # Stateless cleanup — delete the entire temp run directory
            try:
                shutil.rmtree(run_dir, ignore_errors=True)
                logger.info("[Stateless] Cleaned up temp dir: %s", run_dir)
                audit_logger.log(
                    event_type="DATA_PURGED",
                    details={"run_id": run_id, "path": str(run_dir)},
                    legal_reference="DPDP §8(7) (Data minimisation — immediate deletion)",
                    severity="INFO",
                )
            except Exception as cleanup_err:
                logger.error("[Stateless] Cleanup failed: %s", cleanup_err)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _build_and_store_zip(out_dir: Path) -> str:
    """Build a ZIP from all .hl7 files in out_dir and store it with a download token."""
    _cleanup_expired_downloads()  # Housekeeping

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for hl7_file in out_dir.glob("*.hl7"):
            zf.write(hl7_file, arcname=hl7_file.name)

    zip_buffer.seek(0)
    token = str(uuid.uuid4())
    _download_store[token] = {
        "data": zip_buffer.getvalue(),
        "created": time.time(),
    }
    return token


# ---------------------------------------------------------------------------
# ZIP Download (token-based, one-time use)
# ---------------------------------------------------------------------------
@app.get("/api/download/{token}")
async def download_zip(
    token: str,
    _role: ApiRole = Depends(require_operator_role),
):
    """Serve the ZIP for a given download token, then invalidate it.

    [DPDP §8(7)] — Data minimisation: download tokens are single-use.
    """
    _cleanup_expired_downloads()

    entry = _download_store.pop(token, None)
    if not entry:
        raise HTTPException(status_code=404, detail="Download token expired or invalid. Files are no longer available.")

    zip_bytes = entry["data"]
    headers = {
        "Content-Disposition": (
            f'attachment; filename="hl7_output_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip"'
        )
    }
    return StreamingResponse(io.BytesIO(zip_bytes), media_type="application/zip", headers=headers)


# ---------------------------------------------------------------------------
# Single Patient Processing — SSE streaming (same UX as batch mode)
# ---------------------------------------------------------------------------
@app.post("/api/run-single")
async def run_single_patient(
    request: SinglePatientRequest,
    _role: ApiRole = Depends(require_operator_role),
):
    """Stream single-patient HL7 generation via SSE so the Dashboard
    can display identical pipeline stages as batch mode.

    [DPDP §8(7)] — Data minimisation: no persistence of patient data.
    [IT Act §14]  — Secure Electronic Record via SHA-256 signing.
    """
    def generate():
        try:
            run_id = str(uuid.uuid4())
            # Stage 0: Preprocessing
            yield f"data: {json.dumps({'status': 'progress', 'stage': 0, 'message': 'Validating patient fields...'})}\n\n"
            time.sleep(0.3)

            anonymizer = Anonymizer(locale="en_IN")
            integrity = IntegrityManager()

            subject_id_str = request.fields.get("subject_id", str(hash(str(request.fields)) % 900000 + 100000))
            subject_id = int(subject_id_str)
            gender = request.fields.get("gender", "U")
            if gender and len(gender) > 0:
                gender = gender[0].upper()
            age = 0
            try:
                age = int(request.fields.get("age", "0"))
            except (ValueError, TypeError):
                pass

            birth_year = datetime.now().year - age
            now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

            # Stage 1: Anonymization
            yield f"data: {json.dumps({'status': 'progress', 'stage': 1, 'message': 'Anonymizing patient identity...'})}\n\n"
            time.sleep(0.3)

            last_name, first_name = anonymizer.anonymize_name(subject_id)
            street, city, state, zipcode = anonymizer.anonymize_address(subject_id)
            pseudonym = f"{first_name} {last_name}"

            # Stage 2: HL7 Generation
            yield f"data: {json.dumps({'status': 'progress', 'stage': 2, 'message': 'Building HL7 v2.5.1 message...'})}\n\n"
            time.sleep(0.3)

            segments = [
                f"MSH|^~\\&|SINGLE_PATIENT|MANUAL_ENTRY|||{now}||ORU^R01^ORU_R01|{subject_id}|P|2.5.1"
            ]
            pid_address = f"{street}^^{city}^{state}^{zipcode}"
            segments.append(
                f"PID|1||{subject_id}^^^MANUAL^MR||"
                f"{last_name}^{first_name}^^^||"
                f"{birth_year}0101|{gender}|||"
                f"{pid_address}"
            )

            obx_id = 0
            for obs in request.observations:
                obx_id += 1
                header = obs.get("header", "UNKNOWN")
                value = obs.get("value", "")
                try:
                    float(value)
                    vtype = "NM"
                except (ValueError, TypeError):
                    vtype = "ST"
                segments.append(f"OBX|{obx_id}|{vtype}|{header}^MANUAL||{value}||||||F|||{now}")

            hl7_msg = "\n".join(segments)

            # Stage 3: Signing + Encryption
            yield f"data: {json.dumps({'status': 'progress', 'stage': 3, 'message': 'Applying SHA-256 integrity seal and encryption comparison...'})}\n\n"
            time.sleep(0.3)

            signed_msg = integrity.sign_message(hl7_msg)
            enc_results = encryption_comparator.compare(hl7_msg)
            enc_dicts = [asdict(r) for r in enc_results]

            # Audit
            audit_logger.log(
                event_type="SINGLE_PATIENT_PROCESSED",
                subject_id=str(subject_id),
                details={
                    "method": "manual_entry",
                    "observations_count": len(request.observations),
                    "anonymized": True,
                },
                legal_reference="DPDP §8(7) (De-identification) + IT Act §14 (Secure Electronic Record)",
                severity="INFO",
            )

            # Emit completed record (matches batch record shape)
            output_filename = f"patient_{subject_id}.hl7"
            record = {
                "id": str(subject_id),
                "pseudonym": pseudonym,
                "sex": gender,
                "cohort": "MANUAL",
                "labEvents": len(request.observations),
                "output": output_filename,
                "seal": "Valid",
                "content": signed_msg,
            }
            yield f"data: {json.dumps({'status': 'completed', 'record': record})}\n\n"

            # Store the signed message in a temp ZIP for download
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.writestr(output_filename, signed_msg)
            zip_buf.seek(0)
            token = str(uuid.uuid4())
            _download_store[token] = {"data": zip_buf.getvalue(), "created": time.time()}

            _store_encryption_results(run_id, [{"subject_id": str(subject_id), "results": enc_dicts}])

            # Stage 4: Success
            yield f"data: {json.dumps({'status': 'success', 'message': 'Processed 1 record successfully', 'downloadToken': token, 'encryptionResults': enc_dicts, 'runId': run_id})}\n\n"

        except Exception as e:
            logger.error("Single patient pipeline error: %s", str(e), exc_info=True)
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Single Patient Processing — direct response (legacy, kept for API compat)
# ---------------------------------------------------------------------------
@app.post("/api/process-single")
async def process_single_patient(
    request: SinglePatientRequest,
    _role: ApiRole = Depends(require_operator_role),
):
    """Generate a signed HL7 message from manually entered patient fields.
    No files are read or written — everything is in-memory.

    [DPDP §8(7)] — Data minimisation: no persistence of patient data.
    [IT Act §14]  — Secure Electronic Record via SHA-256 signing.
    """
    anonymizer = Anonymizer(locale="en_IN")
    integrity = IntegrityManager()

    # Extract demographics from fields
    subject_id = int(request.fields.get("subject_id", str(hash(str(request.fields)) % 900000 + 100000)))
    gender = request.fields.get("gender", "U")
    if gender and len(gender) > 0:
        gender = gender[0].upper()
    age = 0
    try:
        age = int(request.fields.get("age", "0"))
    except (ValueError, TypeError):
        pass

    birth_year = datetime.now().year - age
    now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

    last_name, first_name = anonymizer.anonymize_name(subject_id)
    street, city, state, zipcode = anonymizer.anonymize_address(subject_id)

    # Build HL7 segments
    segments = [
        f"MSH|^~\\&|SINGLE_PATIENT|MANUAL_ENTRY|||{now}||ORU^R01^ORU_R01|{subject_id}|P|2.5.1"
    ]

    pid_address = f"{street}^^{city}^{state}^{zipcode}"
    segments.append(
        f"PID|1||{subject_id}^^^MANUAL^MR||"
        f"{last_name}^{first_name}^^^||"
        f"{birth_year}0101|{gender}|||"
        f"{pid_address}"
    )

    # Build OBX segments from observations
    obx_id = 0
    for obs in request.observations:
        obx_id += 1
        header = obs.get("header", "UNKNOWN")
        value = obs.get("value", "")
        # Determine if numeric
        try:
            float(value)
            vtype = "NM"
        except (ValueError, TypeError):
            vtype = "ST"
        segments.append(f"OBX|{obx_id}|{vtype}|{header}^MANUAL||{value}||||||F|||{now}")

    hl7_msg = "\n".join(segments)

    # Sign with SHA-256
    signed_msg = integrity.sign_message(hl7_msg)

    # Encryption comparison
    enc_results = encryption_comparator.compare(hl7_msg)
    enc_dicts = [asdict(r) for r in enc_results]

    # Audit
    audit_logger.log(
        event_type="SINGLE_PATIENT_PROCESSED",
        subject_id=str(subject_id),
        details={
            "method": "manual_entry",
            "observations_count": len(request.observations),
            "anonymized": True,
        },
        legal_reference="DPDP §8(7) (De-identification) + IT Act §14 (Secure Electronic Record)",
        severity="INFO",
    )

    return {
        "hl7_message": signed_msg,
        "seal": "Valid",
        "encryption": enc_dicts,
        "pseudonym": f"{first_name} {last_name}",
        "subject_id": str(subject_id),
    }


# ---------------------------------------------------------------------------
# HL7 Content Viewer (reads from download store, not disk)
# ---------------------------------------------------------------------------
@app.get("/api/hl7/{filename}")
async def get_hl7_content(
    filename: str,
    _role: ApiRole = Depends(require_operator_role),
):
    """Serve HL7 content. In stateless mode, files may no longer be on disk
    after the run completes. This endpoint is used during active SSE streams
    when temp files still exist.
    """
    # Try to find the file in any active temp dir
    for run_dir in TEMP_ROOT.iterdir():
        if run_dir.is_dir():
            out_dir = run_dir / "output"
            file_path = out_dir / filename
            if file_path.exists():
                with open(file_path, "r") as f:
                    content = f.read()
                return {"content": content}

    raise HTTPException(status_code=404, detail="File not found. In stateless mode, files are deleted after download.")


# ---------------------------------------------------------------------------
# Existing endpoints (unchanged)
# ---------------------------------------------------------------------------
@app.get("/api/logs")
async def get_logs(
    _role: ApiRole = Depends(require_operator_role),
):
    log_file = Path("pipeline.log")
    if not log_file.exists():
        return {"logs": []}
    with open(log_file, "r") as f:
        lines = f.readlines()
    return {"logs": lines[-50:]}


@app.get("/api/encryption-comparison")
async def get_encryption_comparison(
    run_id: Optional[str] = None,
    _role: ApiRole = Depends(require_operator_role),
):
    """Return encryption comparison algorithms info."""
    results = []
    if run_id:
        normalized_run_id = _normalize_run_id(run_id)
        results = _encryption_results_store.get(normalized_run_id, {}).get("results", [])
    return {
        "results": results,
        "algorithms": ["SHA-256", "AES-256-CBC", "HMAC-SHA512", "SHA3-256"],
    }


@app.get("/api/audit-log")
async def get_audit_log(
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100,
    _role: ApiRole = Depends(require_operator_role),
):
    """Return structured audit log entries with optional filtering."""
    entries = audit_logger.get_entries(event_type=event_type, severity=severity, limit=limit)
    stats = audit_logger.get_stats()
    return {
        "entries": entries,
        "stats": stats,
    }


@app.post("/api/audit-log/clear")
async def clear_audit_log(
    _role: ApiRole = Depends(require_admin_role),
):
    """Clear the audit log. Requires admin authorization."""
    audit_logger.clear()
    audit_logger.log(
        event_type="AUDIT_LOG_CLEARED",
        details={"cleared_by": "admin"},
        legal_reference="IT Act §67C (Record preservation)",
        severity="WARNING",
    )
    return {"status": "cleared"}


@app.post("/api/breach-scan")
async def run_breach_scan(
    _role: ApiRole = Depends(require_operator_role),
):
    """Run a full breach detection scan on any active temp output directories."""
    audit_logger.log(
        event_type="BREACH_SCAN_START",
        details={"mode": "stateless"},
        legal_reference="DPDP §15 (Breach detection)",
        severity="INFO",
    )

    # In stateless mode, scan any currently active temp dirs
    # Create a temporary BreachDetector pointing to temp root
    detector = BreachDetector(output_dir=str(TEMP_ROOT))
    results = detector.full_scan()

    if results["summary"]["critical"] > 0 or results["summary"]["high"] > 0:
        audit_logger.log(
            event_type="BREACH_DETECTED",
            details=results["summary"],
            legal_reference="DPDP §15 (Breach notification required)",
            severity="CRITICAL",
        )

    return results


@app.get("/api/compliance-score")
async def get_compliance_score(
    _role: ApiRole = Depends(require_operator_role),
):
    """Calculate real-time compliance score across all pipeline controls."""
    return compliance_scorer.score(
        has_anonymizer=True,
        has_integrity=True,
        has_encryption=True,
        has_audit_log=True,
        has_breach_detector=True,
        output_dir=str(TEMP_ROOT),
    )


@app.get("/api/data-lineage")
async def get_data_lineage(
    _role: ApiRole = Depends(require_operator_role),
):
    """Return the complete data lineage graph."""
    return data_lineage.get_lineage()


@app.get("/api/data-lineage/{field_name}")
async def get_field_lineage(
    field_name: str,
    _role: ApiRole = Depends(require_operator_role),
):
    """Trace lineage for a specific field."""
    return data_lineage.get_field_lineage(field_name)


@app.get("/api/risk-assessment")
async def get_risk_assessment(
    _role: ApiRole = Depends(require_operator_role),
):
    """Return the complete risk assessment matrix."""
    return risk_assessor.assess()


@app.get("/api/access-control")
async def get_access_control(
    _role: ApiRole = Depends(require_operator_role),
):
    """Return all RBAC roles and permissions."""
    return access_control.get_roles()


@app.get("/api/access-control/matrix")
async def get_access_matrix(
    _role: ApiRole = Depends(require_operator_role),
):
    """Return the roles × resources access matrix."""
    return access_control.get_access_matrix()


@app.get("/api/access-control/check")
async def check_access(
    role: str,
    resource: str,
    action: str = "read",
    _role: ApiRole = Depends(require_operator_role),
):
    """Check if a role has access to a resource."""
    return access_control.check_access(role, resource, action)


@app.get("/api/stats")
async def get_stats(
    _role: ApiRole = Depends(require_operator_role),
):
    """Return aggregated stats for the landing page."""
    risk = risk_assessor.assess()
    score = compliance_scorer.score(
        has_anonymizer=True, has_integrity=True, has_encryption=True,
        has_audit_log=True, has_breach_detector=True, output_dir=str(TEMP_ROOT)
    )

    return {
        "legal_sections": 24,
        "offences": 14,
        "case_studies": 9,
        "records_processed": 0,  # Stateless — no persistent count
        "compliance_index": score["overall_score"],
        "risk_threats": risk["summary"]["total"],
        "system_state": "SECURE" if score["overall_score"] > 80 else "WARNING"
    }


# ---------------------------------------------------------------------------
# FHIR R4 export, PHI confidence report, pseudonym vault
# ---------------------------------------------------------------------------
@app.post("/api/fhir/export")
async def export_fhir(
    request: FhirExportRequest,
    _role: ApiRole = Depends(require_operator_role),
):
    """Export one transformed HL7 message as a FHIR R4 collection Bundle."""
    try:
        bundle = hl7_to_fhir_bundle(request.hl7)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit_logger.log(
        event_type="FHIR_EXPORT",
        details={"resources": len(bundle.get("entry", []))},
        legal_reference="DPDP §8(7) (Export of de-identified record)",
        severity="INFO",
    )
    return bundle


@app.post("/api/phi-report")
async def phi_report(
    request: PhiReportRequest,
    _role: ApiRole = Depends(require_operator_role),
):
    """Score PHI confidence for each field of an HL7 message or CSV."""
    try:
        report = build_phi_report(hl7=request.hl7, csv_text=request.csv)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit_logger.log(
        event_type="PHI_REPORT",
        details={
            "source": report["source"],
            "likely_phi": report["summary"]["likely_phi"],
            "fields_scanned": report["summary"]["fields_scanned"],
        },
        legal_reference="DPDP §8(4) (Data minimisation)",
        severity="INFO",
    )
    return report


@app.get("/api/vault")
async def vault_snapshot(_role: ApiRole = Depends(require_operator_role)):
    """List enrolled pseudonyms and the reveal audit log. No plaintext."""
    return vault.snapshot()


@app.post("/api/vault/enroll")
async def vault_enroll(
    request: VaultEnrollRequest,
    role: ApiRole = Depends(require_operator_role),
):
    """Store an original name as ciphertext and return the pipeline pseudonym."""
    try:
        result = vault.enroll(request.subject_id, request.original_name, actor=role.value)
    except VaultError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit_logger.log(
        event_type="VAULT_ENROLL",
        subject_id=result["subject_id"],
        details={"pseudonym": result["pseudonym"], "updated": result["updated"]},
        legal_reference="DPDP §8(7) (Pseudonymisation)",
        severity="INFO",
    )
    return result


@app.post("/api/vault/reveal")
async def vault_reveal(
    request: VaultRevealRequest,
    role: ApiRole = Depends(require_admin_role),
):
    """Decrypt one original name. Admin only. The reason is audited."""
    try:
        result = vault.reveal(request.subject_id, request.reason, actor=role.value)
    except KeyError:
        raise HTTPException(status_code=404, detail="Subject is not enrolled")
    except VaultError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit_logger.log(
        event_type="VAULT_REVEAL",
        subject_id=result["subject_id"],
        details={"reason": result["reason"], "actor": role.value},
        legal_reference="IT Act §72A (Disclosure of identity)",
        severity="WARNING",
    )
    return result


# ---------------------------------------------------------------------------
# Static file serving (production: serve frontend/dist/)
# ---------------------------------------------------------------------------
if os.path.isdir("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
