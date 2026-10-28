"""
FHIR R4 export for transformed HL7 v2.5.1 messages.
====================================================
Maps an already-built ORU^R01 message into a FHIR R4 collection Bundle
containing Patient, Observation, and DiagnosticReport resources.

The export does not re-identify anyone. Pseudonyms already written into
PID stay pseudonyms. The ZSH tamper-evident seal is copied onto
``Bundle.meta.tag`` so the IT Act integrity mark travels with the
interoperable form.

Compliance reference
--------------------
- DPDP Act 2023 §8(7): export the de-identified message, not the source row.
- IT Act 2000 §43A: keep the SHA-256 seal attached to the exported record.
- IT Act 2000 §14: the sealed message remains a secure electronic record
  after it is reshaped for a FHIR client.

This is a focused R4 subset (Patient, Observation, DiagnosticReport),
not a full national health profile.
"""

import hashlib
import logging
import re
import uuid
from typing import Dict, List, Optional

from hl7_transform.er7 import field, segment_rows

logger = logging.getLogger("hl7_pipeline.fhir")

_GENDER = {"M": "male", "F": "female", "O": "other", "U": "unknown"}
_STATUS = {
    "F": "final",
    "P": "preliminary",
    "C": "corrected",
    "X": "cancelled",
    "I": "registered",
}
_INTERPRETATION = {"N": "N", "H": "H", "L": "L", "A": "A"}


def hl7_to_fhir_bundle(hl7_text: str) -> dict:
    """
    Convert one ER7 message into a FHIR R4 collection Bundle.

    Parameters
    ----------
    hl7_text : str
        HL7 v2 message, segments separated by newlines or carriage returns.

    Returns
    -------
    dict
        A JSON-ready FHIR R4 Bundle.

    Raises
    ------
    ValueError
        If the text contains no HL7 segments.
    """
    rows = segment_rows(hl7_text)
    if not rows:
        raise ValueError("HL7 message has no segments")

    by_name: Dict[str, List[List[str]]] = {}
    for parts in rows:
        by_name.setdefault(parts[0], []).append(parts)

    msh = by_name.get("MSH", [[]])[0]
    pid = by_name.get("PID", [[]])[0]
    patient_id, patient = _patient(pid)
    patient_url = "urn:uuid:%s" % uuid.uuid5(uuid.NAMESPACE_OID, "patient:" + patient_id)

    observations = []
    observation_urls = []
    obr = by_name.get("OBR", [[]])[0] if by_name.get("OBR") else []
    effective = _fhir_datetime(field(obr, 7)) if obr else None
    for index, obx in enumerate(by_name.get("OBX", []), start=1):
        resource = _observation(obx, patient_url, effective, index)
        full_url = "urn:uuid:%s" % uuid.uuid5(uuid.NAMESPACE_OID, "obs:%s:%d" % (patient_id, index))
        observations.append({"fullUrl": full_url, "resource": resource})
        observation_urls.append(full_url)

    entries = [{"fullUrl": patient_url, "resource": patient}]
    entries.extend(observations)
    if obr:
        report = _diagnostic_report(obr, patient_url, observation_urls)
        report_url = "urn:uuid:%s" % uuid.uuid5(uuid.NAMESPACE_OID, "report:" + patient_id)
        entries.append({"fullUrl": report_url, "resource": report})

    message_id = field(msh, 10) or patient_id
    bundle = {
        "resourceType": "Bundle",
        "type": "collection",
        "id": _safe_id(message_id),
        "identifier": {
            "system": "urn:hl7-orchestrator:msh-10",
            "value": message_id,
        },
        "entry": entries,
    }
    timestamp = _fhir_datetime(field(msh, 7))
    if timestamp:
        bundle["timestamp"] = timestamp

    zsh = by_name.get("ZSH", [[]])[0] if by_name.get("ZSH") else []
    seal = field(zsh, 3) if zsh else ""
    if seal:
        bundle["meta"] = {
            "tag": [{
                "system": "urn:hl7-orchestrator:zsh",
                "code": field(zsh, 2) or "SHA256",
                "display": seal,
            }]
        }

    logger.info(
        "[FHIRExport] Bundle built  resources=%d  [DPDP §8(7), IT Act §43A]",
        len(entries),
    )
    return bundle


def _patient(pid: List[str]) -> tuple:
    """Build a Patient resource and a stable id."""
    identifier_raw = field(pid, 3)
    components = identifier_raw.split("^") if identifier_raw else []
    value = components[0] if components and components[0] else (identifier_raw or "unknown")
    patient_id = "pat-" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]
    patient = {"resourceType": "Patient", "id": patient_id}

    if identifier_raw:
        identifier = {"value": value, "system": "urn:hl7-orchestrator:mrn"}
        if len(components) > 3 and components[3]:
            identifier["system"] = "urn:hl7-orchestrator:assigner:" + components[3]
        patient["identifier"] = [identifier]

    name_raw = field(pid, 5)
    if name_raw:
        name_parts = name_raw.split("^")
        human = {"use": "official", "family": name_parts[0]}
        if len(name_parts) > 1 and name_parts[1]:
            human["given"] = [name_parts[1]]
        patient["name"] = [human]

    birth = _fhir_date(field(pid, 7))
    if birth:
        patient["birthDate"] = birth

    sex = field(pid, 8).upper()[:1]
    if sex in _GENDER:
        patient["gender"] = _GENDER[sex]

    address = _address(field(pid, 11))
    if address:
        patient["address"] = [address]

    phone = field(pid, 13)
    if phone:
        patient["telecom"] = [{"system": "phone", "value": phone}]
    return patient_id, patient


def _address(raw: str) -> Optional[dict]:
    if not raw:
        return None
    parts = raw.split("^")
    address = {}
    if parts[0]:
        address["line"] = [parts[0]]
    if len(parts) > 2 and parts[2]:
        address["city"] = parts[2]
    if len(parts) > 3 and parts[3]:
        address["state"] = parts[3]
    if len(parts) > 4 and parts[4]:
        address["postalCode"] = parts[4]
    return address or None


def _observation(obx: List[str], patient_url: str, effective: Optional[str], index: int) -> dict:
    code_raw = field(obx, 3) or "unknown"
    observation = {
        "resourceType": "Observation",
        "id": "obs-%d" % index,
        "status": _STATUS.get(field(obx, 11).upper()[:1], "final"),
        "category": [{
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                "code": "laboratory",
            }]
        }],
        "code": _codeable(code_raw),
        "subject": {"reference": patient_url},
    }
    if effective:
        observation["effectiveDateTime"] = effective

    raw_value = field(obx, 5)
    number = _numeric(raw_value)
    unit = field(obx, 6)
    if number is not None:
        quantity = {"value": number}
        if unit:
            quantity["unit"] = unit
        observation["valueQuantity"] = quantity
    elif raw_value:
        observation["valueString"] = raw_value

    ref_range = _reference_range(field(obx, 7))
    if ref_range:
        observation["referenceRange"] = [ref_range]

    flag = field(obx, 8).upper()[:1]
    if flag in _INTERPRETATION:
        observation["interpretation"] = [{
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                "code": _INTERPRETATION[flag],
            }]
        }]
    return observation


def _diagnostic_report(obr: List[str], patient_url: str, result_urls: List[str]) -> dict:
    report = {
        "resourceType": "DiagnosticReport",
        "id": "report-1",
        "status": "final",
        "code": _codeable(field(obr, 4) or "laboratory-report"),
        "subject": {"reference": patient_url},
        "result": [{"reference": url} for url in result_urls],
    }
    effective = _fhir_datetime(field(obr, 7))
    if effective:
        report["effectiveDateTime"] = effective
    return report


def _codeable(raw: str) -> dict:
    parts = raw.split("^")
    code = parts[0] or "unknown"
    display = parts[1] if len(parts) > 1 and parts[1] else code
    coding = {"code": code, "display": display}
    if len(parts) > 2 and parts[2] in ("LN", "LOINC"):
        coding["system"] = "http://loinc.org"
    return {"coding": [coding], "text": display}


def _numeric(raw: str) -> Optional[float]:
    if not raw:
        return None
    for piece in raw.split("^"):
        piece = piece.strip()
        if not piece:
            continue
        try:
            return float(piece)
        except ValueError:
            continue
    return None


def _reference_range(raw: str) -> Optional[dict]:
    if not raw or "-" not in raw:
        return None
    low, high = raw.split("-", 1)
    try:
        return {"low": {"value": float(low)}, "high": {"value": float(high)}}
    except ValueError:
        return None


def _fhir_date(raw: str) -> Optional[str]:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) < 8:
        return None
    return "%s-%s-%s" % (digits[0:4], digits[4:6], digits[6:8])


def _fhir_datetime(raw: str) -> Optional[str]:
    """
    Format an HL7 timestamp as a FHIR instant.

    Pipeline timestamps are naive. They are exported as UTC so
    ``Bundle.timestamp`` stays a valid instant.
    """
    date = _fhir_date(raw)
    if not date:
        return None
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) < 12:
        return date
    hour = digits[8:10]
    minute = digits[10:12]
    second = digits[12:14] if len(digits) >= 14 else "00"
    return "%sT%s:%s:%sZ" % (date, hour, minute, second)


def _safe_id(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9\-.]", "", value)[:64]
    return cleaned or uuid.uuid4().hex
