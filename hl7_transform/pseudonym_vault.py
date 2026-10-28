"""
Reversible pseudonymization vault.
===================================
The pipeline anonymizer stays one-way: the same subject id always yields
the same fake name, and the original is not stored. This vault is a
separate escrow. An operator enrolls an original name; the vault returns
the same pseudonym the pipeline would, and stores the original only as
AES-256-GCM ciphertext. Reveal requires a reason and is written to an
audit log that does not contain the plaintext.

Compliance reference
--------------------
- DPDP Act 2023 §8(7): pseudonymisation where identity is not required
  for the processing itself, with a controlled path back when it is.
- DPDP Act 2023 §11: access to identity is an accountable event.
- IT Act 2000 §43A: the mapping is encrypted at rest.
- IT Act 2000 §72A: disclosure of the original name is logged.

The key comes from ``HL7_VAULT_KEY``. A demo key is used only when that
variable is unset, and the substitution is logged.
"""

import base64
import hashlib
import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from Crypto.Cipher import AES

from hl7_transform.anonymizer import Anonymizer

logger = logging.getLogger("hl7_pipeline.vault")

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-]{0,63}$")
# ponytail: last 200 events live in one JSON file. Move to an append-only
# log if this vault becomes a system of record.
_AUDIT_LIMIT = 200


class VaultError(Exception):
    """A vault operation was rejected or the store could not be read."""


class PseudonymVault:
    """
    Encrypted subject-id to original-name escrow.

    Parameters
    ----------
    path : path-like
        JSON file for ciphertext and the audit log.
    key : bytes
        AES-128, AES-192, or AES-256 key.
    anonymizer : Anonymizer, optional
        Source of the deterministic pseudonym. Defaults to ``en_IN``.
    """

    def __init__(self, path, key: bytes, anonymizer: Optional[Anonymizer] = None) -> None:
        if len(key) not in (16, 24, 32):
            raise VaultError("Vault key must be 16, 24, or 32 bytes")
        self.path = Path(path)
        self._key = key
        self._anonymizer = anonymizer or Anonymizer()
        # ponytail: process-local lock. Multiple workers need a file lock or a database.
        self._lock = threading.Lock()
        logger.info(
            "[PseudonymVault] Initialized  path=%s  [DPDP §8(7), IT Act §43A]",
            self.path,
        )

    @classmethod
    def from_env(cls, path: Optional[str] = None) -> "PseudonymVault":
        """Build a vault from ``HL7_VAULT_KEY`` and ``HL7_VAULT_PATH``."""
        raw = os.environ.get("HL7_VAULT_KEY")
        if not raw:
            logger.warning(
                "[PseudonymVault] HL7_VAULT_KEY not set — using insecure demo key. "
                "Set HL7_VAULT_KEY for production use."
            )
            raw = "INSECURE-DEMO-VAULT-KEY-DO-NOT-USE-IN-PRODUCTION"
        key = hashlib.sha256(raw.encode("utf-8")).digest()
        vault_path = path or os.environ.get("HL7_VAULT_PATH", "temp/pseudonym_vault.json")
        return cls(vault_path, key)

    def enroll(self, subject_id: str, original_name: str, actor: str) -> dict:
        """
        Store an original name and return the pipeline pseudonym.

        Re-enrolling the same subject replaces the ciphertext and writes
        an ``UPDATE`` audit event. The original name is not returned.
        """
        subject_id = _clean_id(subject_id)
        original_name = _clean_name(original_name)
        actor = _clean_actor(actor)
        pseudonym = self._pseudonym(subject_id)
        now = _now()
        with self._lock:
            data = self._load()
            current = data["subjects"].get(subject_id)
            updated = current is not None
            data["subjects"][subject_id] = {
                "pseudonym": pseudonym,
                "ciphertext": self._encrypt(original_name),
                "enrolled_at": current["enrolled_at"] if current else now,
                "updated_at": now,
                "reveal_count": current["reveal_count"] if current else 0,
            }
            self._append_audit(data, "UPDATE" if updated else "ENROLL", subject_id, actor, "")
            self._save(data)
        logger.info(
            "[PseudonymVault] %s  subject_id=%s  actor=%s  [DPDP §8(7)]",
            "UPDATE" if updated else "ENROLL",
            subject_id,
            actor,
        )
        return {
            "subject_id": subject_id,
            "pseudonym": pseudonym,
            "enrolled_at": data["subjects"][subject_id]["enrolled_at"],
            "updated": updated,
        }

    def reveal(self, subject_id: str, reason: str, actor: str) -> dict:
        """
        Decrypt one original name and record why it was revealed.

        Raises
        ------
        KeyError
            If the subject has not been enrolled.
        VaultError
            If the reason is missing or the ciphertext cannot be opened.
        """
        subject_id = _clean_id(subject_id)
        reason = _clean_reason(reason)
        actor = _clean_actor(actor)
        with self._lock:
            data = self._load()
            record = data["subjects"].get(subject_id)
            if record is None:
                raise KeyError(subject_id)
            original = self._decrypt(record["ciphertext"])
            record["reveal_count"] = int(record.get("reveal_count", 0)) + 1
            revealed_at = _now()
            self._append_audit(data, "REVEAL", subject_id, actor, reason)
            self._save(data)
        logger.warning(
            "[PseudonymVault] REVEAL  subject_id=%s  actor=%s  [IT Act §72A]",
            subject_id,
            actor,
        )
        return {
            "subject_id": subject_id,
            "pseudonym": record["pseudonym"],
            "original_name": original,
            "reason": reason,
            "revealed_at": revealed_at,
            "reveal_count": record["reveal_count"],
        }

    def snapshot(self) -> dict:
        """Return enrolled subjects and the audit log, without plaintext."""
        with self._lock:
            data = self._load()
        subjects = []
        for subject_id, record in data["subjects"].items():
            subjects.append({
                "subject_id": subject_id,
                "pseudonym": record["pseudonym"],
                "enrolled_at": record["enrolled_at"],
                "updated_at": record["updated_at"],
                "reveal_count": record["reveal_count"],
            })
        subjects.sort(key=lambda item: item["enrolled_at"])
        return {"subjects": subjects, "audit": list(data["audit"])}

    def _pseudonym(self, subject_id: str) -> str:
        seed = int(subject_id) if subject_id.isdigit() else int(
            hashlib.sha256(subject_id.encode("utf-8")).hexdigest()[:8], 16
        )
        last, first = self._anonymizer.anonymize_name(seed)
        return "%s, %s" % (last, first)

    def _encrypt(self, plaintext: str) -> str:
        nonce = os.urandom(12)
        cipher = AES.new(self._key, AES.MODE_GCM, nonce=nonce)
        ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode("utf-8"))
        return base64.b64encode(nonce + tag + ciphertext).decode("ascii")

    def _decrypt(self, token: str) -> str:
        try:
            raw = base64.b64decode(token)
            nonce, tag, ciphertext = raw[:12], raw[12:28], raw[28:]
            cipher = AES.new(self._key, AES.MODE_GCM, nonce=nonce)
            return cipher.decrypt_and_verify(ciphertext, tag).decode("utf-8")
        except (ValueError, KeyError) as exc:
            raise VaultError("Vault entry could not be decrypted") from exc

    def _load(self) -> dict:
        if not self.path.exists():
            return {"subjects": {}, "audit": []}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise VaultError("Vault file is unreadable") from exc
        data.setdefault("subjects", {})
        data.setdefault("audit", [])
        return data

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def _append_audit(self, data: dict, action: str, subject_id: str, actor: str, reason: str) -> None:
        data["audit"].append({
            "timestamp": _now(),
            "action": action,
            "subject_id": subject_id,
            "actor": actor,
            "reason": reason,
        })
        if len(data["audit"]) > _AUDIT_LIMIT:
            data["audit"] = data["audit"][-_AUDIT_LIMIT:]


def _clean_id(subject_id: str) -> str:
    cleaned = (subject_id or "").strip()
    if not _ID_RE.fullmatch(cleaned):
        raise VaultError("subject_id must be 1-64 letters, digits, '_' or '-'")
    return cleaned


def _clean_name(original_name: str) -> str:
    cleaned = " ".join((original_name or "").split())
    if not cleaned:
        raise VaultError("original_name is required")
    if len(cleaned) > 200:
        raise VaultError("original_name is too long")
    return cleaned


def _clean_reason(reason: str) -> str:
    cleaned = " ".join((reason or "").split())
    if len(cleaned) < 3:
        raise VaultError("A reason of at least 3 characters is required")
    if len(cleaned) > 300:
        raise VaultError("reason is too long")
    return cleaned


def _clean_actor(actor: str) -> str:
    cleaned = " ".join((actor or "").split()) or "unknown"
    return cleaned[:64]


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
