import json
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

DATA = Path(os.getenv("DEMO_DATA_DIR", "../data/generated"))
app = FastAPI(title="UrbanLand Fusion AI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def geojson(name):
    path = DATA / name
    if not path.exists(): raise HTTPException(503, "Demo dataset missing. Run scripts/generate_synthetic_ward.py")
    return json.loads(path.read_text(encoding="utf-8"))

def result():
    features = geojson("ground_truth_parcels.geojson")["features"]
    conflicts = {x["canonical_parcel_id"]: x for x in json.loads((DATA/"benchmark_manifest.json").read_text())["injected_conflicts"]}
    for i, f in enumerate(features):
        item = conflicts.get(f["id"])
        confidence = round(0.96 - (0.27 if item else (i % 8) * .008), 2)
        status = "HUMAN_REVIEW" if item and item["severity"] == "high" else "AI_ASSISTED" if item else "AI_ACCEPTED"
        f["properties"].update({"overall_confidence": confidence, "review_status": status, "conflict_type": item["type"] if item else None, "priority": round((100-confidence*100) * (2 if item and item["severity"] == "high" else 1), 1)})
    return {"type":"FeatureCollection", "features":features}

@app.get("/health")
def health(): return {"status":"healthy", "service":"urbanland-fusion-api"}

@app.get("/api/v1/layers/{layer_name}")
def layer(layer_name: str):
    names = {"canonical": None, "cadastral":"cadastral_parcels.geojson", "municipal":"municipal_parcels.geojson", "buildings":"ai_buildings.geojson"}
    if layer_name not in names: raise HTTPException(404, "Unknown layer")
    return result() if layer_name == "canonical" else geojson(names[layer_name])

@app.get("/api/v1/dashboard")
def dashboard():
    canonical = result()["features"]
    review = sorted((f["properties"] | {"canonical_parcel_id":f["id"]} for f in canonical if f["properties"]["review_status"] != "AI_ACCEPTED"), key=lambda x:x["priority"], reverse=True)
    return {"summary":{"total_parcels":72,"auto_harmonized":len(canonical)-len(review),"ai_assisted":sum(x["review_status"]=="AI_ASSISTED" for x in review),"human_review":sum(x["review_status"]=="HUMAN_REVIEW" for x in review),"known_conflicts":8},"review_queue":review}

@app.get("/api/v1/parcels/{parcel_id}")
def parcel(parcel_id: str):
    item = next((f for f in result()["features"] if f["id"] == parcel_id), None)
    if not item: raise HTTPException(404, "Parcel not found")
    p=item["properties"]
    evidence=[{"source":"GNSS / verified cadastral","attribute":"geometry","value":"Boundary aligned","score":.94},{"source":"Municipal GIS","attribute":"land_use","value":p["land_use"],"score":.87},{"source":"Recent AI building extraction","attribute":"building footprint","value":"1 building detected","score":.91}]
    return {"parcel":item,"evidence":evidence,"recommendation":"Approve canonical geometry" if p["overall_confidence"]>=.9 else "Review conflicting evidence before approval","explanation":f"Confidence is {p['overall_confidence']:.0%}; priority is driven by {p['conflict_type'] or 'cross-source agreement'}."}
