# UrbanLand Fusion AI — Project Handoff

Last updated: 2026-08-26

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

- Live satellite image basemap with reference labels, centered near Bengaluru.
- Synthetic canonical, cadastral, municipal, and AI-building overlays.
- Road centerlines, parcel labels, and click-to-select canonical parcels.
- Selected parcel inspector: survey number, land use, area, confidence, and review status.
- Review queue opens parcel evidence and source-boundary comparison.
- Source-layer visibility toggles.
- Harmonization workflow: processing state, pipeline progression, completion notice, and an executing explainable fusion run.
- AI reconciliation panel: source values, evidence list, confidence, before/after slider, approve/reject feedback.
- Research engine trace: graph/Hungarian matching, LADM knowledge-graph validation, and 95% spatial conformal decision set.
- Frontend production build verified successfully after the latest live-basemap update.

## Important current limitation

The `Run Harmonization` control now executes the dependency-light research pipeline against the deterministic GeoJSON/CSV fixture. It does not yet persist jobs, graphs, calibration sets, or canonical versions in PostGIS, and the foundation-model/LLM stages use explicit offline fallbacks until deployment adapters are configured.

The database container is available but not yet used by the FastAPI code. Persisting the engine artifacts and connecting Prithvi/Clay and an external LLM reranker are the next production increments.

## Recent map implementation

`frontend/src/main.tsx` uses public Esri raster tiles for satellite imagery and reference labels. No API key is needed for the present demo.

For a production deployment, move to a licensed provider and store its key in environment variables. Candidate providers:

- Esri ArcGIS Platform
- Mapbox
- Google Maps Platform

Never commit a provider API key to the repository.

## Suggested next priorities

1. Persist datasets, feature graphs, conformal calibration sets, canonical records, evidence, conflicts, and review actions in PostGIS.
2. Connect a pretrained Prithvi-EO-2.0 or Clay adapter for raster-backed embeddings and a hosted LLM reranker for semantic mappings.
3. Improve the live-map UX with a search input, zoom controls, measurement tool, and source-specific boundary visibility for the selected parcel.
4. Replace synthetic workflow notifications with persisted asynchronous jobs and a real job-status API.
5. Add authentication, role-based approval, immutable review audit logs, and dataset version history.
## Current Objective

The immediate goal is to evolve the existing prototype into a polished SIH-ready demonstration without unnecessarily rewriting working components.

Current priority order:

1. Improve the Web GIS UI/UX and visual hierarchy.
2. Make the map the primary visual focus with realistic parcel/building/road visualization.
3. Add visible map modes:
   - Sources
   - AI Harmonized
   - Before / After
4. Strengthen the AI Reconciliation Workspace and evidence visualization.
5. Improve selected-parcel inspection and conflict visualization.
6. Extend the vector proof-of-concept to PostGIS-backed city-scale reconciliation.

Do not rebuild the application from scratch. Preserve the current working architecture and existing interactive functionality unless there is a concrete reason to change it.

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
