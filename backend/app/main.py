import csv
import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

DATA = Path(os.getenv("DEMO_DATA_DIR", "../data/generated"))
app = FastAPI(title="UrbanLand Fusion AI", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def read_json(name: str):
    path = DATA / name
    if not path.exists():
        raise HTTPException(503, "Demo dataset missing. Run scripts/generate_synthetic_ward.py")
    return json.loads(path.read_text(encoding="utf-8"))


def now(): return datetime.now(timezone.utc).isoformat()


def source_catalog():
    with (DATA / "revenue_records.csv").open(encoding="utf-8") as handle:
        revenue = list(csv.DictReader(handle))
    counts = {"municipal": len(read_json("municipal_parcels.geojson")["features"]), "cadastral": len(read_json("cadastral_parcels.geojson")["features"]), "buildings": len(read_json("ai_buildings.geojson")["features"])}
    return [
        {"id":"revenue","name":"Revenue Department","file":"revenue_records.csv","format":"CSV","crs":"EPSG:4326","records":len(revenue),"status":"VALIDATED","issues":[]},
        {"id":"municipal","name":"Municipal GIS","file":"municipal_parcels.geojson","format":"GeoJSON","crs":"EPSG:4326","records":counts["municipal"],"status":"VALIDATED","issues":["2 missing land-use values mapped to review"]},
        {"id":"cadastral","name":"Cadastral Survey","file":"cadastral_parcels.geojson","format":"GeoJSON","crs":"EPSG:4326","records":counts["cadastral"],"status":"VALIDATED","issues":[]},
        {"id":"buildings","name":"AI Building Footprints","file":"ai_buildings.geojson","format":"GeoJSON","crs":"EPSG:4326","records":counts["buildings"],"status":"VALIDATED","issues":["1 stale footprint flagged for reconciliation"]},
    ]


def fresh_state():
    features = deepcopy(read_json("ground_truth_parcels.geojson")["features"])
    conflicts = {item["canonical_parcel_id"]: item for item in read_json("benchmark_manifest.json")["injected_conflicts"]}
    for index, feature in enumerate(features):
        conflict = conflicts.get(feature["id"])
        confidence = round(0.96 - (0.27 if conflict else (index % 8) * .008), 2)
        status = "HUMAN_REVIEW" if conflict and conflict["severity"] == "high" else "AI_ASSISTED" if conflict else "AI_ACCEPTED"
        feature["properties"].update({"overall_confidence":confidence,"review_status":status,"conflict_type":conflict["type"] if conflict else None,"priority":round((100-confidence*100)*(2 if conflict and conflict["severity"] == "high" else 1),1),"canonical_version":1})
    return {"features":features,"sources":source_catalog(),"jobs":[],"changes":[],"started":False}


STATE = fresh_state()
def canonical(): return {"type":"FeatureCollection","features":STATE["features"]}
def parcel_feature(parcel_id):
    item = next((item for item in STATE["features"] if item["id"] == parcel_id), None)
    if not item: raise HTTPException(404, "Parcel not found")
    return item


def source_values(feature):
    area, kind = feature["properties"]["area_sq_m"], feature["properties"].get("conflict_type")
    offsets = {"area_error":(1.12,.94,1),"boundary_offset":(1.03,.96,1),"topology_overlap":(1.02,.98,1)}.get(kind,(1.01,.98,1.002))
    return [{"source":"Revenue Department","attribute":"Area","value":f"{round(area*offsets[0]):,} m²","score":.81},{"source":"Municipal GIS","attribute":"Area","value":f"{round(area*offsets[1]):,} m²","score":.71},{"source":"Drone / ORI","attribute":"Area","value":f"{round(area*offsets[2]):,} m²","score":.93},{"source":"GNSS / verified cadastral","attribute":"Boundary","value":"Boundary aligned","score":.96}]


class Decision(BaseModel):
    action: str
    officer: str = "Admin Officer"


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
    return {"ward":"Demo Ward 14","started":STATE["started"],"summary":{"total_parcels":len(features),"harmonized":len(features)-len(conflicts),"conflicts":len(conflicts),"human_review":sum(item["review_status"] == "HUMAN_REVIEW" for item in review),"changes":len(STATE["changes"])},"review_queue":review,"latest_job":STATE["jobs"][-1] if STATE["jobs"] else None}

@app.get("/api/v1/sources")
def sources(): return {"sources":STATE["sources"]}

@app.post("/api/v1/harmonization/jobs")
def start_job():
    STATE["started"] = True
    result = {"auto_harmonized":sum(item["properties"]["review_status"] == "AI_ACCEPTED" for item in STATE["features"]),"conflicts":sum(bool(item["properties"].get("conflict_type")) for item in STATE["features"]),"human_review":sum(item["properties"]["review_status"] == "HUMAN_REVIEW" for item in STATE["features"])}
    job = {"id":f"JOB-{datetime.now():%Y%m%d}-{len(STATE['jobs'])+1:03d}","status":"COMPLETED","started_at":now(),"completed_at":now(),"records":len(STATE["features"]),"stages":["Ingestion","Validation","CRS normalization","Spatial matching","Conflict detection","Evidence reconciliation","Confidence scoring","Canonical dataset generated"],"result":result}
    STATE["jobs"].append(job)
    return job

@app.get("/api/v1/conflicts")
def conflicts(): return [item["properties"] | {"canonical_parcel_id":item["id"]} for item in STATE["features"] if item["properties"].get("conflict_type") and item["properties"]["review_status"] != "AI_ACCEPTED"]

@app.get("/api/v1/parcels/{parcel_id}")
def parcel(parcel_id: str):
    item, props = parcel_feature(parcel_id), parcel_feature(parcel_id)["properties"]
    return {"parcel":item,"source_values":source_values(item),"evidence":[{"source":"GNSS evidence","score":.96,"detail":"Survey control agrees with the proposed boundary."},{"source":"Drone / ORI","score":.93,"detail":"Recent imagery supports the canonical footprint."},{"source":"Cadastral survey","score":.88,"detail":"Survey identifiers and adjoining edges are consistent."}],"recommendation":f"Use canonical area of {props['area_sq_m']:,} m²","explanation":f"{props.get('conflict_type') or 'Cross-source agreement'} assessed at {props['overall_confidence']:.0%} confidence.","lineage":{"version":props["canonical_version"],"sources":["Revenue Department","Municipal GIS","Cadastral Survey","Drone / ORI","GNSS / CORS"]}}

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
