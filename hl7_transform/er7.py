"""
Minimal ER7 field access for features that read an already-built message.

The original ``message.py`` parser is left unchanged. This helper only
splits pipe-delimited segments and corrects the MSH-1 offset, where the
field separator itself is not present after ``split('|')``.
"""

import re
from typing import List


def segment_rows(hl7_text: str) -> List[List[str]]:
    """Return each segment as the list produced by splitting on ``|``."""
    text = (hl7_text or "").replace("\r\n", "\n").replace("\r", "\n")
    rows: List[List[str]] = []
    for line in text.split("\n"):
        line = line.strip()
        if "|" not in line or len(line) < 4:
            continue
        parts = line.split("|")
        if not re.fullmatch(r"[A-Z][A-Z0-9]{2}", parts[0]):
            continue
        rows.append(parts)
    return rows


def field(parts: List[str], index: int) -> str:
    """Return the 1-based HL7 field, or an empty string when it is absent."""
    if not parts or index < 1:
        return ""
    if parts[0] == "MSH":
        if index == 1:
            return "|"
        position = index - 1
    else:
        position = index
    if position >= len(parts):
        return ""
    return parts[position].strip()
