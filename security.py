"""
Service-level bearer-token auth for operator and admin roles.

Compliance reference
--------------------
- IT Act 2000 §43: unauthorised access to a computer system.
- DPDP Act 2023 §8(5): reasonable security safeguards, including
  access limited to the people who need it.

Operator tokens may run the pipeline and read compliance reports.
Admin tokens are required to clear the audit log and to reveal a
name held in the pseudonym vault.
"""

import os
from enum import Enum
from typing import Optional

from fastapi import Depends, Header, HTTPException, status


class ApiRole(str, Enum):
    OPERATOR = "operator"
    ADMIN = "admin"


def _extract_bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    return authorization.split(" ", 1)[1].strip()


def _resolve_role(token: str) -> ApiRole:
    admin_token = os.environ.get("ADMIN_TOKEN")
    operator_token = os.environ.get("OPERATOR_TOKEN")

    if admin_token and token == admin_token:
        return ApiRole.ADMIN
    if operator_token and token == operator_token:
        return ApiRole.OPERATOR

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token is missing or invalid",
    )


def require_operator_role(authorization: Optional[str] = Header(None)) -> ApiRole:
    """Accept an operator or admin bearer token."""
    token = _extract_bearer_token(authorization)
    return _resolve_role(token)


def require_admin_role(role: ApiRole = Depends(require_operator_role)) -> ApiRole:
    """Accept only an admin bearer token."""
    if role != ApiRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return role
