# UrbanLand Fusion AI

UrbanLand Fusion AI is a production-oriented prototype for reconciling multi-source urban land data into an explainable **Canonical Urban Land Record (CULR)**. It demonstrates graph-based spatial matching, LADM-grounded semantic mapping, conformal confidence scoring, conflict detection, and an impact-aware review workflow.

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
| Fusion engine | Python | Feature graphs, morphology embeddings, Hungarian/many-to-many matching, LADM validation, spatial conformal confidence |
| API | FastAPI | Dashboard, layer, parcel, engine, schema, and health endpoints |
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
| `GET /api/v1/engines/overview` | Active graph, LADM, and conformal engine configuration plus benchmark metrics |
| `GET /api/v1/engines/graphs/{layer}` | Constructed feature graph nodes, embeddings, neighbourhoods, and edges for audit/debug views |
| `POST /api/v1/engines/schema-match` | Map supplied fields to LADM concepts with candidates, rollup/drilldown reasoning, and validation |

## Project structure

```text
backend/                 FastAPI service
frontend/                React / MapLibre user interface
data/generated/          Generated GeoJSON, CSV, and benchmark metadata
scripts/                 Deterministic synthetic-data generator
docker-compose.yml       Local service orchestration
project_spec.md          Product and technical specification
```

## Research engine implementation and next steps

The demo now executes an explainable fusion pipeline instead of returning precomputed reconciliation counts:

1. **Spatial engine:** builds a graph for each vector layer with morphology, absolute position, and relative-neighbourhood signatures; scores candidates; resolves the global assignment with a Hungarian algorithm; and retains many-to-many alternatives for duplicate, split, and merge review.
2. **Semantic engine:** retrieves field-to-concept candidates from an ISO 19152/LADM vocabulary, applies rollup/drilldown reranking using field names and samples, and validates the result against an RDF-compatible LADM knowledge graph. The deterministic reranker is the offline demo fallback for a configured LLM provider.
3. **Confidence engine:** applies a locally weighted split-conformal predictor at 95% coverage, accounting for geographic neighbourhood so the output can be a calibrated singleton, a human-review set, or a null result.

The Data Sources workspace supports real multipart parsing and validation for GeoJSON/CSV uploads, while the local registry is intentionally held in API memory for fast demo reset. The geometry encoder is a dependency-light morphology fallback; production deployment should connect the adapter to Prithvi-EO-2.0 or Clay weights and persist the artifacts in PostGIS. Additional production increments are:

1. Persist uploaded source layers, feature graphs, conformal calibration sets, and canonical records in PostGIS.
2. Connect a hosted LLM reranker and a pretrained raster foundation-model adapter; keep the deterministic fallback for offline operation.
3. Add authentication, role-based review permissions, immutable audit history, and dataset versioning.
4. Add asynchronous raster processing and building segmentation for drone/ORI imagery.
