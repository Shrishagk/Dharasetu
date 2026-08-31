"""Unit checks for the optional deployment authentication boundary."""

from __future__ import annotations

from starlette.requests import Request

from backend.app.security import issue_token, request_user, verify_token


def test_signed_token_and_role_claims(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "true")
    monkeypatch.setenv("AUTH_SECRET", "test-only-secret")
    token = issue_token("qa-officer", "reviewer", "tenant-a")
    claims = verify_token(token)
    assert claims is not None
    assert claims["sub"] == "qa-officer"
    assert claims["role"] == "reviewer"
    assert claims["tenant_id"] == "tenant-a"
    assert verify_token(token + "tampered") is None

    request = Request({"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]})
    assert request_user(request)["tenant_id"] == "tenant-a"
