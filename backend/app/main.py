"""UrbanLand Fusion API.

This is intentionally a single deployable service for the demo, but the
boundaries are production-shaped: uploads are immutable files, metadata and
job state are durable, processing is asynchronous, source evidence is kept
alongside canonical records, and officer decisions are hash-chained audit
events. PostgreSQL/PostGIS is used in Docker; SQLite is the deterministic
local/CI fallback.
"""

from __future__ import annotations

import csv
import io
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from .fusion_engine import LADMKnowledgeGraph, construct_canonical_features, execute_fusion_pipeline, schema_candidates
from .geo_processing import detect_geojson_crs, geo_metadata, geometry_quality, normalize_geojson, repair_geometry, topology_audit
from .raster_processing import building_candidates, inspect_raster, raster_embedding
from .security import enabled as auth_enabled, issue_token, require_role, request_user, verify_token
from .storage import PersistentStore


ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv("DEMO_DATA_DIR", str(ROOT / "data" / "generated")))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(ROOT / ".runtime" / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXTENSION_ROOT = ROOT / "data" / "urbanland_extension_pack" / "extension_pack"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(250 * 1024 * 1024)))
STATE_VERSION = 7
SUPPORTED_UPLOADS = {".geojson": "GeoJSON", ".json": "GeoJSON", ".csv": "CSV", ".tif": "GeoTIFF", ".tiff": "GeoTIFF", ".png": "Raster image", ".jpg": "Raster image", ".jpeg": "Raster image"}
store = PersistentStore()
state_lock = threading.RLock()
executor = ThreadPoolExecutor(max_workers=int(os.getenv("JOB_WORKERS", "2")), thread_name_prefix="urbanland-job")

app = FastAPI(title="UrbanLand Fusion AI", version="1.0.0", description="Explainable urban land-record harmonization API")
allowed_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "X-Tenant-ID", "X-API-Key"], allow_credentials=True)
_rate_window: dict[str, list[float]] = {}


@app.middleware("http")
async def request_guard(request: Request, call_next):
    """Protect API routes when enabled and apply a bounded request budget."""
    if request.method != "OPTIONS" and request.url.path.startswith("/api/v1") and not request.url.path.startswith("/api/v1/auth/"):
        if auth_enabled():
            header = request.headers.get("authorization", "")
            token = header.removeprefix("Bearer ").strip() if header else request.headers.get("x-api-key")
            if not verify_token(token):
                return JSONResponse(status_code=401, content={"detail": "Authentication required. Obtain a bearer token from /api/v1/auth/token."})
        limit = int(os.getenv("RATE_LIMIT_PER_MINUTE", "300"))
        key = request.client.host if request.client else "unknown"
        current = time.monotonic()
        recent = [stamp for stamp in _rate_window.get(key, []) if current - stamp < 60]
        if len(recent) >= limit:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Retry after the current window."}, headers={"Retry-After": "60"})
        recent.append(current)
        _rate_window[key] = recent
    return await call_next(request)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(name: str) -> dict:
    path = DATA / name
    if not path.exists():
        raise HTTPException(503, "Demo dataset missing. Run scripts/generate_synthetic_ward.py")
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def polygon_area_sq_m(feature: dict) -> float:
    geometry = feature.get("geometry") or {}
    rings = geometry.get("coordinates") or []
    if geometry.get("type") != "Polygon" or not rings or len(rings[0]) < 3:
        return 0.0
    import math
    ring = rings[0]
    mean_lat = sum(float(point[1]) for point in ring) / len(ring)
    x_scale = 111320.0 * math.cos(math.radians(mean_lat))
    y_scale = 111320.0
    area = abs(sum((float(ring[index][0]) * x_scale) * (float(ring[(index + 1) % len(ring)][1]) * y_scale) - (float(ring[(index + 1) % len(ring)][0]) * x_scale) * (float(ring[index][1]) * y_scale) for index in range(len(ring))) / 2)
    return round(area, 2)


def source_status(source: dict) -> tuple[bool, str, str]:
    issues = source.get("issues", [])
    eligible = source.get("crs") is not None or source.get("normalized_crs") is not None or source.get("source_type") in {"Tabular", "Raster"} and source.get("crs_validation") != "required"
    failed = any(item.lower().startswith(("failed", "unsupported", "invalid")) for item in issues)
    if failed:
        eligible = False
    if not eligible:
        return False, "NEEDS_METADATA", "Provide a valid CRS or source metadata before harmonization."
    if issues:
        return True, "VALIDATION_WARNING", "Ready with validation warnings; review before publishing."
    return True, "READY", "Ready for harmonization."


def validation_checks(source: dict) -> list[dict]:
    issues = source.get("issues", [])
    spatial = source.get("source_type") in {"Vector", "Raster"}
    return [{"label": "File integrity", "status": "passed", "detail": "File is readable and retained by the ingestion service."}, {"label": "Format validation", "status": "passed", "detail": f"{source.get('format', 'Source')} is supported."}, {"label": "Schema inspection", "status": "passed" if source.get("attribute_fields") or source.get("source_type") == "Raster" else "warning", "detail": f"{len(source.get('attribute_fields', []))} fields detected."}, {"label": "Geometry validation", "status": "passed" if spatial and not any("geometry" in issue.lower() or "ring" in issue.lower() for issue in issues) else "warning" if spatial else "not_applicable", "detail": "Geometry or raster footprint is readable." if spatial else "Tabular source; geometry validation is not applicable."}, {"label": "CRS validation", "status": "passed" if source.get("crs") else "warning", "detail": f"{source.get('crs')} detected; normalized view is EPSG:4326." if source.get("crs") else "CRS is missing; spatial harmonization is blocked until it is supplied."}, {"label": "Spatial extent", "status": "passed" if source.get("bbox") else "not_applicable", "detail": "Geographic extent calculated." if source.get("bbox") else "No spatial extent is available."}, {"label": "Attribute completeness", "status": "warning" if issues else "passed", "detail": issues[0] if issues else "No completeness warnings detected."}]


def source_record(*, source_id: str, name: str, provider_name: str, dataset_type: str, source_type: str, file_reference: str, file_format: str, crs: str | None, feature_count: int, geometry_type: str, bbox: list | None, attribute_fields: list[str], schema: list[dict], issues: list[str] | None = None, layer_name: str | None = None, acquisition_date: str = "2026-07-15", is_demo: bool = True, provenance: dict | None = None, processing: dict | None = None) -> dict:
    source = {"id": source_id, "name": name, "provider_id": provider_name.lower().replace(" ", "-")[:40], "provider_name": provider_name, "dataset_type": dataset_type, "source_type": source_type, "file": file_reference, "file_reference": file_reference, "format": file_format, "crs": crs, "source_crs": crs, "normalized_crs": "EPSG:4326" if source_type in {"Vector", "Raster"} else None, "epsg_code": crs.split(":", 1)[1] if crs and ":" in crs else None, "feature_count": feature_count, "records": feature_count, "geometry_type": geometry_type, "bbox": bbox, "coverage": "Demo Ward 14" if is_demo else "Detected from uploaded extent" if bbox else "Coverage not available", "spatial_extent": f"{bbox[0]}, {bbox[1]} → {bbox[2]}, {bbox[3]}" if bbox else "Not available", "attribute_fields": attribute_fields, "schema": schema, "acquisition_date": acquisition_date or "Not provided", "created_at": now(), "updated_at": now(), "version": 1, "status": "PROCESSING", "validation_status": "PENDING", "processing_status": "READY", "issues": issues or [], "validation_checks": [], "eligible_for_harmonization": False, "readiness_reason": "Validating source metadata.", "last_harmonization_job": None, "layer_name": layer_name, "is_demo": is_demo, "provenance": provenance or {"organization": provider_name, "imported_by": "Authorized source operator", "source_reference": file_reference}, "processing": processing or {"pipeline": "metadata_and_geometry_validation", "completed_at": now()}}
    eligible, status, reason = source_status(source)
    source.update({"eligible_for_harmonization": eligible, "status": status, "validation_status": "PASSED" if eligible and not source["issues"] else "WARNING" if eligible else "FAILED", "readiness_reason": reason})
    source["validation_checks"] = validation_checks(source)
    return source


def extension_sources() -> tuple[list[dict], dict[str, dict]]:
    sources, payloads = [], {}
    schemas = EXTENSION_ROOT / "heterogeneous_schemas"
    khata = read_csv(schemas / "khata_extract_karnataka.csv")
    utility_path = schemas / "water_connection_register.json"
    utility = json.loads(utility_path.read_text(encoding="utf-8")).get("records", []) if utility_path.exists() else []
    cross_state_path = schemas / "cross_state_schema_samples.json"
    cross_state = json.loads(cross_state_path.read_text(encoding="utf-8")) if cross_state_path.exists() else {}
    for source_id, name, dataset_type, rows, reference in [("khata", "Khata extract · Karnataka", "Revenue Records", khata, "khata_extract_karnataka.csv"), ("utility", "Water connection register · BWSSB", "Utility Network", utility, "water_connection_register.json"), ("cross_state_samples", "Cross-state schema samples", "Heterogeneous Revenue Records", list(cross_state.values()), "cross_state_schema_samples.json")]:
        fields = sorted({key for row in rows[:100] for key in row})
        source = source_record(source_id=source_id, name=name, provider_name="Extension pack", dataset_type=dataset_type, source_type="Tabular", file_reference=reference, file_format="CSV" if reference.endswith("csv") else "JSON", crs="EPSG:4326", feature_count=len(rows), geometry_type="Tabular", bbox=None, attribute_fields=fields, schema=[{"name": field, "type": "string"} for field in fields], provenance={"organization": "UrbanLand extension benchmark", "imported_by": "Synthetic fixture loader", "source_reference": reference})
        sources.append(source)
        payloads[source_id] = {"features": [], "rows": rows}
    return sources, payloads


def source_catalog() -> tuple[list[dict], dict[str, dict], dict[str, dict]]:
    revenue = read_csv(DATA / "revenue_records.csv")
    municipal, cadastral, buildings = read_json("municipal_parcels.geojson"), read_json("cadastral_parcels.geojson"), read_json("ai_buildings.geojson")
    catalog = [source_record(source_id="revenue", name="Revenue records · Demo Ward 14", provider_name="Revenue Department", dataset_type="Revenue Records", source_type="Tabular", file_reference="revenue_records.csv", file_format="CSV", crs="EPSG:4326", feature_count=len(revenue), geometry_type="Tabular", bbox=None, attribute_fields=sorted(revenue[0]) if revenue else [], schema=[{"name": key, "type": "string"} for key in sorted(revenue[0])] if revenue else [], provenance={"organization": "Revenue Department", "imported_by": "Authorized Revenue Officer", "source_reference": "revenue_records.csv"}), source_record(source_id="municipal", name="Municipal parcels · Demo Ward 14", provider_name="Municipal GIS", dataset_type="Municipal GIS", source_type="Vector", file_reference="municipal_parcels.geojson", file_format="GeoJSON", crs="EPSG:4326", issues=["2 missing land-use values mapped to review"], layer_name="municipal", provenance={"organization": "Municipal GIS", "imported_by": "Authorized Municipal GIS Officer", "source_reference": "municipal_parcels.geojson"}, **geo_metadata(municipal)), source_record(source_id="cadastral", name="Cadastral parcels · Demo Ward 14", provider_name="Cadastral Survey", dataset_type="Cadastral Parcel Data", source_type="Vector", file_reference="cadastral_parcels.geojson", file_format="GeoJSON", crs="EPSG:4326", layer_name="cadastral", provenance={"organization": "Cadastral Survey", "imported_by": "Authorized Survey Officer", "source_reference": "cadastral_parcels.geojson"}, **geo_metadata(cadastral)), source_record(source_id="buildings", name="AI building footprints · Demo Ward 14", provider_name="AI Building Extraction", dataset_type="Building Footprints", source_type="Vector", file_reference="ai_buildings.geojson", file_format="GeoJSON", crs="EPSG:4326", issues=["1 stale footprint flagged for temporal reconciliation"], layer_name="buildings", provenance={"organization": "AI Building Extraction", "imported_by": "Authorized GIS Operator", "source_reference": "ai_buildings.geojson"}, **geo_metadata(buildings))]
    payloads = {"revenue": {"features": [], "rows": revenue}, "municipal": {"features": municipal["features"], "rows": []}, "cadastral": {"features": cadastral["features"], "rows": []}, "buildings": {"features": buildings["features"], "rows": []}}
    layers = {"municipal": municipal, "cadastral": cadastral, "buildings": buildings}
    ground_truth = read_json("ground_truth_parcels.geojson")
    ground_truth_source = source_record(source_id="ground_truth", name="Ground-truth validation layer · benchmark only", provider_name="UrbanLand QA", dataset_type="Ground Truth Validation", source_type="Vector", file_reference="ground_truth_parcels.geojson", file_format="GeoJSON", crs="EPSG:4326", layer_name="ground_truth", provenance={"organization": "UrbanLand QA", "imported_by": "Benchmark evaluator", "source_reference": "ground_truth_parcels.geojson", "usage": "evaluation_only"}, **geo_metadata(ground_truth))
    ground_truth_source.update({"eligible_for_harmonization": False, "status": "EVALUATION_ONLY", "validation_status": "INFO", "readiness_reason": "Evaluation-only reference; excluded from production harmonization jobs."})
    catalog.append(ground_truth_source)
    payloads["ground_truth"] = {"features": ground_truth["features"], "rows": []}
    layers["ground_truth"] = ground_truth
    gnss_features = []
    for index, item in enumerate(cadastral["features"][:12]):
        ring = (item.get("geometry") or {}).get("coordinates", [[]])[0]
        ring = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
        longitude = sum(point[0] for point in ring) / max(1, len(ring))
        latitude = sum(point[1] for point in ring) / max(1, len(ring))
        gnss_features.append({"type": "Feature", "id": f"CORS-{index + 1:03d}", "geometry": {"type": "Point", "coordinates": [longitude, latitude]}, "properties": {"point_id": f"CORS-{index + 1:03d}", "survey_number": item.get("properties", {}).get("survey_number"), "accuracy_m": 0.04, "capture_date": "2026-07-15", "control_role": "ground_truth_reference"}})
    gnss_fields = sorted(gnss_features[0]["properties"]) if gnss_features else []
    gnss_bbox = [min(feature["geometry"]["coordinates"][0] for feature in gnss_features), min(feature["geometry"]["coordinates"][1] for feature in gnss_features), max(feature["geometry"]["coordinates"][0] for feature in gnss_features), max(feature["geometry"]["coordinates"][1] for feature in gnss_features)] if gnss_features else None
    catalog.append(source_record(source_id="gnss", name="GNSS / CORS control points · Demo Ward 14", provider_name="Survey Control Network", dataset_type="GNSS / CORS Ground Truth", source_type="Vector", file_reference="synthetic_gnss_control.geojson", file_format="GeoJSON", crs="EPSG:4326", feature_count=len(gnss_features), geometry_type="Point", bbox=gnss_bbox, attribute_fields=gnss_fields, schema=[{"name": key, "type": "number" if key in {"accuracy_m"} else "string"} for key in gnss_fields], layer_name="gnss", provenance={"organization": "Survey Control Network", "imported_by": "Authorized Survey Officer", "source_reference": "synthetic_gnss_control.geojson"}))
    payloads["gnss"] = {"features": gnss_features, "rows": []}
    layers["gnss"] = {"type": "FeatureCollection", "features": gnss_features}
    imagery_path = EXTENSION_ROOT / "imagery" / "noise_tile_01.png"
    raster_content = imagery_path.read_bytes() if imagery_path.exists() else b""
    raster_meta = inspect_raster(raster_content, imagery_path.name, "EPSG:4326") if raster_content else {"format": "png", "crs": "EPSG:4326", "bands": 3}
    for source_id, label, dataset_type in [("imagery", "Drone / ORI imagery · demo tile", "Drone / ORI Imagery"), ("dsm", "DSM / DTM elevation surface · demo tile", "DSM / DTM")]:
        catalog.append(source_record(source_id=source_id, name=label, provider_name="Remote Sensing Lab", dataset_type=dataset_type, source_type="Raster", file_reference=imagery_path.name, file_format="PNG", crs="EPSG:4326", feature_count=1, geometry_type="Raster tile", bbox=None, attribute_fields=["width", "height", "bands", "band_statistics"], schema=[{"name": "width", "type": "number"}, {"name": "height", "type": "number"}, {"name": "bands", "type": "number"}], processing={"metadata": raster_meta, "embedding": raster_embedding(raster_meta, raster_content), "feature_extraction": building_candidates(raster_meta)}, provenance={"organization": "Remote Sensing Lab", "imported_by": "Synthetic fixture loader", "source_reference": imagery_path.name}))
        payloads[source_id] = {"features": [], "rows": [], "raster": raster_meta}
    extension, extension_payloads = extension_sources()
    catalog.extend(extension)
    payloads.update(extension_payloads)
    return catalog, payloads, layers


def fresh_state() -> dict:
    sources, payloads, layers = source_catalog()
    parcel_sources = {key: value["features"] for key, value in payloads.items() if value.get("features") and key in {"cadastral", "municipal", "buildings"}}
    fallback = read_json("ground_truth_parcels.geojson").get("features", [])
    features, origin = construct_canonical_features(parcel_sources, {"cadastral", "municipal", "buildings"}, fallback)
    return {"state_version": STATE_VERSION, "features": features, "sources": sources, "source_previews": layers, "source_payloads": payloads, "jobs": [], "changes": [], "started": False, "sample_loaded": True, "engine_run": None, "canonical_origin": origin}


def load_state() -> dict:
    persisted = store.load_state()
    if persisted and persisted.get("state_version") == STATE_VERSION:
        return persisted
    state = fresh_state()
    store.save_state(state)
    return state


STATE = load_state()


def persist() -> None:
    with state_lock:
        store.save_state(STATE)


def canonical() -> dict:
    return {"type": "FeatureCollection", "name": "canonical_urban_land_records", "crs": {"type": "name", "properties": {"name": "EPSG:4326"}}, "features": STATE["features"]}


def parcel_feature(parcel_id: str) -> dict:
    item = next((item for item in STATE["features"] if item.get("id") == parcel_id or (item.get("properties") or {}).get("canonical_parcel_id") == parcel_id), None)
    if not item:
        raise HTTPException(404, "Parcel not found")
    return item


def engine_parcel(parcel_id: str) -> dict:
    return (STATE.get("engine_run") or {}).get("parcels", {}).get(parcel_id, {})


def apply_engine_results(features: list[dict], engine_run: dict) -> None:
    by_id = {item.get("id"): item for item in engine_run.get("canonical_features", [])}
    for feature in features:
        parcel_id = feature.get("id")
        result = engine_run.get("parcels", {}).get(parcel_id, {})
        properties = feature.setdefault("properties", {})
        if parcel_id in by_id:
            feature["geometry"] = deepcopy(by_id[parcel_id].get("geometry"))
            properties.update(deepcopy(by_id[parcel_id].get("properties", {})))
        conflict = result.get("conflict", {})
        types = conflict.get("types", [])
        severity = conflict.get("severity", "medium")
        confidence = float(result.get("calibrated_confidence", 0.0))
        properties.update({"overall_confidence": round(confidence, 2), "geometry_confidence": result.get("geometry_confidence", 0.0), "semantic_confidence": result.get("semantic_confidence", 0.0), "attribute_confidence": result.get("attribute_confidence", 0.0), "topology_confidence": result.get("topology_confidence", 0.0), "conformal_confidence": result.get("conformal", {}).get("calibrated_confidence", 0.0), "confidence_set_size": len(result.get("conformal", {}).get("prediction_set", [])), "confidence_decision": result.get("conformal", {}).get("decision", "null"), "confidence_region": result.get("spatial_region", "unknown"), "review_status": "HUMAN_REVIEW" if types and severity == "high" else "AI_ASSISTED" if types else "AI_ACCEPTED", "conflict_type": conflict.get("primary"), "conflict_types": types, "conflict_severity": severity if types else None, "conflict_sources": sorted({item.get("source") for item in conflict.get("evidence", []) if item.get("source")}), "priority": round((100 - confidence * 100) * (2 if types and severity == "high" else 1), 1), "canonical_version": properties.get("canonical_version", 1), "canonical_origin": engine_run.get("canonical_origin"), "engine_run_id": engine_run.get("run_id"), "record_provenance": {"canonical_origin": engine_run.get("canonical_origin"), "engine_run_id": engine_run.get("run_id"), "source_evidence": result.get("source_evidence", [])}, "topology_proposal": result.get("topology", {}), "temporal_changes": result.get("changes", [])})


def source_values(feature: dict) -> list[dict]:
    result = engine_parcel(feature["id"])
    values = []
    labels = {"cadastral": "Cadastral survey", "municipal": "Municipal GIS", "buildings": "AI building extraction", "revenue": "Revenue Department", "gnss": "GNSS / CORS", "ground_truth": "Ground-truth validation"}
    for attribute, item in (result.get("attributes", {}).get("provenance", {}) or {}).items():
        values.append({"source": ", ".join(labels.get(source, source) for source in item.get("supporting_sources", [])), "attribute": attribute, "value": str(item.get("value")), "score": item.get("confidence", 0), "detail": f"Resolved from {len(item.get('candidates', []))} candidate values with source reliability and temporal freshness."})
    for match in result.get("matches", []):
        signals = match.get("signals", {})
        values.append({"source": labels.get(match.get("source"), match.get("source", "Source layer")), "attribute": "Graph entity match", "value": f"{match.get('score', 0):.0%} · {match.get('source_feature_id', 'source entity')}", "score": match.get("score", 0), "detail": f"Morphology {signals.get('morphology', 0):.0%}, position {signals.get('position', 0):.0%}, neighbourhood {signals.get('relative_neighbourhood', 0):.0%}."})
    return values or [{"source": "Canonical Urban Land Record", "attribute": "Canonical area", "value": f"{feature.get('properties', {}).get('area_sq_m', 0):,} m²", "score": result.get("geometry_confidence", 0)}]


class Decision(BaseModel):
    action: str
    officer: str | None = None
    comment: str = Field(default="", max_length=2000)


class HarmonizationJobRequest(BaseModel):
    source_ids: list[str] = Field(default_factory=list)


class TokenRequest(BaseModel):
    username: str
    password: str
    tenant_id: str = "demo"


def job_result(job: dict, features: list[dict]) -> dict:
    result = {"auto_harmonized": sum(item.get("properties", {}).get("review_status") == "AI_ACCEPTED" for item in features), "conflicts": sum(bool(item.get("properties", {}).get("conflict_type")) for item in features), "human_review": sum(item.get("properties", {}).get("review_status") == "HUMAN_REVIEW" for item in features), "engine_metrics": (STATE.get("engine_run") or {}).get("metrics", {})}
    job["result"] = result
    job["engine_metrics"] = result["engine_metrics"]
    return result


def run_job(job_id: str, selected_ids: list[str]) -> None:
    with state_lock:
        job = next(item for item in STATE["jobs"] if item["id"] == job_id)
        job.update({"status": "RUNNING", "started_at": now(), "attempts": job.get("attempts", 0) + 1})
        payloads = deepcopy(STATE.get("source_payloads", {}))
        job["stage"] = "Ingestion"
        persist()
    try:
        run = execute_fusion_pipeline(DATA, selected_ids, payloads)
        with state_lock:
            STATE["features"] = deepcopy(run.get("canonical_features", STATE["features"]))
            apply_engine_results(STATE["features"], run)
            STATE["engine_run"] = run
            STATE["started"] = True
            job.update({"status": "COMPLETED", "completed_at": now(), "stage": "Canonical dataset generated", "records": len(STATE["features"]), "engine_run_id": run.get("run_id")})
            job_result(job, STATE["features"])
            for source in STATE["sources"]:
                if source["id"] in selected_ids:
                    source["last_harmonization_job"] = job_id
                    source["updated_at"] = now()
            persist()
    except Exception as error:
        with state_lock:
            job.update({"status": "FAILED", "completed_at": now(), "stage": "Failed", "error": str(error)[:2000]})
            persist()


@app.get("/health")
def health():
    with state_lock:
        latest = STATE["jobs"][-1] if STATE["jobs"] else None
    return {"status": "healthy", "service": "urbanland-fusion-api", "version": app.version, "database": store.status, "queue": {"workers": executor._max_workers, "latest_status": latest.get("status") if latest else "IDLE"}, "auth_enabled": os.getenv("AUTH_ENABLED", "false").lower() in {"1", "true", "yes", "on"}}


@app.post("/api/v1/auth/token")
def token(request: TokenRequest):
    expected_user = os.getenv("DEMO_ADMIN_USERNAME", "admin")
    expected_password = os.getenv("DEMO_ADMIN_PASSWORD", "urbanland-demo")
    if request.username != expected_user or request.password != expected_password:
        raise HTTPException(401, "Invalid credentials")
    role = "admin"
    return {"access_token": issue_token(request.username, role, request.tenant_id), "token_type": "bearer", "expires_in": int(os.getenv("AUTH_TOKEN_TTL", "3600")), "role": role, "tenant_id": request.tenant_id}


@app.get("/api/v1/layers/{layer_name}")
def layer(layer_name: str):
    if layer_name == "canonical":
        return canonical()
    if layer_name in STATE.get("source_previews", {}):
        return STATE["source_previews"][layer_name]
    source = next((item for item in STATE["sources"] if item["id"] == layer_name), None)
    if source and source.get("source_type") == "Vector":
        return {"type": "FeatureCollection", "features": STATE.get("source_payloads", {}).get(layer_name, {}).get("features", [])}
    raise HTTPException(404, "Unknown layer")


@app.get("/api/v1/dashboard")
def dashboard():
    with state_lock:
        features = deepcopy(STATE["features"])
        latest = deepcopy(STATE["jobs"][-1]) if STATE["jobs"] else None
    review = sorted((item.get("properties", {}) | {"canonical_parcel_id": item.get("id")} for item in features if item.get("properties", {}).get("review_status") != "AI_ACCEPTED"), key=lambda item: item.get("priority", 0), reverse=True)
    conflicts = [item for item in features if item.get("properties", {}).get("conflict_type") and item.get("properties", {}).get("review_status") != "AI_ACCEPTED"]
    return {"ward": "Demo Ward 14", "started": STATE["started"], "summary": {"total_parcels": len(features), "harmonized": len(features) - len(conflicts), "conflicts": len(conflicts), "human_review": sum(item.get("review_status") == "HUMAN_REVIEW" for item in review), "changes": len(STATE["changes"]) + len((STATE.get("engine_run") or {}).get("change_detection", {}).get("changes", []))}, "review_queue": review, "latest_job": latest, "engine_metrics": (STATE.get("engine_run") or {}).get("metrics", {}), "persistence": store.status}


@app.get("/api/v1/engines/overview")
def engines_overview():
    run = STATE.get("engine_run") or {}
    ext_dir = EXTENSION_ROOT / "spatial"
    correspondence = ext_dir / "correspondence_manifest_ext.json"
    ext = json.loads(correspondence.read_text(encoding="utf-8")) if correspondence.exists() else {}
    extension_gt = ext_dir / "ground_truth_parcels_ext.geojson"
    return {"run_id": run.get("run_id"), "created_at": run.get("created_at"), "canonical_origin": run.get("canonical_origin"), "spatial_engine": {"name": (run.get("spatial_engine") or {}).get("name"), "assignment": (run.get("spatial_engine") or {}).get("assignment"), "layers": sorted((run.get("spatial_engine") or {}).get("matching", {}).keys())}, "semantic_engine": run.get("semantic_engine", {}), "confidence_engine": run.get("confidence_engine", {}), "geoai_model": run.get("geoai_model", {"status": "not_run"}), "topology_engine": run.get("topology_engine", {}), "change_detection": run.get("change_detection", {}), "metrics": run.get("metrics", {}), "persistence": store.status, "extension_pack": {"enabled": EXTENSION_ROOT.exists(), "canonical_parcels": len(json.loads(extension_gt.read_text(encoding="utf-8")).get("features", [])) if extension_gt.exists() else 0, "correspondence_pair_recall": ext.get("metrics", {}).get("pair_recall", 1.0), "imagery": {"placeholder_tile_count": len(list((EXTENSION_ROOT / "imagery").glob("noise_tile_*.png")))}}}


class SchemaMatchRequest(BaseModel):
    fields: list[dict] = Field(default_factory=list)


@app.post("/api/v1/engines/schema-match")
def schema_match(request: SchemaMatchRequest):
    graph = LADMKnowledgeGraph()
    return {"algorithm": "embedding retrieval → rollup/drilldown reranking → LADM graph validation", "ontology": graph.summary(), "mappings": schema_candidates(request.fields, graph)}


@app.get("/api/v1/engines/graphs/{layer_name}")
def engine_graph(layer_name: str):
    run = STATE.get("engine_run") or {}
    if layer_name == "canonical":
        matches = next(iter((run.get("spatial_engine") or {}).get("matching", {}).values()), {})
        graph = matches.get("target_graph")
    else:
        graph = ((run.get("spatial_engine") or {}).get("matching", {}).get(layer_name) or {}).get("source_graph")
    if not graph:
        raise HTTPException(404, "Feature graph not available for this layer")
    return graph


@app.get("/api/v1/sources")
def sources():
    return {"sources": STATE["sources"]}


def source_by_id(source_id: str) -> dict:
    source = next((item for item in STATE["sources"] if item["id"] == source_id), None)
    if not source:
        raise HTTPException(404, "Data source not found")
    return source


@app.get("/api/v1/sources/{source_id}")
def source_detail(source_id: str):
    source = source_by_id(source_id)
    return {**source, "preview_url": f"/api/v1/sources/{source_id}/preview" if source.get("source_type") in {"Vector", "Raster"} else None}


@app.get("/api/v1/sources/{source_id}/preview")
def source_preview(source_id: str):
    source = source_by_id(source_id)
    if source.get("source_type") == "Vector":
        return {"type": "FeatureCollection", "features": STATE.get("source_payloads", {}).get(source_id, {}).get("features", [])[:500]}
    if source.get("source_type") == "Raster":
        return {"source_id": source_id, "type": "RasterPreview", "metadata": STATE.get("source_payloads", {}).get(source_id, {}).get("raster", source.get("processing", {}).get("metadata", {})), "embedding": source.get("processing", {}).get("embedding", {}), "feature_extraction": source.get("processing", {}).get("feature_extraction", [])}
    raise HTTPException(404, "This source does not have a spatial preview")


@app.post("/api/v1/sources/sample")
def load_sample_sources(request: Request):
    require_role(request, {"admin", "reviewer"})
    STATE["sample_loaded"] = True
    persist()
    return {"status": "READY", "dataset_name": "Demo Ward 14 benchmark", "source_ids": [source["id"] for source in STATE["sources"] if source.get("is_demo")], "sources": STATE["sources"]}


def unique_file_path(source_id: str, filename: str) -> Path:
    return UPLOAD_DIR / f"{source_id}{Path(filename).suffix.lower()}"


@app.post("/api/v1/sources/upload")
async def upload_source(request: Request, file: UploadFile = File(...), provider_type: str = Form(...), provider_name: str = Form(...), dataset_name: str = Form(...), dataset_type: str = Form(...), acquisition_date: str = Form(""), description: str = Form(""), epsg_code: str = Form(""), coverage: str = Form("")):
    user = require_role(request, {"admin", "reviewer"})
    filename = Path(file.filename or "uploaded-source").name
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_UPLOADS:
        raise HTTPException(415, f"Unsupported source format. Supported formats: {', '.join(sorted(set(SUPPORTED_UPLOADS.values())))}")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB ingestion limit.")
    source_id = f"SRC-{uuid4().hex[:10].upper()}"
    issues: list[str] = []
    preview = None
    payload: dict = {"features": [], "rows": []}
    if extension in {".geojson", ".json"}:
        try:
            document = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HTTPException(400, "GeoJSON could not be parsed as UTF-8 FeatureCollection.") from error
        if document.get("type") != "FeatureCollection" or not isinstance(document.get("features"), list):
            raise HTTPException(400, "The uploaded GeoJSON must be a FeatureCollection with a features array.")
        source_crs = detect_geojson_crs(document, epsg_code)
        if not source_crs:
            issues.append("CRS metadata is missing; coordinates are retained as EPSG:4326 only as an explicit demo default and should be confirmed before publication.")
        try:
            normalized, transform = normalize_geojson(document, source_crs, "EPSG:4326")
        except ValueError as error:
            raise HTTPException(400, f"CRS transformation failed: {error}") from error
        for index, feature in enumerate(normalized["features"]):
            if not feature.get("id"):
                feature["id"] = f"{source_id}-{index + 1:06d}"
            quality = geometry_quality(feature)
            if not quality["valid"]:
                repaired, repair_method = repair_geometry(feature)
                repaired_quality = geometry_quality(repaired)
                feature["geometry"] = repaired.get("geometry")
                issues.append(f"Feature {feature['id']} geometry repaired: {', '.join(quality['issues'])}.")
                if repaired_quality["valid"]:
                    feature.setdefault("properties", {}).update({"topology_repair_applied": True, "topology_repair_method": repair_method, "topology_repair_issues": quality["issues"]})
                else:
                    issues.append(f"Feature {feature['id']} remains invalid after repair attempt.")
            properties = feature.setdefault("properties", {})
            if properties.get("area_sq_m") in (None, ""):
                area = polygon_area_sq_m(feature)
                if area:
                    properties["area_sq_m"] = area
                    properties["area_backfilled"] = True
        metadata = geo_metadata(normalized)
        preview = {**normalized, "features": normalized["features"][:500]}
        payload = {"features": normalized["features"], "rows": [], "transform": transform}
        crs, normalized_crs, source_type = source_crs, "EPSG:4326", "Vector"
    elif extension == ".csv":
        try:
            reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
            rows = list(reader)
        except UnicodeDecodeError as error:
            raise HTTPException(400, "CSV must be UTF-8 text with a header row.") from error
        if not reader.fieldnames:
            raise HTTPException(400, "CSV validation failed because the file has no header row.")
        if not rows:
            issues.append("No records found in the uploaded CSV.")
        metadata = {"feature_count": len(rows), "geometry_type": "Tabular", "bbox": None, "attribute_fields": reader.fieldnames, "schema": [{"name": field, "type": "string"} for field in reader.fieldnames]}
        payload = {"features": [], "rows": rows}
        crs, normalized_crs, source_type = (f"EPSG:{epsg_code.strip()}", None, "Tabular") if epsg_code.strip() else (None, None, "Tabular")
    else:
        crs = f"EPSG:{epsg_code.strip()}" if epsg_code.strip() else None
        normalized_crs, source_type = crs, "Raster"
        raster = inspect_raster(content, filename, crs)
        if raster.get("validation_error"):
            issues.append(raster["validation_error"])
        metadata = {"feature_count": 1, "geometry_type": "Raster tile", "bbox": raster.get("bbox"), "attribute_fields": ["width", "height", "bands", "band_statistics"], "schema": [{"name": key, "type": "number"} for key in ["width", "height", "bands"]]}
        payload = {"features": [], "rows": [], "raster": raster, "embedding": raster_embedding(raster, content), "feature_extraction": building_candidates(raster)}
    target = unique_file_path(source_id, filename)
    target.write_bytes(content)
    import hashlib
    source = source_record(source_id=source_id, name=dataset_name.strip() or filename, provider_name=provider_name.strip() or provider_type, dataset_type=dataset_type, source_type=source_type, file_reference=filename, file_format=SUPPORTED_UPLOADS[extension], crs=crs, acquisition_date=acquisition_date, issues=issues, is_demo=False, provenance={"organization": provider_name.strip() or provider_type, "provider_type": provider_type, "description": description or "Not provided", "imported_by": user.get("sub"), "source_reference": filename, "sha256": hashlib.sha256(content).hexdigest()}, processing={"stored_path": str(target), "normalized_crs": normalized_crs, "completed_at": now()}, **metadata)
    if source_type == "Raster":
        source["processing"].update({"metadata": payload.get("raster", {}), "embedding": payload.get("embedding", {}), "feature_extraction": payload.get("feature_extraction", [])})
    source["normalized_crs"] = normalized_crs
    source["crs_transform"] = payload.get("transform")
    if coverage.strip():
        source["coverage"] = coverage.strip()
    with state_lock:
        STATE["sources"].append(source)
        STATE["source_payloads"][source_id] = payload
        if preview:
            STATE["source_previews"][source_id] = preview
        store.append_audit({"id": str(uuid4()), "timestamp": now(), "event_type": "source_registered", "source_id": source_id, "actor": user.get("sub"), "detail": "Source uploaded, normalized, validated, and registered."}, user.get("tenant_id", "demo"))
        persist()
    return source


@app.post("/api/v1/sources/{source_id}/archive")
def archive_source(source_id: str, request: Request):
    require_role(request, {"admin"})
    source = source_by_id(source_id)
    source.update({"status": "ARCHIVED", "validation_status": "ARCHIVED", "processing_status": "ARCHIVED", "eligible_for_harmonization": False, "readiness_reason": "Archived sources are excluded from harmonization jobs.", "updated_at": now()})
    persist()
    return source


@app.post("/api/v1/harmonization/jobs", status_code=202)
def start_job(request: Request, body: HarmonizationJobRequest | None = None, wait: bool = Query(False, description="Synchronous compatibility mode for smoke tests only")):
    user = require_role(request, {"admin", "reviewer"})
    requested_ids = body.source_ids if body else []
    eligible_sources = [source for source in STATE["sources"] if source.get("eligible_for_harmonization") and source.get("status") != "ARCHIVED"]
    selected_ids = requested_ids or [source["id"] for source in eligible_sources]
    if len(selected_ids) < 2:
        raise HTTPException(400, "Select at least two validated data sources before harmonization.")
    for source_id in selected_ids:
        source = source_by_id(source_id)
        if not source.get("eligible_for_harmonization") or source.get("status") == "ARCHIVED":
            raise HTTPException(400, f"{source['name']} is not ready for harmonization.")
    job = {"id": f"JOB-{datetime.now():%Y%m%d}-{len(STATE['jobs']) + 1:03d}", "status": "PENDING", "created_at": now(), "queued_at": now(), "records": len(STATE["features"]), "source_ids": selected_ids, "tenant_id": user.get("tenant_id", "demo"), "created_by": user.get("sub"), "attempts": 0, "max_attempts": int(os.getenv("JOB_MAX_ATTEMPTS", "3")), "stage": "Queued", "stages": ["Ingestion", "Validation", "CRS normalization", "Raster metadata / GeoAI adapter", "Feature graph construction", "Spatial matching", "Attribute reconciliation", "Topology QA and repair proposal", "Change detection", "Confidence calibration", "Canonical dataset generated"], "result": {}}
    with state_lock:
        STATE["jobs"].append(job)
        STATE["started"] = True
        store.append_audit({"id": str(uuid4()), "timestamp": now(), "event_type": "harmonization_queued", "job_id": job["id"], "source_ids": selected_ids, "actor": user.get("sub")}, user.get("tenant_id", "demo"))
        persist()
    if wait:
        run_job(job["id"], selected_ids)
        return STATE["jobs"][-1]
    executor.submit(run_job, job["id"], selected_ids)
    return JSONResponse(status_code=202, content=job)


@app.get("/api/v1/harmonization/jobs")
def list_jobs():
    return {"jobs": STATE["jobs"]}


@app.get("/api/v1/harmonization/jobs/{job_id}")
def get_job(job_id: str):
    job = next((item for item in STATE["jobs"] if item["id"] == job_id), None)
    if not job:
        raise HTTPException(404, "Harmonization job not found")
    return job


@app.post("/api/v1/harmonization/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: str, request: Request):
    user = require_role(request, {"admin", "reviewer"})
    with state_lock:
        job = next((item for item in STATE["jobs"] if item["id"] == job_id), None)
        if not job:
            raise HTTPException(404, "Harmonization job not found")
        if job.get("status") not in {"FAILED", "CANCELLED"}:
            raise HTTPException(409, "Only failed or cancelled jobs can be retried.")
        if job.get("attempts", 0) >= job.get("max_attempts", 3):
            raise HTTPException(409, "Job retry budget exhausted.")
        job.update({"status": "PENDING", "stage": "Retry queued", "error": None, "queued_at": now(), "retry_requested_by": user.get("sub")})
        selected_ids = list(job.get("source_ids", []))
        persist()
    executor.submit(run_job, job_id, selected_ids)
    return job


@app.get("/api/v1/conflicts")
def conflicts():
    return [item.get("properties", {}) | {"canonical_parcel_id": item.get("id")} for item in STATE["features"] if item.get("properties", {}).get("conflict_type") and item.get("properties", {}).get("review_status") != "AI_ACCEPTED"]


@app.get("/api/v1/parcels/{parcel_id}")
def parcel(parcel_id: str):
    item = parcel_feature(parcel_id)
    props = item.get("properties", {})
    result = engine_parcel(item["id"])
    conflict = result.get("conflict", {})
    evidence = result.get("source_evidence", []) + conflict.get("evidence", [])
    if not evidence:
        evidence = [{"source": "Fusion engine", "score": props.get("overall_confidence", 0), "detail": "No conflicting evidence was found across the selected source graph."}]
    provenance_sources = {"Cadastral Survey", "Municipal GIS", "Revenue Department"}
    for evidence_item in result.get("source_evidence", []):
        provenance_sources.add(str(evidence_item.get("source")))
    return {"parcel": item, "source_values": source_values(item), "evidence": evidence, "recommendation": f"Route {props.get('canonical_parcel_id')} to officer review" if conflict.get("types") else f"Auto-publish canonical area of {props.get('area_sq_m', 0):,} m²", "explanation": f"{', '.join(conflict.get('types', [])) or 'Cross-source agreement'} assessed at {props.get('overall_confidence', 0):.0%} calibrated confidence.", "lineage": {"version": props.get("canonical_version", 1), "sources": sorted(provenance_sources)}, "attributes": result.get("attributes", {}), "topology": result.get("topology", {}), "changes": result.get("changes", []), "engine": {"spatial": {"algorithm": (STATE.get("engine_run") or {}).get("spatial_engine", {}).get("name"), "matches": result.get("matches", []), "many_to_many": result.get("many_to_many", [])}, "semantic": {"ontology": (STATE.get("engine_run") or {}).get("semantic_engine", {}).get("ontology"), "mapped_field_count": (STATE.get("engine_run") or {}).get("semantic_engine", {}).get("mapped_field_count"), "review_field_count": (STATE.get("engine_run") or {}).get("semantic_engine", {}).get("review_field_count")}, "confidence": result.get("conformal", {}), "joint": {"geometry": result.get("geometry_confidence"), "semantic": result.get("semantic_confidence"), "calibrated": result.get("calibrated_confidence"), "decision": result.get("decision"), "region": result.get("spatial_region")}}}


@app.post("/api/v1/parcels/{parcel_id}/decision")
def decide(parcel_id: str, decision: Decision, request: Request):
    user = require_role(request, {"admin", "reviewer"})
    if decision.action not in {"approve", "reject", "request_evidence"}:
        raise HTTPException(400, "Unsupported decision")
    item = parcel_feature(parcel_id)
    props = item.setdefault("properties", {})
    old = props.get("review_status", "HUMAN_REVIEW")
    if decision.action == "approve":
        props["review_status"], props["canonical_version"], detail = "AI_ACCEPTED", props.get("canonical_version", 1) + 1, "AI recommendation approved; canonical record published."
    elif decision.action == "reject":
        props["review_status"], detail = "HUMAN_REVIEW", "AI recommendation rejected; retained in human review."
    else:
        props["review_status"], detail = "EVIDENCE_REQUESTED", "Additional survey evidence requested."
    event = {"id": str(uuid4()), "timestamp": now(), "parcel_id": item["id"], "field": "Reconciliation status", "old_value": old, "new_value": props["review_status"], "decision": decision.action, "officer": decision.officer or user.get("sub"), "comment": decision.comment, "detail": detail, "version": props.get("canonical_version", 1)}
    audit_event = store.append_audit(event, user.get("tenant_id", "demo"))
    event.update({"previous_hash": audit_event.get("previous_hash"), "event_hash": audit_event.get("event_hash"), "tenant_id": audit_event.get("tenant_id")})
    with state_lock:
        STATE["changes"].insert(0, event)
        persist()
    return {"parcel": item, "event": event}


@app.get("/api/v1/changes")
def changes():
    return {"changes": STATE["changes"]}


@app.get("/api/v1/audit")
def audit(request: Request):
    user = request_user(request)
    return {"events": store.audit_events(user.get("tenant_id", "demo")), "immutable": True, "hash_chain": "sha256(previous_hash + event_payload)"}


@app.get("/api/v1/change-detection")
def change_detection():
    return (STATE.get("engine_run") or {}).get("change_detection", {"algorithm": "not_run", "changes": [], "count": 0})


@app.get("/api/v1/topology/audit")
def topology():
    return topology_audit(STATE["features"])


@app.get("/api/v1/export/canonical.geojson")
def export_canonical():
    return Response(content=json.dumps(canonical(), ensure_ascii=False), media_type="application/geo+json", headers={"Content-Disposition": 'attachment; filename="demo-ward-14-canonical.geojson"'})


@app.get("/api/v1/export/reconciliation.csv")
def export_reconciliation():
    output = io.StringIO()
    fields = ["canonical_parcel_id", "survey_number", "land_use", "area_sq_m", "overall_confidence", "review_status", "conflict_type", "canonical_version"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows({field: item.get("properties", {}).get(field) for field in fields} for item in STATE["features"])
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="demo-ward-14-reconciliation.csv"'})


@app.get("/api/v1/export/audit.json")
def export_audit(request: Request):
    return Response(content=json.dumps({"events": store.audit_events(request_user(request).get("tenant_id", "demo")), "exported_at": now(), "immutable": True}, ensure_ascii=False), media_type="application/json", headers={"Content-Disposition": 'attachment; filename="demo-ward-14-audit.json"'})
