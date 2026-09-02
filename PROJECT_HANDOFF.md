# UrbanLand Fusion AI — Project Handoff

Last updated: 2026-08-31

## Purpose

UrbanLand Fusion AI is a production-oriented prototype for reconciling cadastral, municipal, revenue, and AI-derived urban land data into explainable **Canonical Urban Land Records (CULR)**.

The current build is a runnable, demo-first Web GIS. It uses a controlled synthetic ward with measurable data conflicts and a React/MapLibre interface backed by FastAPI.

## Run locally

Prerequisites: Docker Desktop must be running.

```powershell
python scripts/generate_synthetic_ward.py
docker compose up -d --build
```

Open:

- Dashboard: `http://localhost:5173`
- FastAPI docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/health`

After frontend edits, rebuild only the web service:

```powershell
docker compose up -d --build --force-recreate web
```

Do not browse to `0.0.0.0`; it is a server binding address. Use `localhost`.

## Architecture

| Component | Location | Notes |
| --- | --- | --- |
| Web GIS | `frontend/src/main.tsx` | React, TypeScript, MapLibre GL |
| UI styles | `frontend/src/styles.css` | Government/enterprise GIS layout |
| Fusion engines | `backend/app/fusion_engine.py` | Graph matching, LADM schema mapping, spatial conformal confidence |
| API | `backend/app/main.py` | FastAPI demo endpoints |
| Synthetic data generator | `scripts/generate_synthetic_ward.py` | Deterministic 72-parcel ward |
| Generated data | `data/generated/` | GeoJSON, CSV, benchmark manifest |
| Container stack | `docker-compose.yml` | `web`, `api`, `db` services |

## Current functionality

- Live satellite image basemap used as contextual background; camera and dashed coverage envelope are derived from loaded vector extents.
- Synthetic canonical, cadastral, municipal, and AI-building overlays.
- Road centerlines, parcel labels, and click-to-select canonical parcels.
- Selected parcel inspector: survey number, land use, area, confidence, and review status.
- Review queue opens parcel evidence and source-boundary comparison.
- Source-layer visibility toggles.
- Harmonization workflow: processing state, pipeline progression, completion notice, and an executing explainable fusion run.
- AI reconciliation panel: source values, evidence list, confidence, before/after slider, approve/reject feedback.
- Research engine trace: graph/Hungarian matching, LADM knowledge-graph validation, and 95% spatial conformal decision set.
- Frontend production build verified successfully after the latest live-basemap update.

## Production-demo status

The service now persists source metadata, uploaded payloads, canonical versions,
jobs, matches, evidence, conflicts, review actions, and hash-chained audit
events. Docker requires PostgreSQL/PostGIS; local and CI runs use a durable
SQLite store when no DATABASE_URL is configured. Harmonization is a real asynchronous
job with status polling and retry budget. GeoJSON is normalized to EPSG:4326
from declared EPSG/GeoJSON CRS metadata, raster uploads are inspected and
embedded contextually, and the pipeline exposes attribute provenance, topology
repair proposals, temporal change detection, and a fitted lightweight
scikit-learn matcher when available.

Foundation-model and hosted-LLM adapters remain explicit deployment extension
points: the offline demo never labels deterministic features as a trained
Prithvi/Clay model or an LLM decision.

## Recent map implementation

`frontend/src/main.tsx` and `frontend/src/DemoWorkspace.tsx` use public Esri raster tiles for satellite imagery and reference labels. No API key is needed for the present demo. The workspace calls `GET /api/v1/map/context` to fit the camera to loaded geometries and identify the basemap as context-only. The dashed envelope is a data extent, not an official administrative boundary.

For a production deployment, move to a licensed provider and store its key in environment variables. Candidate providers:

- Esri ArcGIS Platform
- Mapbox
- Google Maps Platform

Never commit a provider API key to the repository.

## Deployment configuration

- `AUTH_ENABLED=true` enables signed bearer tokens from `POST /api/v1/auth/token`.
- `AUTH_SECRET`, `DEMO_ADMIN_USERNAME`, and `DEMO_ADMIN_PASSWORD` must be
  supplied by the deployment secret manager.
- `DATABASE_URL` points to PostGIS in Docker; `STATE_DB_PATH` controls the
  local SQLite store. `ALLOW_SQLITE_FALLBACK=false` prevents silent data
  splitting when production Postgres is unavailable.
- `CORS_ORIGINS`, `RATE_LIMIT_PER_MINUTE`, `JOB_WORKERS`, and `MAX_UPLOAD_BYTES`
  are configurable operational controls.
## Delivery status

The SIH production-oriented demo scope is implemented end to end: controlled
source ingestion, CRS/raster inspection, source-driven canonical construction,
spatial and attribute reconciliation, topology repair proposals, temporal
change detection, async jobs, durable persistence, role-aware access, and
immutable audit events. The remaining deployment work is operational rather
than a missing demo workflow: connect a managed model registry, queue service,
object store, observability stack, and licensed basemap for a city deployment.

## UI/UX Direction

The product should look like a professional government-grade Web GIS rather than a generic AI dashboard.

Design priorities:

- Map-first interface.
- Realistic urban parcel visualization.
- Clear parcel boundaries, roads, buildings, and selected features.
- Strong visual distinction between source datasets and AI-harmonized output.
- AI Reconciliation Workspace should be a major visual component.
- Evidence and confidence should be clearly visible.
- Before/After comparison should be visually compelling.
- Conflict locations should be immediately identifiable.
- Avoid excessive charts and generic AI-chatbot UI.
- Do not add an AI chatbot unless explicitly requested.
- Keep the interface clean, professional, and suitable for a government land-record workflow.

The primary product story is:

Multiple inconsistent datasets
→ AI spatial/attribute reconciliation
→ evidence
→ confidence
→ canonical parcel
→ human approval.

## Do Not Break

Preserve the following existing functionality while making changes:

- Current React/MapLibre application.
- Existing live satellite basemap.
- Parcel selection.
- Parcel inspector.
- Source-layer toggles.
- Review queue.
- Source-boundary comparison.
- Before/after slider.
- Harmonization demo workflow.
- AI reconciliation panel.
- Existing synthetic 72-parcel dataset.
- Existing Docker setup.
- Existing API endpoints.
- Existing frontend styling and interactions unless intentionally improved.

Do not replace working functionality with static mockups.

Before modifying architecture, inspect the existing implementation and reuse working components.
## Data and evaluation

The demo has 72 canonical parcels and eight deliberately injected conflict types:

- Boundary offset
- Land-use disagreement
- Duplicate parcel
- Missing survey identifier
- Area error
- Topology overlap
- Outdated building footprint
- Survey-number mismatch

See `data/generated/benchmark_manifest.json` for the deterministic seed and target metrics.

## Build and troubleshooting

Build the frontend:

```powershell
docker compose build web
```

Useful diagnostics:

```powershell
docker compose ps
docker compose logs web
docker compose logs api
```

Expected successful endpoint behavior:

- `GET /` on port 5173: HTTP 200
- `GET /health` on port 8000: JSON status `healthy`
- `GET /api/v1/dashboard`: HTTP 200

## Working-tree note

At handoff, `frontend/src/main.tsx` and `frontend/src/styles.css` have uncommitted modifications. Preserve them; they contain the current interactive UI and GIS styling work.
