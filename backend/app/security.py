"""Minimal dependency-free bearer auth for the deployable demo."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any


def enabled() -> bool:
    return os.getenv("AUTH_ENABLED", "false").lower() in {"1", "true", "yes", "on"}


def _secret() -> bytes:
    return os.getenv("AUTH_SECRET", "urbanland-demo-change-this-secret").encode("utf-8")


def issue_token(subject: str, role: str = "reviewer", tenant_id: str = "demo", ttl_seconds: int = 3600) -> str:
    payload = {"sub": subject, "role": role, "tenant_id": tenant_id, "exp": int(time.time()) + ttl_seconds}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(_secret(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def verify_token(token: str | None) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None
    encoded, signature = token.split(".", 1)
    expected = hmac.new(_secret(), encoded.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode((encoded + padding).encode()))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except (ValueError, json.JSONDecodeError):
        return None


def request_user(request) -> dict[str, Any]:
    if not enabled():
        return {"sub": "demo-operator", "role": "admin", "tenant_id": os.getenv("DEMO_TENANT", "demo"), "demo": True}
    header = request.headers.get("authorization", "")
    token = header.removeprefix("Bearer ").strip() if header else request.headers.get("x-api-key")
    user = verify_token(token)
    if not user:
        from fastapi import HTTPException
        raise HTTPException(401, "Authentication required. Obtain a bearer token from /api/v1/auth/token.")
    return user


def require_role(request, roles: set[str]) -> dict[str, Any]:
    user = request_user(request)
    if user.get("role") not in roles and user.get("role") != "admin":
        from fastapi import HTTPException
        raise HTTPException(403, "This operation requires an authorized role.")
    return user
