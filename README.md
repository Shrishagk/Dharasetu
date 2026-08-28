# UrbanLand Fusion AI

UrbanLand Fusion AI is a production-oriented prototype for reconciling multi-source urban land data into an explainable **Canonical Urban Land Record (CULR)**. It demonstrates evidence-weighted spatial matching, conflict detection, confidence scoring, and an impact-aware review workflow.

## What it demonstrates

```text
Source datasets → spatial matching → conflict detection → confidence scoring
                → canonical parcel record → human review queue
```

The dashboard lets an operator compare canonical, cadastral, municipal, and AI-building layers; inspect high-priority conflicts; and view the evidence behind a recommended decision.

## Quick start

### Prerequisites

- Docker Desktop running
- Python 3.10+ only if you want to regenerate synthetic data

### Run the application

```powershell
python scripts/generate_synthetic_ward.py
docker compose up -d --build
```

Open:

- Dashboard: `http://localhost:5173`
- API documentation: `http://localhost:8000/docs`
- API health check: `http://localhost:8000/health`

To stop the containers:

```powershell
docker compose down
```

> Do not open `0.0.0.0` in the browser. It is an internal server bind address; use `localhost`.

## Synthetic ward benchmark

`scripts/generate_synthetic_ward.py` produces a deterministic ward with **72 canonical parcels** and five source datasets. The same seed always generates the same data, making the prototype demonstrable and testable.

| Dataset | Purpose |
| --- | --- |
| `ground_truth_parcels.geojson` | Canonical reference geometry |
| `cadastral_parcels.geojson` | Survey-oriented source layer |
| `municipal_parcels.geojson` | Municipal source layer with controlled discrepancies |
| `ai_buildings.geojson` | AI-extracted building footprints |
| `revenue_records.csv` | Revenue attributes and identifiers |

The benchmark deliberately injects eight conflict types: boundary offset, land-use disagreement, duplicate parcel, missing survey identifier, area error, topology overlap, outdated building footprint, and survey-number mismatch.

Ground truth, conflict metadata, and success targets are saved in [data/generated/benchmark_manifest.json](data/generated/benchmark_manifest.json).

## Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web GIS | React, TypeScript, MapLibre GL | Map, source toggles, review queue, evidence ledger |
| API | FastAPI | Dashboard, layer, parcel, and health endpoints |
| Spatial database | PostgreSQL + PostGIS | Production-ready spatial storage foundation |
| Runtime | Docker Compose + Nginx | Repeatable local deployment and API proxying |

## API endpoints

| Endpoint | Description |
| --- | --- |
| `GET /health` | API readiness check |
| `GET /api/v1/dashboard` | Counts and priority-ranked review cases |
| `GET /api/v1/layers/{canonical|cadastral|municipal|buildings}` | GeoJSON map layers |
| `GET /api/v1/parcels/{canonical_parcel_id}` | Parcel geometry, evidence, and AI recommendation |
| `GET /api/v1/sources` | Data source catalog with readiness, validation, provenance, and harmonization metadata |
| `GET /api/v1/sources/{source_id}` | Source detail, schema, validation checks, and preview link |
| `GET /api/v1/sources/{source_id}/preview` | GeoJSON preview for spatial sources |
| `POST /api/v1/sources/upload` | Multipart GeoJSON, JSON, or CSV upload with metadata extraction and validation |
| `POST /api/v1/sources/sample` | Load the deterministic Demo Ward 14 source bundle |
| `POST /api/v1/sources/{source_id}/archive` | Archive a source while retaining its audit metadata |
| `POST /api/v1/harmonization/jobs` | Start a harmonization run for two or more compatible sources |

## Project structure

```text
backend/                 FastAPI service
frontend/                React / MapLibre user interface
data/generated/          Generated GeoJSON, CSV, and benchmark metadata
scripts/                 Deterministic synthetic-data generator
docker-compose.yml       Local service orchestration
project_spec.md          Product and technical specification
```

## Current scope and next steps

This prototype uses controlled source data and rule-based reconciliation responses to provide a reliable demo. The Data Sources workspace now supports real multipart parsing and validation for GeoJSON/CSV uploads, while the current local registry is intentionally held in API memory for fast demo reset. The next production increments are:

1. Persist uploaded source layers and canonical records in PostGIS.
2. Implement CRS normalization, topology repair, and spatial matching jobs.
3. Add XGBoost/Random Forest match probabilities trained on labelled source pairs.
4. Add authentication, role-based review permissions, immutable audit history, and dataset versioning.
5. Add asynchronous raster processing and building segmentation for drone/ORI imagery.
