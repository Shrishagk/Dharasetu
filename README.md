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
| `GET /api/v1/layers/{canonical|cadastral|municipal|buildings|gnss|ground_truth}` | GeoJSON map layers |
| `GET /api/v1/map/context` | Data-derived map extent, coverage boundary, layer counts, and basemap provenance |
| `GET /api/v1/parcels/{canonical_parcel_id}` | Parcel geometry, evidence, and AI recommendation |
| `GET /api/v1/sources` | Data source catalog with readiness, validation, provenance, and harmonization metadata |
| `GET /api/v1/sources/{source_id}` | Source detail, schema, validation checks, and preview link |
| `GET /api/v1/sources/{source_id}/preview` | GeoJSON preview or raster metadata/embedding preview |
| `POST /api/v1/sources/upload` | Multipart GeoJSON, JSON, CSV, GeoTIFF, PNG, or JPEG upload with metadata extraction, CRS normalization, and validation |
| `POST /api/v1/sources/sample` | Load the deterministic Demo Ward 14 source bundle |
| `POST /api/v1/sources/{source_id}/archive` | Archive a source while retaining its audit metadata |
| `POST /api/v1/harmonization/jobs` | Start a harmonization run for two or more compatible sources |
| `GET /api/v1/harmonization/jobs/{job_id}` | Poll an asynchronous job and inspect stage, retry, and result metadata |
| `POST /api/v1/harmonization/jobs/{job_id}/retry` | Retry a failed job within its configured retry budget |
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

The Data Sources workspace supports GeoJSON, CSV, GeoTIFF, PNG, and JPEG
ingestion. Uploaded vectors are CRS-normalized, geometrically audited, and
area-backfilled when necessary; rasters receive metadata, contextual
embeddings, and an explicit segmentation-adapter status. The service persists
the complete reconciliation lineage in PostGIS (or SQLite for local/CI), runs
jobs asynchronously, signs bearer tokens when enabled, applies a request rate
limit, and writes immutable hash-chained audit records. Foundation-model and
hosted-LLM integrations remain explicit adapters with honest offline fallback
metadata.

### Map provenance

The demo map fits its camera to the loaded vector geometries and draws a dashed
data-extent envelope returned by `GET /api/v1/map/context`. The Esri satellite
basemap is contextual imagery only; it may show roads, parks, or landmarks that
are not part of the reviewed land-record layers. The demo parcel and building
overlays remain the deterministic synthetic benchmark until authoritative ward
and parcel data is registered.
