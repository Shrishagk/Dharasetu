"""Generate deterministic, controlled source data for the UrbanLand demo.

No GIS dependency is required: output is GeoJSON/CSV compatible with PostGIS,
GeoPandas and browser map tooling. Coordinates are a local projected-like grid.
"""
import csv
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).parents[1]
OUT = ROOT / "data" / "generated"
random.seed(56000123)

def polygon(x, y, w, h):
    return [[[round(x, 2), round(y, 2)], [round(x+w, 2), round(y, 2)],
             [round(x+w, 2), round(y+h, 2)], [round(x, 2), round(y+h, 2)], [round(x, 2), round(y, 2)]]]

def feature(fid, geom, properties):
    return {"type": "Feature", "id": fid, "properties": properties, "geometry": {"type": "Polygon", "coordinates": geom}}

def collection(features): return {"type": "FeatureCollection", "features": features}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    truth, cadastral, municipal, buildings, conflicts, revenue = [], [], [], [], [], []
    land_uses = ["Residential", "Residential", "Commercial", "Mixed use", "Institutional"]
    conflict_indices = {5: "boundary_offset", 11: "land_use", 19: "duplicate", 27: "missing_id", 34: "area_error", 43: "topology_overlap", 51: "outdated_building", 63: "survey_id"}
    for index in range(72):
        row, col = divmod(index, 12)
        x, y = 77.590 + col * .00118, 12.968 + row * .00110
        w, h = .00094 + (index % 3) * .00004, .00084 + (index % 4) * .00003
        parcel_id = f"CULR-5600{index+1:04d}"
        survey = f"{125 + row}/{col + 1}"
        land_use = land_uses[index % len(land_uses)]
        area = round(w * h * 1.22e10, 1)  # illustrative m² conversion
        props = {"canonical_parcel_id": parcel_id, "survey_number": survey, "land_use": land_use, "area_sq_m": area, "ward": "Demo Ward 14", "capture_date": "2026-07-15"}
        geom = polygon(x, y, w, h)
        truth.append(feature(parcel_id, geom, props))

        # Cadastral is close to truth, municipal has systematic shift / selected errors.
        cadastral_geom = polygon(x + random.uniform(-.000015,.000015), y + random.uniform(-.000015,.000015), w, h)
        cadastral.append(feature(f"CAD-{index+1:03d}", cadastral_geom, {**props, "source_record_id": f"CAD-{index+1:03d}", "source": "Cadastral", "positional_accuracy_m": 1.2}))
        dx, dy = .00003, -.00002
        if index == 5: dx, dy = .00022, -.00012
        municipal_use = "Commercial" if index == 11 else land_use
        municipal_survey = survey if index != 63 else f"{125+row}/{col+2}"
        municipal_geom = polygon(x+dx, y+dy, w*(1.08 if index == 34 else 1), h)
        municipal.append(feature(f"MUN-{index+1:03d}", municipal_geom, {"source_record_id": f"MUN-{index+1:03d}", "source": "Municipal", "survey_number": municipal_survey if index != 27 else None, "land_use": municipal_use, "area_sq_m": round(area*(1.08 if index == 34 else 1.01),1), "capture_date": "2026-06-10", "positional_accuracy_m": 2.5}))
        if index == 19:
            municipal.append(feature("MUN-020-DUP", municipal_geom, {"source_record_id":"MUN-020-DUP", "source":"Municipal", "survey_number": survey, "land_use":land_use, "area_sq_m":area, "capture_date":"2026-06-10", "positional_accuracy_m":2.5}))
        bx, by = x + w*.23, y + h*.23
        buildings.append(feature(f"BLD-{index+1:03d}", polygon(bx,by,w*.54,h*.50), {"building_id":f"BLD-{index+1:03d}", "parcel_hint":parcel_id, "source":"AI building extraction", "confidence":round(.84+(index%14)/100,2), "capture_date":"2026-07-15"}))
        revenue.append({"source_record_id":f"REV-{index+1:03d}", "survey_number":survey, "land_use": land_use if index != 11 else "Residential", "owner_reference":f"OWNER-{1000+index}", "record_year":2024})
        if index in conflict_indices:
            conflicts.append({"canonical_parcel_id":parcel_id, "type":conflict_indices[index], "severity":"high" if index in {5,43,63} else "medium", "expected_detection":True})
    for name, items in [("ground_truth_parcels.geojson",truth),("cadastral_parcels.geojson",cadastral),("municipal_parcels.geojson",municipal),("ai_buildings.geojson",buildings)]:
        (OUT/name).write_text(json.dumps(collection(items), indent=2), encoding="utf-8")
    with (OUT/"revenue_records.csv").open("w", newline="", encoding="utf-8") as fp:
        writer=csv.DictWriter(fp, fieldnames=revenue[0].keys()); writer.writeheader(); writer.writerows(revenue)
    manifest={"seed":56000123,"crs":"EPSG:4326","canonical_parcel_count":72,"source_datasets":["cadastral_parcels.geojson","municipal_parcels.geojson","ai_buildings.geojson","revenue_records.csv"],"injected_conflicts":conflicts,"metrics_target":{"match_f1":.90,"conflict_recall":.90,"auto_resolved_share":.60}}
    (OUT/"benchmark_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Generated 72 parcels and {len(conflicts)} known conflicts in {OUT}")
if __name__ == "__main__": main()
