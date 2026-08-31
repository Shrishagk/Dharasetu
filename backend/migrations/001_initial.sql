-- Reference migration for operators using a managed PostGIS database.
-- The service applies the equivalent idempotent DDL at startup for the
-- self-contained demo, while this file is suitable for Alembic/DBA review.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS datasets (
  dataset_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  state_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_parcels (
  canonical_parcel_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  geometry geometry(Geometry, 4326),
  payload JSONB NOT NULL,
  version INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS canonical_parcels_geometry_gix ON canonical_parcels USING GIST (geometry);

CREATE TABLE IF NOT EXISTS source_features (
  source_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  geometry geometry(Geometry, 4326),
  payload JSONB NOT NULL,
  PRIMARY KEY (source_id, feature_id)
);
CREATE INDEX IF NOT EXISTS source_features_geometry_gix ON source_features USING GIST (geometry);

CREATE TABLE IF NOT EXISTS entity_matches (match_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS attribute_evidence (evidence_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS conflicts (conflict_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, status TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS review_actions (review_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (sequence BIGSERIAL PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, tenant_id TEXT NOT NULL, event_hash TEXT NOT NULL, previous_hash TEXT, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);
