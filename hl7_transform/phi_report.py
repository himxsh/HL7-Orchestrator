"""
Per-field PHI confidence report.
================================
Scores each populated HL7 field, or each column of a small CSV, with a
confidence that it is personal data. Field role (PID-5 is a name) and
value shape (Aadhaar, PAN, email, phone) are combined. The raw value is
not returned once confidence reaches the review band; callers get a
masked preview.

This is a classification report for a privacy review. Residual-leak
scanning of finished files stays in ``breach_detector.py``.

Compliance reference
--------------------
- DPDP Act 2023 §8(4): know which fields are personal data before
  deciding they are necessary for the purpose.
- DPDP Act 2023 §8(7): de-identification starts from an inventory of
  identifiers, not from a single yes/no scan.
- IT Act 2000 §43A: a written finding is part of reasonable security
  practice for sensitive personal data.
"""

import csv
import logging
import re
from io import StringIO
from typing import List, Optional, Tuple

from hl7_transform.er7 import segment_rows

logger = logging.getLogger("hl7_pipeline.phi")

_LIKELY = 0.75
_REVIEW = 0.4

# hl7 field -> (phi_type, base confidence, reason, label)
_FIELD_PRIORS = {
    "PID-2": ("identifier", 0.70, "PID-2 is an external patient id", "External patient id"),
    "PID-3": ("identifier", 0.92, "PID-3 is the patient identifier list", "Patient identifier"),
    "PID-5": ("name", 0.97, "PID-5 is the patient name", "Patient name"),
    "PID-6": ("name", 0.75, "PID-6 is the mother's maiden name", "Mother's maiden name"),
    "PID-7": ("birth_date", 0.95, "PID-7 is the date of birth", "Date of birth"),
    "PID-8": ("quasi_identifier", 0.35, "PID-8 is administrative sex", "Administrative sex"),
    "PID-11": ("address", 0.94, "PID-11 is the patient address", "Patient address"),
    "PID-13": ("phone", 0.93, "PID-13 is a home phone", "Home phone"),
    "PID-14": ("phone", 0.90, "PID-14 is a business phone", "Business phone"),
    "PID-18": ("identifier", 0.80, "PID-18 is a patient account number", "Account number"),
    "PID-19": ("government_id", 0.99, "PID-19 is the SSN", "SSN"),
    "NK1-2": ("name", 0.90, "NK1-2 is a next-of-kin name", "Next-of-kin name"),
    "NK1-4": ("address", 0.85, "NK1-4 is a next-of-kin address", "Next-of-kin address"),
    "NK1-5": ("phone", 0.88, "NK1-5 is a next-of-kin phone", "Next-of-kin phone"),
    "NTE-3": ("free_text", 0.40, "NTE-3 is free text and often carries leaked identifiers", "Comment"),
    "OBX-5": ("clinical_value", 0.08, "OBX-5 is an observation value", "Observation value"),
    "OBX-7": ("clinical_value", 0.02, "OBX-7 is a reference range", "Reference range"),
    "PV1-7": ("name", 0.70, "PV1-7 is the attending doctor", "Attending doctor"),
}

_DEFAULT_PRIOR = ("context", 0.05, "No standard PHI role for this field", "")

_PATTERNS = (
    ("government_id", 0.98, "Value matches an SSN pattern", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("government_id", 0.97, "Value matches an Aadhaar pattern", re.compile(r"\b\d{4}[\s\-]\d{4}[\s\-]\d{4}\b")),
    ("government_id", 0.96, "Value matches a PAN pattern", re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")),
    ("email", 0.95, "Value matches an email address", re.compile(
        r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
    )),
    ("phone", 0.90, "Value matches a phone number", re.compile(
        r"(?:\+?91[\s\-]?)?[6-9]\d{9}\b|\(\d{3}\)[\s\-]?\d{3}[\s\-]?\d{4}\b"
    )),
    ("name", 0.72, "Value matches a person-name shape", re.compile(
        r"\b[A-Z][a-z]{1,20}(?:[\s^][A-Z][a-z]{1,20})+\b"
    )),
)

_COLUMN_HINTS = (
    (("date of birth", "birth date", "dob", "birthdate"), "birth_date", 0.94, "Column name is a date of birth"),
    (("aadhaar", "ssn", "social security", "pan"), "government_id", 0.98, "Column name is a government identifier"),
    (("e-mail", "email"), "email", 0.95, "Column name is an email address"),
    (("phone", "mobile", "telephone"), "phone", 0.92, "Column name is a phone number"),
    (("address", "street", "postal", "zipcode", "zip code", "city"), "address", 0.88, "Column name is an address part"),
    (("patient name", "full name", "first name", "last name", "surname", "given name"), "name", 0.96, "Column name is a personal name"),
    (("mrn", "subject id", "patient id", "uhid"), "identifier", 0.90, "Column name is a patient identifier"),
    (("name",), "name", 0.80, "Column name contains a personal name"),
    (("age", "gender", "sex"), "quasi_identifier", 0.55, "Column name is a quasi-identifier"),
)


def build_phi_report(hl7: Optional[str] = None, csv_text: Optional[str] = None) -> dict:
    """
    Score one HL7 message or one CSV table.

    Parameters
    ----------
    hl7 : str, optional
        ER7 message.
    csv_text : str, optional
        CSV text with a header row and optional sample rows.

    Returns
    -------
    dict
        ``fields`` sorted by descending confidence, plus a ``summary``.

    Raises
    ------
    ValueError
        If neither input is provided, or the HL7 text has no segments.
    """
    has_hl7 = bool(hl7 and hl7.strip())
    has_csv = bool(csv_text and csv_text.strip())
    if has_hl7 == has_csv:
        raise ValueError("Provide exactly one of hl7 or csv")
    if has_hl7:
        report = _report_hl7(hl7 or "")
    else:
        report = _report_csv(csv_text or "")
    logger.info(
        "[PHIReport] source=%s  fields=%d  likely=%d  [DPDP §8(4)]",
        report["source"],
        report["summary"]["fields_scanned"],
        report["summary"]["likely_phi"],
    )
    return report


def _report_hl7(hl7_text: str) -> dict:
    rows = segment_rows(hl7_text)
    if not rows:
        raise ValueError("HL7 message has no segments")
    ordinal = {}
    findings = []
    for parts in rows:
        name = parts[0]
        ordinal[name] = ordinal.get(name, 0) + 1
        if name == "MSH":
            indexed = [(idx, parts[idx - 1]) for idx in range(2, len(parts) + 1)]
        else:
            indexed = [(idx, parts[idx]) for idx in range(1, len(parts)) if idx < len(parts)]
        for index, raw in indexed:
            value = (raw or "").strip()
            if not value:
                continue
            prior_key = "%s-%d" % (name, index)
            field_id = "%s[%d]-%d" % (name, ordinal[name], index)
            findings.append(_score_value(field_id, prior_key, value, _FIELD_PRIORS.get(prior_key)))
    return _finish("hl7", findings)


def _report_csv(csv_text: str) -> dict:
    rows = list(csv.reader(StringIO(csv_text)))
    if not rows or not any(cell.strip() for cell in rows[0]):
        raise ValueError("CSV has no header row")
    headers = rows[0]
    samples = rows[1:9]
    findings = []
    for index, header in enumerate(headers):
        label = header.strip() or "column-%d" % (index + 1)
        values = []
        for row in samples:
            if index < len(row) and row[index].strip():
                values.append(row[index].strip())
        phi_type, base, reason = _column_prior(label)
        if not values:
            findings.append(_finding(
                "column:%s" % label,
                None,
                label,
                phi_type,
                base,
                [reason],
                "",
            ))
            continue
        best = None
        for value in values:
            scored = _score_value(
                "column:%s" % label,
                label,
                value,
                (phi_type, base, reason, label),
            )
            if best is None or scored["confidence"] > best["confidence"]:
                best = scored
        findings.append(best)
    return _finish("csv", findings)


def _column_prior(header: str) -> Tuple[str, float, str]:
    norm = re.sub(r"[_\-]+", " ", header).strip().lower()
    for keys, phi_type, score, reason in _COLUMN_HINTS:
        for key in keys:
            if re.search(r"\b%s\b" % re.escape(key), norm):
                return phi_type, score, reason
    return "context", 0.05, "No identifier hint in the column name"


def _score_value(field_id: str, prior_key: str, value: str, prior: Optional[tuple]) -> dict:
    phi_type, base, reason, label = prior or _DEFAULT_PRIOR
    if not label:
        label = prior_key
    reasons = [reason]
    confidence = base
    chosen = phi_type
    for pattern_type, pattern_score, pattern_reason, pattern in _PATTERNS:
        if pattern.search(value):
            reasons.append(pattern_reason)
            if pattern_score > confidence:
                confidence = pattern_score
                chosen = pattern_type
    return _finding(field_id, prior_key if prior else None, label, chosen, confidence, reasons, value)


def _finding(
    field_id: str,
    hl7_field: Optional[str],
    label: str,
    phi_type: str,
    confidence: float,
    reasons: List[str],
    value: str,
) -> dict:
    bounded = min(0.99, confidence)
    return {
        "field": field_id,
        "hl7_field": hl7_field,
        "label": label,
        "phi_type": phi_type,
        "confidence": round(bounded, 2),
        "preview": _preview(value, bounded),
        "reasons": reasons,
    }


def _preview(value: str, confidence: float) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    if confidence < _REVIEW:
        return compact[:60]
    if len(compact) <= 1:
        return "•"
    hidden = min(6, len(compact) - 2)
    return compact[0] + ("•" * hidden) + compact[-1]


def _finish(source: str, findings: List[dict]) -> dict:
    findings.sort(key=lambda item: (-item["confidence"], item["field"]))
    likely = sum(1 for item in findings if item["confidence"] >= _LIKELY)
    review = sum(1 for item in findings if _REVIEW <= item["confidence"] < _LIKELY)
    low = sum(1 for item in findings if item["confidence"] < _REVIEW)
    peak = max((item["confidence"] for item in findings), default=0)
    return {
        "source": source,
        "fields": findings,
        "summary": {
            "fields_scanned": len(findings),
            "likely_phi": likely,
            "review": review,
            "low": low,
            "max_confidence": peak,
        },
    }
