"""Durable application state with SQLite development mode and PostGIS support."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PersistentStore:
    def __init__(self, database_url: str | None = None) -> None:
        self.requested_url = database_url or os.getenv("DATABASE_URL") or f"sqlite:///{Path(os.getenv('STATE_DB_PATH', str(Path(__file__).resolve().parents[2] / '.runtime' / 'urbanland.sqlite3'))).resolve()}"
        self.allow_fallback = os.getenv("ALLOW_SQLITE_FALLBACK", "true").lower() in {"1", "true", "yes", "on"}
        self.backend = "postgresql" if self.requested_url.startswith(("postgresql", "postgres://")) else "sqlite"
        self._connection_factory = None
        if self.backend == "postgresql":
            try:
                import psycopg
                self._connection_factory = psycopg.connect
            except ImportError:
                if not self.allow_fallback:
                    raise RuntimeError("PostgreSQL is configured but psycopg is not installed")
                self.backend = "sqlite"
        if self.backend == "sqlite":
            path = self.requested_url.replace("sqlite:///", "", 1)
            self.path = Path(path).expanduser().resolve()
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self.migration_version = "001_initial"
        try:
            self._ensure_schema()
        except Exception:
            # Never silently split production data into a local SQLite file.
            # SQLite fallback is deliberately opt-in for environments where
            # Postgres is not available (unit tests and the local demo).
            if self.backend != "postgresql" or not self.allow_fallback:
                raise
            self.backend = "sqlite"
            self.path = Path(os.getenv("STATE_DB_PATH", str(Path(__file__).resolve().parents[2] / ".runtime" / "urbanland.sqlite3"))).resolve()
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._ensure_schema()

    @property
    def status(self) -> dict[str, Any]:
        return {"backend": self.backend, "requested_url": self.requested_url.split("@")[-1] if "@" in self.requested_url else self.requested_url, "migration": self.migration_version, "durable": True, "postgis": self.backend == "postgresql"}

    def _connect(self):
        if self.backend == "postgresql":
            postgres_url = self.requested_url.replace("postgresql+psycopg://", "postgresql://", 1)
            return self._connection_factory(postgres_url)
        return sqlite3.connect(self.path, timeout=20, check_same_thread=False)

    def _execute(self, connection, statement: str, params: tuple[Any, ...] = ()):
        if self.backend == "postgresql":
            cursor = connection.cursor()
            cursor.execute(statement.replace("?", "%s"), params)
            return cursor
        return connection.execute(statement, params)

    def _ensure_schema(self) -> None:
        connection = self._connect()
        try:
            geometry = "GEOMETRY" if self.backend == "postgresql" else "TEXT"
            json_type = "JSONB" if self.backend == "postgresql" else "TEXT"
            statements = [
                f"CREATE TABLE IF NOT EXISTS app_state (state_key TEXT PRIMARY KEY, payload {json_type} NOT NULL, updated_at TEXT NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS datasets (dataset_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload {json_type} NOT NULL, created_at TEXT NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS canonical_parcels (canonical_parcel_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, geometry {geometry}, payload {json_type} NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS source_features (source_id TEXT NOT NULL, feature_id TEXT NOT NULL, tenant_id TEXT NOT NULL, geometry {geometry}, payload {json_type} NOT NULL, PRIMARY KEY(source_id, feature_id))",
                f"CREATE TABLE IF NOT EXISTS entity_matches (match_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload {json_type} NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS attribute_evidence (evidence_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload {json_type} NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS conflicts (conflict_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload {json_type} NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, status TEXT NOT NULL, payload {json_type} NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS review_actions (review_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload {json_type} NOT NULL, created_at TEXT NOT NULL)",
                f"CREATE TABLE IF NOT EXISTS audit_log (sequence INTEGER PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, tenant_id TEXT NOT NULL, event_hash TEXT NOT NULL, previous_hash TEXT, payload {json_type} NOT NULL, created_at TEXT NOT NULL)",
            ]
            if self.backend == "postgresql":
                self._execute(connection, "CREATE EXTENSION IF NOT EXISTS postgis")
            for statement in statements:
                self._execute(connection, statement)
            connection.commit()
        finally:
            connection.close()

    def load_state(self) -> dict[str, Any] | None:
        connection = self._connect()
        try:
            cursor = self._execute(connection, "SELECT payload FROM app_state WHERE state_key = ?", ("workspace",))
            row = cursor.fetchone()
            if not row:
                return None
            payload = row[0]
            return json.loads(payload) if isinstance(payload, str) else payload
        finally:
            connection.close()

    def save_state(self, state: dict[str, Any], tenant_id: str = "demo") -> None:
        payload = json.dumps(state, separators=(",", ":"), ensure_ascii=False)
        connection = self._connect()
        try:
            if self.backend == "postgresql":
                self._execute(connection, "INSERT INTO app_state(state_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(state_key) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at", ("workspace", payload, _now()))
            else:
                self._execute(connection, "INSERT INTO app_state(state_key,payload,updated_at) VALUES(?,?,?) ON CONFLICT(state_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at", ("workspace", payload, _now()))
            self._project(connection, state, tenant_id)
            connection.commit()
        finally:
            connection.close()

    def _project(self, connection, state: dict[str, Any], tenant_id: str) -> None:
        # Projection tables make the schema inspectable and leave the full
        # payload available for future migrations.  Upserts are intentionally
        # compact for the small demo ward.
        for source in state.get("sources", []):
            payload = json.dumps(source, ensure_ascii=False)
            if self.backend == "postgresql":
                self._execute(connection, "INSERT INTO datasets(dataset_id,tenant_id,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(dataset_id) DO UPDATE SET payload=EXCLUDED.payload", (source["id"], tenant_id, payload, source.get("created_at", _now())))
            else:
                self._execute(connection, "INSERT INTO datasets(dataset_id,tenant_id,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(dataset_id) DO UPDATE SET payload=excluded.payload", (source["id"], tenant_id, payload, source.get("created_at", _now())))
        for feature in state.get("features", []):
            payload = json.dumps(feature, ensure_ascii=False)
            geometry_payload = json.dumps(feature.get("geometry"), ensure_ascii=False) if feature.get("geometry") else None
            if self.backend == "postgresql":
                geometry_sql = "ST_SetSRID(ST_GeomFromGeoJSON(?),4326)" if geometry_payload else "NULL"
                self._execute(connection, f"INSERT INTO canonical_parcels(canonical_parcel_id,tenant_id,geometry,payload,version,updated_at) VALUES(?,?,{geometry_sql},?,?,?) ON CONFLICT(canonical_parcel_id) DO UPDATE SET geometry=EXCLUDED.geometry, payload=EXCLUDED.payload, version=EXCLUDED.version, updated_at=EXCLUDED.updated_at", (feature["id"], tenant_id, *(([geometry_payload] if geometry_payload else [])), payload, (feature.get("properties") or {}).get("canonical_version", 1), _now()))
            else:
                self._execute(connection, "INSERT INTO canonical_parcels(canonical_parcel_id,tenant_id,geometry,payload,version,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(canonical_parcel_id) DO UPDATE SET geometry=excluded.geometry, payload=excluded.payload, version=excluded.version, updated_at=excluded.updated_at", (feature["id"], tenant_id, geometry_payload, payload, (feature.get("properties") or {}).get("canonical_version", 1), _now()))
        for job in state.get("jobs", []):
            payload = json.dumps(job, ensure_ascii=False)
            if self.backend == "postgresql":
                self._execute(connection, "INSERT INTO jobs(job_id,tenant_id,status,payload,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at", (job["id"], tenant_id, job.get("status", "UNKNOWN"), payload, job.get("created_at", _now()), job.get("completed_at") or job.get("updated_at") or _now()))
            else:
                self._execute(connection, "INSERT INTO jobs(job_id,tenant_id,status,payload,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET status=excluded.status,payload=excluded.payload,updated_at=excluded.updated_at", (job["id"], tenant_id, job.get("status", "UNKNOWN"), payload, job.get("created_at", _now()), job.get("completed_at") or job.get("updated_at") or _now()))
        run = state.get("engine_run") or {}
        for source_id, source_payload in (state.get("source_payloads") or {}).items():
            for feature in source_payload.get("features", []):
                feature_id = str(feature.get("id") or (feature.get("properties") or {}).get("source_record_id") or "unknown")
                payload = json.dumps(feature, ensure_ascii=False)
                geometry_payload = json.dumps(feature.get("geometry"), ensure_ascii=False) if feature.get("geometry") else None
                if self.backend == "postgresql":
                    geometry_sql = "ST_SetSRID(ST_GeomFromGeoJSON(?),4326)" if geometry_payload else "NULL"
                    self._execute(connection, f"INSERT INTO source_features(source_id,feature_id,tenant_id,geometry,payload) VALUES(?,?,?,{geometry_sql},?) ON CONFLICT(source_id,feature_id) DO UPDATE SET geometry=EXCLUDED.geometry, payload=EXCLUDED.payload", (source_id, feature_id, tenant_id, *(([geometry_payload] if geometry_payload else [])), payload))
                else:
                    self._execute(connection, "INSERT INTO source_features(source_id,feature_id,tenant_id,geometry,payload) VALUES(?,?,?,?,?) ON CONFLICT(source_id,feature_id) DO UPDATE SET geometry=excluded.geometry, payload=excluded.payload", (source_id, feature_id, tenant_id, geometry_payload, payload))
        match_number = 0
        evidence_number = 0
        conflict_number = 0
        for parcel_id, result in (run.get("parcels") or {}).items():
            for match in result.get("matches", []):
                match_number += 1
                match_id = f"{run.get('run_id', 'run')}:match:{match_number}"
                payload = json.dumps({"canonical_parcel_id": parcel_id, **match}, ensure_ascii=False)
                if self.backend == "postgresql":
                    self._execute(connection, "INSERT INTO entity_matches(match_id,tenant_id,payload) VALUES(?,?,?) ON CONFLICT(match_id) DO UPDATE SET payload=EXCLUDED.payload", (match_id, tenant_id, payload))
                else:
                    self._execute(connection, "INSERT INTO entity_matches(match_id,tenant_id,payload) VALUES(?,?,?) ON CONFLICT(match_id) DO UPDATE SET payload=excluded.payload", (match_id, tenant_id, payload))
            for attribute, provenance in (result.get("attributes", {}).get("provenance", {}) or {}).items():
                evidence_number += 1
                evidence_id = f"{run.get('run_id', 'run')}:evidence:{evidence_number}"
                payload = json.dumps({"canonical_parcel_id": parcel_id, "attribute": attribute, **provenance}, ensure_ascii=False)
                if self.backend == "postgresql":
                    self._execute(connection, "INSERT INTO attribute_evidence(evidence_id,tenant_id,payload) VALUES(?,?,?) ON CONFLICT(evidence_id) DO UPDATE SET payload=EXCLUDED.payload", (evidence_id, tenant_id, payload))
                else:
                    self._execute(connection, "INSERT INTO attribute_evidence(evidence_id,tenant_id,payload) VALUES(?,?,?) ON CONFLICT(evidence_id) DO UPDATE SET payload=excluded.payload", (evidence_id, tenant_id, payload))
            for conflict in result.get("conflict", {}).get("types", []):
                conflict_number += 1
                conflict_id = f"{run.get('run_id', 'run')}:conflict:{conflict_number}"
                payload = json.dumps({"canonical_parcel_id": parcel_id, "conflict_type": conflict, "severity": result.get("conflict", {}).get("severity")}, ensure_ascii=False)
                if self.backend == "postgresql":
                    self._execute(connection, "INSERT INTO conflicts(conflict_id,tenant_id,payload) VALUES(?,?,?) ON CONFLICT(conflict_id) DO UPDATE SET payload=EXCLUDED.payload", (conflict_id, tenant_id, payload))
                else:
                    self._execute(connection, "INSERT INTO conflicts(conflict_id,tenant_id,payload) VALUES(?,?,?) ON CONFLICT(conflict_id) DO UPDATE SET payload=excluded.payload", (conflict_id, tenant_id, payload))
        for action in state.get("changes", []):
            payload = json.dumps(action, ensure_ascii=False)
            if self.backend == "postgresql":
                self._execute(connection, "INSERT INTO review_actions(review_id,tenant_id,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(review_id) DO UPDATE SET payload=EXCLUDED.payload", (action["id"], tenant_id, payload, action.get("timestamp", _now())))
            else:
                self._execute(connection, "INSERT INTO review_actions(review_id,tenant_id,payload,created_at) VALUES(?,?,?,?) ON CONFLICT(review_id) DO UPDATE SET payload=excluded.payload", (action["id"], tenant_id, payload, action.get("timestamp", _now())))

    def append_audit(self, event: dict[str, Any], tenant_id: str = "demo") -> dict[str, Any]:
        import hashlib
        connection = self._connect()
        try:
            cursor = self._execute(connection, "SELECT event_hash FROM audit_log ORDER BY sequence DESC LIMIT 1")
            previous = cursor.fetchone()
            previous_hash = previous[0] if previous else None
            canonical = json.dumps({"event": event, "previous_hash": previous_hash}, sort_keys=True, separators=(",", ":"))
            event_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            event = {**event, "tenant_id": tenant_id, "previous_hash": previous_hash, "event_hash": event_hash}
            cursor = self._execute(connection, "SELECT COALESCE(MAX(sequence),0)+1 FROM audit_log")
            sequence = cursor.fetchone()[0]
            self._execute(connection, "INSERT INTO audit_log(sequence,event_id,tenant_id,event_hash,previous_hash,payload,created_at) VALUES(?,?,?,?,?,?,?)", (sequence, event["id"], tenant_id, event_hash, previous_hash, json.dumps(event, ensure_ascii=False), event.get("timestamp", _now())))
            connection.commit()
            return event
        finally:
            connection.close()

    def audit_events(self, tenant_id: str = "demo") -> list[dict[str, Any]]:
        connection = self._connect()
        try:
            cursor = self._execute(connection, "SELECT payload FROM audit_log WHERE tenant_id = ? ORDER BY sequence DESC", (tenant_id,))
            return [json.loads(row[0]) if isinstance(row[0], str) else row[0] for row in cursor.fetchall()]
        finally:
            connection.close()
