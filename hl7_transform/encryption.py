"""
Phase 4 — Multi-Algorithm Encryption Comparison
=================================================
Implements the ``EncryptionComparator`` that applies **four** distinct
cryptographic algorithms to each HL7 message and reports timing, output
size, and compliance mapping.

Algorithms
----------
1. **SHA-256** — NIST FIPS 180-4 hash (IT Act §14 compliance).
2. **AES-256-CBC** — Symmetric encryption at rest (IT Act §43A).
   PyCryptodome is required. There is no hash-based stand-in.
3. **HMAC-SHA512** — Keyed-hash for authentication + integrity
   (DPDP §8(7) assurance).
4. **SHA3-256** — Keccak-family hash (future-proof per IS/ISO 27001).

Compliance reference
--------------------
- IT Act 2000 §43A: "Reasonable security practices" mandate — we
  demonstrate MULTIPLE algorithm capabilities to satisfy auditor
  expectations beyond a single-hash approach.
- DPDP Act 2023 §8(7): De-identification assurance — HMAC binds
  message integrity to a secret key, ensuring authenticity.
- IS/ISO/IEC 27001: Requires evaluation of cryptographic controls
  and periodic review of algorithm strength.

PEP 8 compliant. Logging enabled for compliance audit trail.
"""

import hashlib
import hmac
import logging
import os
import time
from dataclasses import dataclass
from typing import List

from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

logger = logging.getLogger("hl7_pipeline.encryption")

# Cryptographic keys — MUST be loaded from environment variables or a secret store.
# Never hardcode keys in source control.
_HMAC_KEY_ENV = os.environ.get("HL7_HMAC_KEY")
_AES_KEY_ENV = os.environ.get("HL7_AES_KEY")


def _get_hmac_key() -> bytes:
    """Load HMAC key from environment, with fallback for dev/demo mode."""
    if _HMAC_KEY_ENV:
        return _HMAC_KEY_ENV.encode("utf-8")
    logger.warning(
        "[EncryptionComparator] HL7_HMAC_KEY not set — using insecure demo key. "
        "Set HL7_HMAC_KEY env var for production use."
    )
    return b"INSECURE-DEMO-KEY-DO-NOT-USE-IN-PRODUCTION"


def _get_aes_key() -> bytes:
    """Load AES key from environment, with fallback for dev/demo mode."""
    if _AES_KEY_ENV:
        return hashlib.sha256(_AES_KEY_ENV.encode("utf-8")).digest()  # 32 bytes
    logger.warning(
        "[EncryptionComparator] HL7_AES_KEY not set — using insecure demo key. "
        "Set HL7_AES_KEY env var for production use."
    )
    return hashlib.sha256(b"INSECURE-DEMO-KEY-DO-NOT-USE-IN-PRODUCTION").digest()


@dataclass
class AlgorithmResult:
    """Result from running a single algorithm."""
    name: str
    time_ms: float
    output_size_bytes: int
    digest_preview: str  # first 16 hex chars
    full_digest: str
    legal_reference: str
    algorithm_type: str  # "hash" or "cipher"
    key_size_bits: int


class EncryptionComparator:
    """
    Apply multiple cryptographic algorithms to an HL7 message and
    collect performance and output metrics for comparison.

    Methods
    -------
    compare(hl7_string) → list[AlgorithmResult]
    """

    def compare(self, hl7_string: str) -> List[AlgorithmResult]:
        """
        Run all four algorithms on the given HL7 message.

        Parameters
        ----------
        hl7_string : str
            Serialised HL7 message in ER7 format.

        Returns
        -------
        list[AlgorithmResult]
        """
        data = hl7_string.encode("utf-8")
        results: List[AlgorithmResult] = []

        # 1. SHA-256
        results.append(self._run_sha256(data))
        # 2. AES-256-CBC
        results.append(self._run_aes_256(data))
        # 3. HMAC-SHA512
        results.append(self._run_hmac_sha512(data))
        # 4. SHA3-256
        results.append(self._run_sha3_256(data))

        logger.info(
            "[EncryptionComparator] Compared %d algorithms  "
            "fastest=%.3fms  slowest=%.3fms  [IT Act §43A]",
            len(results),
            min(r.time_ms for r in results),
            max(r.time_ms for r in results),
        )
        return results

    # ------------------------------------------------------------------
    # Algorithm implementations
    # ------------------------------------------------------------------

    @staticmethod
    def _run_sha256(data: bytes) -> AlgorithmResult:
        start = time.perf_counter()
        digest = hashlib.sha256(data).hexdigest()
        elapsed = (time.perf_counter() - start) * 1000

        return AlgorithmResult(
            name="SHA-256",
            time_ms=round(elapsed, 4),
            output_size_bytes=len(digest) // 2,  # hex → bytes
            digest_preview=digest[:16],
            full_digest=digest,
            legal_reference="IT Act §14 (Secure Electronic Record)",
            algorithm_type="hash",
            key_size_bits=0,
        )

    @staticmethod
    def _run_aes_256(data: bytes) -> AlgorithmResult:
        start = time.perf_counter()
        aes_key = _get_aes_key()
        iv = os.urandom(16)
        cipher = AES.new(aes_key, AES.MODE_CBC, iv)
        ciphertext = cipher.encrypt(pad(data, AES.block_size))
        output_hex = (iv + ciphertext).hex()
        elapsed = (time.perf_counter() - start) * 1000

        return AlgorithmResult(
            name="AES-256-CBC",
            time_ms=round(elapsed, 4),
            output_size_bytes=len(output_hex) // 2,
            digest_preview=output_hex[:16],
            full_digest=output_hex[:64] + "...",
            legal_reference="IT Act §43A (Reasonable Security Practices)",
            algorithm_type="cipher",
            key_size_bits=256,
        )

    @staticmethod
    def _run_hmac_sha512(data: bytes) -> AlgorithmResult:
        start = time.perf_counter()
        hmac_key = _get_hmac_key()
        digest = hmac.new(hmac_key, data, hashlib.sha512).hexdigest()
        elapsed = (time.perf_counter() - start) * 1000

        return AlgorithmResult(
            name="HMAC-SHA512",
            time_ms=round(elapsed, 4),
            output_size_bytes=len(digest) // 2,
            digest_preview=digest[:16],
            full_digest=digest,
            legal_reference="DPDP §8(7) (De-identification Assurance)",
            algorithm_type="mac",
            key_size_bits=len(hmac_key) * 8,
        )

    @staticmethod
    def _run_sha3_256(data: bytes) -> AlgorithmResult:
        start = time.perf_counter()
        digest = hashlib.sha3_256(data).hexdigest()
        elapsed = (time.perf_counter() - start) * 1000

        return AlgorithmResult(
            name="SHA3-256",
            time_ms=round(elapsed, 4),
            output_size_bytes=len(digest) // 2,
            digest_preview=digest[:16],
            full_digest=digest,
            legal_reference="IS/ISO 27001 (Future-proof Hash)",
            algorithm_type="hash",
            key_size_bits=0,
        )
