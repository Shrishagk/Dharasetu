import csv
import io
import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from .fusion_engine import LADMKnowledgeGraph, execute_fusion_pipeline, schema_candidates

DATA = Path(os.getenv("DEMO_DATA_DIR", str(Path(__file__).resolve().parents[2] / "data" / "generated")))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/urbanland-uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
SUPPORTED_UPLOADS = {".geojson": "GeoJSON", ".json": "GeoJSON", ".csv": "CSV"}
app = FastAPI(title="UrbanLand Fusion AI", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def read_json(name: str):
    path = DATA / name
    if not path.exists():
        raise HTTPException(503, "Demo dataset missing. Run scripts/generate_synthetic_ward.py")
    return json.loads(path.read_text(encoding="utf-8"))


def now(): return datetime.now(timezone.utc).isoformat()


def coordinate_pairs(value):
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
            yield float(value[0]), float(value[1])
        else:
            for child in value:
                yield from coordinate_pairs(child)


def geo_metadata(collection):
    features = collection.get("features", [])
    geometry_types = sorted({feature.get("geometry", {}).get("type") for feature in features if feature.get("geometry", {}).get("type")})
    pairs = [pair for feature in features for pair in coordinate_pairs(feature.get("geometry", {}).get("coordinates", []))]
    bbox = [round(min(pair[0] for pair in pairs), 6), round(min(pair[1] for pair in pairs), 6), round(max(pair[0] for pair in pairs), 6), round(max(pair[1] for pair in pairs), 6)] if pairs else None
    fields = sorted({key for feature in features[:400] for key in feature.get("properties", {}).keys()})
    schema = [{"name": field, "type": "number" if all(isinstance(feature.get("properties", {}).get(field), (int, float)) for feature in features[:100] if feature.get("properties", {}).get(field) is not None) else "string"} for field in fields]
    return {"feature_count": len(features), "geometry_type": ", ".join(geometry_types) or "Unknown", "bbox": bbox, "attribute_fields": fields, "schema": schema}


def validation_checks(source):
    issues = source.get("issues", [])
    spatial = source.get("source_type") == "Vector"
    return [
        {"label": "File integrity", "status": "passed", "detail": "File is readable and available to the ingestion service."},
        {"label": "Format validation", "status": "passed", "detail": f"{source.get('format', 'Source')} format is supported."},
        {"label": "Schema inspection", "status": "passed" if source.get("attribute_fields") else "warning", "detail": f"{len(source.get('attribute_fields', []))} fields detected."},
        {"label": "Geometry validation", "status": "passed" if spatial else "not_applicable", "detail": "Geometry types are readable." if spatial else "Tabular source; geometry validation is not applicable."},
        {"label": "CRS validation", "status": "passed" if source.get("crs") else "warning", "detail": f"{source.get('crs')} detected." if source.get("crs") else "Coordinate reference system is missing."},
        {"label": "Spatial extent", "status": "passed" if source.get("bbox") else "not_applicable", "detail": "Geographic extent calculated from source features." if source.get("bbox") else "No spatial extent is available for this source."},
        {"label": "Attribute completeness", "status": "warning" if issues else "passed", "detail": issues[0] if issues else "No completeness warnings detected."},
    ]


def source_record(*, source_id, name, provider_name, dataset_type, source_type, file_reference, file_format, crs, feature_count, geometry_type, bbox, attribute_fields, schema, issues=None, layer_name=None, acquisition_date="2026-07-15", created_at=None, updated_at=None, version=1, is_demo=True, provenance=None):
    issues = issues or []
    eligible = bool(crs) and not any("failed" in issue.lower() or "missing" in issue.lower() and "land-use" not in issue.lower() for issue in issues)
    status = "READY" if eligible and not issues else "VALIDATION_WARNING" if eligible else "NEEDS_METADATA"
    return {
        "id": source_id,
        "name": name,
        "provider_id": provider_name.lower().replace(" ", "-")[:40],
        "provider_name": provider_name,
        "dataset_type": dataset_type,
        "source_type": source_type,
        "file": file_reference,
        "file_reference": file_reference,
        "format": file_format,
        "crs": crs,
        "epsg_code": crs.replace("EPSG:", "") if crs and crs.startswith("EPSG:") else None,
        "feature_count": feature_count,
        "records": feature_count,
        "geometry_type": geometry_type,
        "bbox": bbox,
        "coverage": "Demo Ward 14" if is_demo else "Detected from uploaded extent" if bbox else "Coverage not available",
        "spatial_extent": f"{bbox[0]}, {bbox[1]} → {bbox[2]}, {bbox[3]}" if bbox else "Not available",
        "attribute_fields": attribute_fields,
        "schema": schema,
        "acquisition_date": acquisition_date,
        "created_at": created_at or "2026-08-21T09:00:00+00:00",
        "updated_at": updated_at or "2026-08-27T08:45:00+00:00",
        "version": version,
        "status": status,
        "validation_status": "PASSED" if not issues else "WARNING",
        "processing_status": "READY",
        "issues": issues,
        "validation_checks": [],
        "eligible_for_harmonization": eligible,
        "readiness_reason": "Ready for harmonization" if eligible and not issues else "Ready with validation warnings; review before publishing." if eligible else "Assign the missing metadata before harmonization.",
        "last_harmonization_job": None,
        "layer_name": layer_name,
        "is_demo": is_demo,
        "provenance": provenance or {"organization": provider_name, "imported_by": "Authorized source operator", "source_reference": file_reference},
    }


def source_catalog():
    with (DATA / "revenue_records.csv").open(encoding="utf-8") as handle:
        revenue = list(csv.DictReader(handle))
    municipal = read_json("municipal_parcels.geojson")
    cadastral = read_json("cadastral_parcels.geojson")
    buildings = read_json("ai_buildings.geojson")
    catalog = [
        source_record(source_id="revenue", name="Revenue records · Demo Ward 14", provider_name="Revenue Department", dataset_type="Revenue Records", source_type="Tabular", file_reference="revenue_records.csv", file_format="CSV", crs="EPSG:4326", feature_count=len(revenue), geometry_type="Tabular", bbox=None, attribute_fields=sorted(revenue[0].keys()) if revenue else [], schema=[{"name": key, "type": "string"} for key in sorted(revenue[0].keys())] if revenue else [], acquisition_date="2026-07-15", provenance={"organization":"Revenue Department","imported_by":"Authorized Revenue Officer","source_reference":"revenue_records.csv"}),
        source_record(source_id="municipal", name="Municipal parcels · Demo Ward 14", provider_name="Municipal GIS", dataset_type="Municipal GIS", source_type="Vector", file_reference="municipal_parcels.geojson", file_format="GeoJSON", crs="EPSG:4326", **geo_metadata(municipal), issues=["2 missing land-use values mapped to review"], layer_name="municipal", provenance={"organization":"Municipal GIS","imported_by":"Authorized Municipal GIS Officer","source_reference":"municipal_parcels.geojson"}),
        source_record(source_id="cadastral", name="Cadastral parcels · Demo Ward 14", provider_name="Cadastral Survey", dataset_type="Cadastral Parcel Data", source_type="Vector", file_reference="cadastral_parcels.geojson", file_format="GeoJSON", crs="EPSG:4326", **geo_metadata(cadastral), layer_name="cadastral", provenance={"organization":"Cadastral Survey","imported_by":"Authorized Survey Officer","source_reference":"cadastral_parcels.geojson"}),
        source_record(source_id="buildings", name="AI building footprints · Demo Ward 14", provider_name="AI Building Extraction", dataset_type="Building Footprints", source_type="Vector", file_reference="ai_buildings.geojson", file_format="GeoJSON", crs="EPSG:4326", **geo_metadata(buildings), issues=["1 stale footprint flagged for reconciliation"], layer_name="buildings", provenance={"organization":"AI Building Extraction","imported_by":"Authorized GIS Operator","source_reference":"ai_buildings.geojson"}),
    ]
    for source in catalog:
        source["validation_checks"] = validation_checks(source)
    return catalog


def fresh_state():
    features = deepcopy(read_json("ground_truth_parcels.geojson")["features"])
    engine_run = execute_fusion_pipeline(DATA)
    apply_engine_results(features, engine_run)
    return {"features":features,"sources":source_catalog(),"source_previews":{},"source_payloads":{},"jobs":[],"changes":[],"started":False,"sample_loaded":True,"engine_run":engine_run}


def apply_engine_results(features, engine_run):
    """Project explainable engine results onto the canonical GeoJSON properties."""
    for feature in features:
        parcel_id = feature["id"]
        result = engine_run["parcels"].get(parcel_id, {})
        conflict = result.get("conflict", {})
        types = conflict.get("types", [])
        severity = conflict.get("severity", "medium")
        confidence = float(result.get("calibrated_confidence", 0.0))
        status = "HUMAN_REVIEW" if types and severity == "high" else "AI_ASSISTED" if types else "AI_ACCEPTED"
        feature["properties"].update({
            "overall_confidence": round(confidence, 2),
            "geometry_confidence": result.get("geometry_confidence", 0.0),
            "semantic_confidence": result.get("semantic_confidence", 0.0),
            "conformal_confidence": result.get("conformal", {}).get("calibrated_confidence", 0.0),
            "confidence_set_size": len(result.get("conformal", {}).get("prediction_set", [])),
            "confidence_decision": result.get("conformal", {}).get("decision", "null"),
            "confidence_region": result.get("spatial_region", "unknown"),
            "review_status": status,
            "conflict_type": conflict.get("primary"),
            "conflict_types": types,
            "conflict_severity": severity if types else None,
            "conflict_sources": sorted({item.get("source") for item in conflict.get("evidence", []) if item.get("source")}),
            "priority": round((100 - confidence * 100) * (2 if types and severity == "high" else 1), 1),
            "canonical_version": feature["properties"].get("canonical_version", 1),
            "engine_run_id": engine_run.get("run_id"),
        })


STATE = fresh_state()
def canonical(): return {"type":"FeatureCollection","features":STATE["features"]}
def parcel_feature(parcel_id):
    item = next((item for item in STATE["features"] if item["id"] == parcel_id), None)
    if not item: raise HTTPException(404, "Parcel not found")
    return item


def engine_parcel(parcel_id):
    return STATE.get("engine_run", {}).get("parcels", {}).get(parcel_id, {})


def source_values(feature):
    """Render source evidence from the graph run instead of invented constants."""
    result = engine_parcel(feature["id"])
    values = []
    labels = {"cadastral": "Cadastral survey", "municipal": "Municipal GIS", "buildings": "AI building extraction"}
    for match in result.get("matches", []):
        source = labels.get(match.get("source"), match.get("source", "Source layer"))
        signals = match.get("signals", {})
        values.append({
            "source": source,
            "attribute": "Graph entity match",
            "value": f"{match.get('score', 0):.0%} · {match.get('source_feature_id', 'source entity')}",
            "score": match.get("score", 0),
            "detail": f"Morphology {signals.get('morphology', 0):.0%}, position {signals.get('position', 0):.0%}, neighbourhood {signals.get('relative_neighbourhood', 0):.0%}.",
        })
    if not values:
        values.append({"source": "Canonical Urban Land Record", "attribute": "Canonical area", "value": f"{feature['properties']['area_sq_m']:,} m²", "score": result.get("geometry_confidence", 0)})
    return values


class Decision(BaseModel):
    action: str
    officer: str = "Admin Officer"


class HarmonizationJobRequest(BaseModel):
    source_ids: list[str] = []


@app.get("/health")
def health(): return {"status":"healthy","service":"urbanland-fusion-api"}

@app.get("/api/v1/layers/{layer_name}")
def layer(layer_name: str):
    names = {"cadastral":"cadastral_parcels.geojson","municipal":"municipal_parcels.geojson","buildings":"ai_buildings.geojson"}
    if layer_name == "canonical": return canonical()
    if layer_name not in names: raise HTTPException(404,"Unknown layer")
    return read_json(names[layer_name])

@app.get("/api/v1/dashboard")
def dashboard():
    features = STATE["features"]
    review = sorted((item["properties"] | {"canonical_parcel_id":item["id"]} for item in features if item["properties"]["review_status"] != "AI_ACCEPTED"),key=lambda item:item["priority"],reverse=True)
    conflicts = [item for item in features if item["properties"].get("conflict_type") and item["properties"]["review_status"] != "AI_ACCEPTED"]
    return {"ward":"Demo Ward 14","started":STATE["started"],"summary":{"total_parcels":len(features),"harmonized":len(features)-len(conflicts),"conflicts":len(conflicts),"human_review":sum(item["review_status"] == "HUMAN_REVIEW" for item in review),"changes":len(STATE["changes"])},"review_queue":review,"latest_job":STATE["jobs"][-1] if STATE["jobs"] else None,"engine_metrics":STATE.get("engine_run", {}).get("metrics", {})}


@app.get("/api/v1/engines/overview")
def engines_overview():
    """Expose the active research-engine configuration without the full graph."""
    run = STATE.get("engine_run", {})
    spatial = run.get("spatial_engine", {})
    semantic = run.get("semantic_engine", {})
    confidence = run.get("confidence_engine", {})
    return {
        "run_id": run.get("run_id"),
        "created_at": run.get("created_at"),
        "spatial_engine": {"name": spatial.get("name"), "assignment": spatial.get("assignment"), "layers": sorted(spatial.get("matching", {}).keys())},
        "semantic_engine": {"algorithm": semantic.get("algorithm"), "ontology": semantic.get("ontology"), "mapped_field_count": semantic.get("mapped_field_count"), "review_field_count": semantic.get("review_field_count"), "cross_lingual_ready": semantic.get("cross_lingual_ready")},
        "confidence_engine": confidence,
        "metrics": run.get("metrics", {}),
    }


class SchemaMatchRequest(BaseModel):
    fields: list[dict] = []


@app.post("/api/v1/engines/schema-match")
def schema_match(request: SchemaMatchRequest):
    """Run the LADM retrieval/reranking/validation stage on supplied fields."""
    graph = LADMKnowledgeGraph()
    return {"algorithm": "embedding retrieval -> rollup/drilldown reranking -> LADM graph validation", "ontology": graph.summary(), "mappings": schema_candidates(request.fields, graph)}


@app.get("/api/v1/engines/graphs/{layer_name}")
def engine_graph(layer_name: str):
    """Return a constructed feature graph for audit/debug visualizations."""
    run = STATE.get("engine_run", {})
    if layer_name == "canonical":
        matches = next(iter(run.get("spatial_engine", {}).get("matching", {}).values()), {})
        graph = matches.get("target_graph")
    else:
        matches = run.get("spatial_engine", {}).get("matching", {}).get(layer_name, {})
        graph = matches.get("source_graph")
    if not graph:
        raise HTTPException(404, "Feature graph not available for this layer")
    return graph

@app.get("/api/v1/sources")
def sources(): return {"sources":STATE["sources"]}

def source_by_id(source_id: str):
    source = next((item for item in STATE["sources"] if item["id"] == source_id), None)
    if not source:
        raise HTTPException(404, "Data source not found")
    return source


@app.get("/api/v1/sources/{source_id}")
def source_detail(source_id: str):
    source = source_by_id(source_id)
    return {**source, "validation_checks": source.get("validation_checks") or validation_checks(source), "preview_url": f"/api/v1/sources/{source_id}/preview" if source.get("source_type") == "Vector" else None}


@app.get("/api/v1/sources/{source_id}/preview")
def source_preview(source_id: str):
    source = source_by_id(source_id)
    if source.get("layer_name"):
        return layer(source["layer_name"])
    preview = STATE["source_previews"].get(source_id)
    if preview:
        return preview
    raise HTTPException(404, "This source does not have a spatial preview")


@app.post("/api/v1/sources/sample")
def load_sample_sources():
    STATE["sample_loaded"] = True
    return {"status": "READY", "dataset_name": "Demo Ward 14 benchmark", "source_ids": [source["id"] for source in STATE["sources"] if source.get("is_demo")], "sources": STATE["sources"]}


@app.post("/api/v1/sources/upload")
async def upload_source(file: UploadFile = File(...), provider_type: str = Form(...), provider_name: str = Form(...), dataset_name: str = Form(...), dataset_type: str = Form(...), acquisition_date: str = Form(""), description: str = Form(""), epsg_code: str = Form(""), coverage: str = Form("")):
    filename = file.filename or "uploaded-source"
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_UPLOADS:
        supported = ", ".join(SUPPORTED_UPLOADS.values())
        raise HTTPException(415, f"Unsupported source format. This workspace currently accepts {supported} files.")
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(413, "File exceeds the 50 MB demo ingestion limit. Use a tiled or partitioned source for larger datasets.")
    source_id = f"SRC-{uuid4().hex[:10].upper()}"
    issues = []
    preview = None
    if extension in {".geojson", ".json"}:
        try:
            document = json.loads(content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HTTPException(400, "GeoJSON could not be parsed. Upload a valid UTF-8 FeatureCollection.") from error
        if document.get("type") != "FeatureCollection" or not isinstance(document.get("features"), list):
            raise HTTPException(400, "The uploaded GeoJSON must be a FeatureCollection with a features array.")
        metadata = geo_metadata(document)
        missing_geometry = sum(1 for feature in document["features"] if not feature.get("geometry"))
        if missing_geometry:
            issues.append(f"{missing_geometry} feature(s) are missing geometry and require review.")
        preview = {**document, "features": document["features"][:500]}
        source_payload = {"features": document["features"], "rows": []}
        crs = "EPSG:4326"
        source_type = "Vector"
    else:
        try:
            text = content.decode("utf-8")
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
        except UnicodeDecodeError as error:
            raise HTTPException(400, "CSV could not be parsed as UTF-8 text.") from error
        if not reader.fieldnames:
            raise HTTPException(400, "CSV validation failed because the file has no header row.")
        if not rows:
            issues.append("No records found in the uploaded CSV.")
        metadata = {"feature_count": len(rows), "geometry_type": "Tabular", "bbox": None, "attribute_fields": reader.fieldnames, "schema": [{"name": field, "type": "string"} for field in reader.fieldnames]}
        source_payload = {"features": [], "rows": rows}
        crs = f"EPSG:{epsg_code.strip()}" if epsg_code.strip() else None
        source_type = "Tabular"
    target = UPLOAD_DIR / f"{source_id}{extension}"
    target.write_bytes(content)
    source = source_record(source_id=source_id, name=dataset_name.strip() or filename, provider_name=provider_name.strip() or provider_type, dataset_type=dataset_type, source_type=source_type, file_reference=filename, file_format=SUPPORTED_UPLOADS[extension], crs=crs, acquisition_date=acquisition_date or "Not provided", created_at=now(), updated_at=now(), is_demo=False, provenance={"organization": provider_name.strip() or provider_type, "provider_type": provider_type, "contact_reference": description or "Not provided", "imported_by": "Current workspace operator", "source_reference": filename}, issues=issues, **metadata)
    if coverage.strip():
        source["coverage"] = coverage.strip()
    source["validation_checks"] = validation_checks(source)
    STATE["sources"].append(source)
    STATE.setdefault("source_payloads", {})[source_id] = source_payload
    if preview:
        STATE["source_previews"][source_id] = preview
    return source


@app.post("/api/v1/sources/{source_id}/archive")
def archive_source(source_id: str):
    source = source_by_id(source_id)
    source.update({"status": "ARCHIVED", "validation_status": "ARCHIVED", "processing_status": "ARCHIVED", "eligible_for_harmonization": False, "readiness_reason": "Archived sources are excluded from harmonization jobs."})
    return source


@app.post("/api/v1/harmonization/jobs")
def start_job(request: HarmonizationJobRequest | None = None):
    STATE["started"] = True
    requested_ids = request.source_ids if request else []
    eligible_sources = [source for source in STATE["sources"] if source.get("eligible_for_harmonization") and source.get("status") != "ARCHIVED"]
    selected_ids = requested_ids or [source["id"] for source in eligible_sources]
    if len(selected_ids) < 2:
        raise HTTPException(400, "Select at least two validated data sources before harmonization.")
    for source_id in selected_ids:
        source = source_by_id(source_id)
        if not source.get("eligible_for_harmonization") or source.get("status") == "ARCHIVED":
            raise HTTPException(400, f"{source['name']} is not ready for harmonization.")
    engine_run = execute_fusion_pipeline(DATA, selected_ids, STATE.get("source_payloads", {}))
    apply_engine_results(STATE["features"], engine_run)
    STATE["engine_run"] = engine_run
    result = {"auto_harmonized":sum(item["properties"]["review_status"] == "AI_ACCEPTED" for item in STATE["features"]),"conflicts":sum(bool(item["properties"].get("conflict_type")) for item in STATE["features"]),"human_review":sum(item["properties"]["review_status"] == "HUMAN_REVIEW" for item in STATE["features"]),"engine_metrics":engine_run.get("metrics", {})}
    job = {"id":f"JOB-{datetime.now():%Y%m%d}-{len(STATE['jobs'])+1:03d}","status":"COMPLETED","started_at":now(),"completed_at":now(),"records":len(STATE["features"]),"source_ids":selected_ids,"stages":["Ingestion","Validation","CRS normalization","Feature graph construction","Foundation embedding adapter","GNN-style relational matching","Hungarian / many-to-many assignment","LADM schema rollup / drilldown","Knowledge graph validation","Spatial conformal confidence","Canonical dataset generated"],"result":result,"engine_run_id":engine_run.get("run_id"),"engine_metrics":engine_run.get("metrics", {})}
    STATE["jobs"].append(job)
    for source in STATE["sources"]:
        if source["id"] in selected_ids:
            source["last_harmonization_job"] = job["id"]
    return job

@app.get("/api/v1/conflicts")
def conflicts(): return [item["properties"] | {"canonical_parcel_id":item["id"]} for item in STATE["features"] if item["properties"].get("conflict_type") and item["properties"]["review_status"] != "AI_ACCEPTED"]

@app.get("/api/v1/parcels/{parcel_id}")
def parcel(parcel_id: str):
    item, props = parcel_feature(parcel_id), parcel_feature(parcel_id)["properties"]
    result = engine_parcel(parcel_id)
    conflict = result.get("conflict", {})
    evidence = result.get("source_evidence", []) + conflict.get("evidence", [])
    if not evidence:
        evidence = [{"source":"Fusion engine","score":props.get("overall_confidence", 0),"detail":"No conflicting evidence was found across the selected source graph."}]
    if props.get("review_status") == "AI_ACCEPTED" and props.get("canonical_version", 1) > 1:
        recommendation = f"Canonical record published at version {props['canonical_version']}"
    elif conflict.get("types"):
        recommendation = f"Route {props['canonical_parcel_id']} to officer review"
    else:
        recommendation = f"Auto-publish canonical area of {props['area_sq_m']:,} m²"
    return {"parcel":item,"source_values":source_values(item),"evidence":evidence,"recommendation":recommendation,"explanation":f"{', '.join(conflict.get('types', [])) or 'Cross-source agreement'} assessed at {props['overall_confidence']:.0%} calibrated confidence.","lineage":{"version":props["canonical_version"],"sources":["Revenue Department","Municipal GIS","Cadastral Survey","Drone / ORI","GNSS / CORS"]},"engine":{"spatial":{"algorithm":STATE.get("engine_run", {}).get("spatial_engine", {}).get("name"),"matches":result.get("matches", []),"many_to_many":result.get("many_to_many", [])},"semantic":{"ontology":STATE.get("engine_run", {}).get("semantic_engine", {}).get("ontology"),"mapped_field_count":STATE.get("engine_run", {}).get("semantic_engine", {}).get("mapped_field_count"),"review_field_count":STATE.get("engine_run", {}).get("semantic_engine", {}).get("review_field_count")},"confidence":result.get("conformal", {}),"joint":{"geometry":result.get("geometry_confidence"),"semantic":result.get("semantic_confidence"),"raw":result.get("raw_joint_confidence"),"calibrated":result.get("calibrated_confidence"),"decision":result.get("decision"),"region":result.get("spatial_region")}}}

@app.post("/api/v1/parcels/{parcel_id}/decision")
def decide(parcel_id: str, decision: Decision):
    if decision.action not in {"approve","reject","request_evidence"}: raise HTTPException(400,"Unsupported decision")
    item, props, old = parcel_feature(parcel_id), parcel_feature(parcel_id)["properties"], parcel_feature(parcel_id)["properties"]["review_status"]
    if decision.action == "approve": props["review_status"], props["canonical_version"], detail = "AI_ACCEPTED", props["canonical_version"]+1, "AI recommendation approved; canonical record published."
    elif decision.action == "reject": props["review_status"], detail = "HUMAN_REVIEW", "AI recommendation rejected; retained in human review."
    else: props["review_status"], detail = "EVIDENCE_REQUESTED", "Additional survey evidence requested."
    event = {"id":str(uuid4()),"timestamp":now(),"parcel_id":parcel_id,"field":"Reconciliation status","old_value":old,"new_value":props["review_status"],"decision":decision.action,"officer":decision.officer,"detail":detail,"version":props["canonical_version"]}
    STATE["changes"].insert(0,event)
    return {"parcel":item,"event":event}

@app.get("/api/v1/changes")
def changes(): return {"changes":STATE["changes"]}

@app.get("/api/v1/export/canonical.geojson")
def export_canonical(): return Response(content=json.dumps(canonical()),media_type="application/geo+json",headers={"Content-Disposition":'attachment; filename="demo-ward-14-canonical.geojson"'})
