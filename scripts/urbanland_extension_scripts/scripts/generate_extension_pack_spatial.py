"""Generate the SPATIAL extension pack for the UrbanLand demo.

This does NOT touch anything in data/generated/ (the original 72-parcel ward).
It is purely additive: new canonical parcel IDs (CULR-560001xx range, clear of
the original 001-072 range), placed as two new rows immediately south of the
existing 6x12 grid, so the coordinate system stays contiguous and internally
consistent with the original ward.

It exists to cover two gaps the original generator does not cover at all:

1. Many-to-many correspondence. The original data is 1:1 everywhere except one
   literal duplicate (MUN-020-DUP). There is no case where one canonical parcel
   is genuinely subdivided into several municipal sub-parcels, or where several
   canonical parcels are merged into one. Engine 1's entire pitch is that this
   is the hard case naive matchers get wrong -- so the benchmark needs some.

2. Spatial heterogeneity. Every parcel in the original ward has the same noise
   distribution. There is nothing in the data that would make a *spatially
   weighted* conformal predictor behave differently from a global one, which
   undercuts that specific claim in a live demo. This script generates two
   zones with deliberately different, measured noise scales.

Subdivision naming follows the real Karnataka Bhoomi convention: a survey
number's parts are called "Hissa" (e.g. survey 131/1 splitting into Hissa
131/1-1 and 131/1-2), not an invented naming scheme.
"""
import json
import math
from pathlib import Path


def project_root() -> Path:
    for parent in (Path(__file__).resolve().parent, *Path(__file__).resolve().parents):
        if (parent / "data" / "generated").is_dir():
            return parent
    raise RuntimeError("Could not locate the UrbanLand project root containing data/generated")


ROOT = project_root()
OUT = ROOT / "data" / "urbanland_extension_pack" / "extension_pack" / "spatial"
SEED_NOTE = "Deterministic (no RNG): every offset below is an explicit constant, not sampled, so the many-to-many and zone cases are exactly reproducible without needing to pin a random seed."

# Same coordinate convention as scripts/generate_synthetic_ward.py in the
# original data.zip: row,col = divmod(index, 12); x = 77.590 + col*.00118;
# y = 12.968 + row*.00110. We continue at row=6 and row=7 (the original grid
# used rows 0-5), columns 0-5 only (12 new parcels total).
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 108_450.0  # at ~12.97N: 111_320 * cos(12.97deg)


def polygon(x, y, w, h):
    return [[[round(x, 6), round(y, 6)], [round(x + w, 6), round(y, 6)],
             [round(x + w, 6), round(y + h, 6)], [round(x, 6), round(y + h, 6)],
             [round(x, 6), round(y, 6)]]]


def feature(fid, geom, properties):
    return {"type": "Feature", "id": fid, "properties": properties,
            "geometry": {"type": "Polygon", "coordinates": geom}}


def collection(features):
    return {"type": "FeatureCollection", "features": features}


def base_xy(row, col):
    return 77.590 + col * .00118, 12.968 + row * .00110


W, H = .00098, .00086  # same size class as the original ward's parcels


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    truth, cadastral, municipal = [], [], []
    correspondence = []  # the answer key: municipal_id -> [true canonical parcel ids]
    zone_offsets_m = {"dense_core": [], "sparse_periurban": []}

    # ---- Zone definitions -------------------------------------------------
    # dense_core (row 6): tight, well-surveyed block -> SMALL noise
    # sparse_periurban (row 7): poorly controlled peri-urban block -> LARGE noise
    zone_params = {
        "dense_core": {"row": 6, "cadastral_noise_deg": .000008, "municipal_offset_deg": (.00001, -.000006)},
        "sparse_periurban": {"row": 7, "cadastral_noise_deg": .00006, "municipal_offset_deg": (.00009, -.00005)},
    }

    canonical_ids = {}  # (row,col) -> canonical_parcel_id, for building merge/subdivision cases
    idx = 100
    for zone, params in zone_params.items():
        row = params["row"]
        for col in range(6):
            idx += 1
            x, y = base_xy(row, col)
            parcel_id = f"CULR-5600{idx:04d}"  # continues the CULR-5600NNNN scheme from data/generated (which used 0001-0072); this range starts at 0101, well clear of it
            survey = f"{125 + row}/{col + 1}"
            canonical_ids[(row, col)] = (parcel_id, survey)
            props = {"canonical_parcel_id": parcel_id, "survey_number": survey,
                     "land_use": "Residential", "area_sq_m": round(W * H * 1.22e10, 1),
                     "ward": "Demo Ward 14", "zone": zone, "capture_date": "2026-07-15"}
            truth.append(feature(parcel_id, polygon(x, y, W, H), props))

            cn = params["cadastral_noise_deg"]
            cad_geom = polygon(x + cn, y - cn, W, H)  # deterministic, not sampled -- see SEED_NOTE
            cadastral.append(feature(f"CAD-EXT-{idx}", cad_geom,
                                      {**props, "source_record_id": f"CAD-EXT-{idx}", "source": "Cadastral",
                                       "positional_accuracy_m": round(cn * M_PER_DEG_LON, 2)}))
            dx_m = cn * M_PER_DEG_LON
            zone_offsets_m[zone].append(round(dx_m, 2))

    # ---- Background 1:1 parcels (majority case in both zones) -------------
    # dense_core cols 4,5 ; sparse_periurban cols 3,4,5 stay clean 1:1 so the
    # many-to-many cases below are a minority against a normal background,
    # which is what actually tests precision (not just recall).
    for (row, col), (parcel_id, survey) in canonical_ids.items():
        zone = "dense_core" if row == 6 else "sparse_periurban"
        if (zone == "dense_core" and col in (4, 5)) or (zone == "sparse_periurban" and col in (3, 4, 5)):
            x, y = base_xy(row, col)
            odx, ody = zone_params[zone]["municipal_offset_deg"]
            mid = f"MUN-EXT-{row}{col}"
            municipal.append(feature(mid, polygon(x + odx, y + ody, W, H),
                                      {"source_record_id": mid, "source": "Municipal", "survey_number": survey,
                                       "land_use": "Residential", "area_sq_m": round(W * H * 1.22e10, 1),
                                       "zone": zone, "capture_date": "2026-06-10",
                                       "positional_accuracy_m": round(math.hypot(odx, ody) * M_PER_DEG_LON, 2)}))
            correspondence.append({"municipal_source_record_id": mid, "true_canonical_parcel_ids": [parcel_id],
                                    "case_type": "one_to_one", "zone": zone})

    # ---- Case 1: 1-to-2 subdivision (dense_core, row6 col0) ----------------
    row, col = 6, 0
    parcel_id, survey = canonical_ids[(row, col)]
    x, y = base_xy(row, col)
    odx, ody = zone_params["dense_core"]["municipal_offset_deg"]
    for half, (hx, hw) in enumerate([(x + odx, W / 2), (x + odx + W / 2, W / 2)], start=1):
        mid = f"MUN-EXT-SUBDIV-{parcel_id[-3:]}-{half}"
        municipal.append(feature(mid, polygon(hx, y + ody, hw, H),
                                  {"source_record_id": mid, "source": "Municipal",
                                   "survey_number": f"{survey}-{half}", "land_use": "Residential",
                                   "area_sq_m": round(hw * H * 1.22e10, 1), "zone": "dense_core",
                                   "capture_date": "2026-06-10", "positional_accuracy_m": 1.1,
                                   "parent_survey_number": survey}))
        correspondence.append({"municipal_source_record_id": mid, "true_canonical_parcel_ids": [parcel_id],
                                "case_type": "subdivision_child", "sibling_count": 2, "zone": "dense_core"})

    # ---- Case 2: 1-to-3 subdivision (dense_core, row6 col1) ----------------
    row, col = 6, 1
    parcel_id, survey = canonical_ids[(row, col)]
    x, y = base_xy(row, col)
    third = W / 3
    for part in range(1, 4):
        mid = f"MUN-EXT-SUBDIV-{parcel_id[-3:]}-{part}"
        municipal.append(feature(mid, polygon(x + odx + (part - 1) * third, y + ody, third, H),
                                  {"source_record_id": mid, "source": "Municipal",
                                   "survey_number": f"{survey}-{part}", "land_use": "Residential",
                                   "area_sq_m": round(third * H * 1.22e10, 1), "zone": "dense_core",
                                   "capture_date": "2026-06-10", "positional_accuracy_m": 1.1,
                                   "parent_survey_number": survey}))
        correspondence.append({"municipal_source_record_id": mid, "true_canonical_parcel_ids": [parcel_id],
                                "case_type": "subdivision_child", "sibling_count": 3, "zone": "dense_core"})

    # ---- Case 3: 2-to-1 merge (dense_core, row6 col2 + col3) ---------------
    row = 6
    (pid_a, sv_a), (pid_b, sv_b) = canonical_ids[(row, 2)], canonical_ids[(row, 3)]
    xa, ya = base_xy(row, 2)
    mid = f"MUN-EXT-MERGE-{pid_a[-3:]}-{pid_b[-3:]}"
    municipal.append(feature(mid, polygon(xa + odx, ya + ody, W * 2, H),
                              {"source_record_id": mid, "source": "Municipal", "survey_number": sv_a,
                               "land_use": "Residential", "area_sq_m": round(W * 2 * H * 1.22e10, 1),
                               "zone": "dense_core", "capture_date": "2026-06-10", "positional_accuracy_m": 1.4,
                               "merged_from_survey_numbers": [sv_a, sv_b]}))
    correspondence.append({"municipal_source_record_id": mid, "true_canonical_parcel_ids": [pid_a, pid_b],
                            "case_type": "merge_result", "source_parcel_count": 2, "zone": "dense_core"})

    # ---- Case 4: 3-to-1 merge (sparse_periurban, row7 col0,1,2) ------------
    row = 7
    ids3 = [canonical_ids[(row, c)] for c in (0, 1, 2)]
    xa, ya = base_xy(row, 0)
    sodx, sody = zone_params["sparse_periurban"]["municipal_offset_deg"]
    mid = f"MUN-EXT-MERGE-{ids3[0][0][-3:]}-{ids3[2][0][-3:]}"
    municipal.append(feature(mid, polygon(xa + sodx, ya + sody, W * 3, H),
                              {"source_record_id": mid, "source": "Municipal", "survey_number": ids3[0][1],
                               "land_use": "Residential", "area_sq_m": round(W * 3 * H * 1.22e10, 1),
                               "zone": "sparse_periurban", "capture_date": "2026-06-10", "positional_accuracy_m": 5.8,
                               "merged_from_survey_numbers": [s for _, s in ids3]}))
    correspondence.append({"municipal_source_record_id": mid,
                            "true_canonical_parcel_ids": [pid for pid, _ in ids3],
                            "case_type": "merge_result", "source_parcel_count": 3, "zone": "sparse_periurban"})

    for name, items in [("ground_truth_parcels_ext.geojson", truth),
                         ("cadastral_parcels_ext.geojson", cadastral),
                         ("municipal_parcels_ext.geojson", municipal)]:
        (OUT / name).write_text(json.dumps(collection(items), indent=2), encoding="utf-8")

    manifest = {
        "extends": "data/generated/benchmark_manifest.json (does not modify it -- purely additive, new canonical_parcel_id range 56000101-56000112)",
        "crs": "EPSG:4326",
        "generation_method": SEED_NOTE,
        "new_canonical_parcel_count": len(truth),
        "many_to_many_cases": [
            {"type": "subdivision_1_to_2", "parent_survey": canonical_ids[(6, 0)][1], "children": 2},
            {"type": "subdivision_1_to_3", "parent_survey": canonical_ids[(6, 1)][1], "children": 3},
            {"type": "merge_2_to_1", "sources": [canonical_ids[(6, 2)][1], canonical_ids[(6, 3)][1]]},
            {"type": "merge_3_to_1", "sources": [canonical_ids[(7, c)][1] for c in (0, 1, 2)]},
        ],
        "zone_noise_summary_m": {
            "dense_core": {"cadastral_positional_offset_m": zone_offsets_m["dense_core"],
                            "note": "small, tightly-surveyed block"},
            "sparse_periurban": {"cadastral_positional_offset_m": zone_offsets_m["sparse_periurban"],
                                   "note": "poorly-controlled peri-urban block -- offsets are ~7x larger than dense_core"},
        },
        "correspondence": correspondence,
        "usage_note": "correspondence[].true_canonical_parcel_ids is the ONLY ground truth for scoring many-to-many matches -- do not feed this file to the matcher itself, only to the evaluator.",
    }
    (OUT / "correspondence_manifest_ext.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(truth)} new canonical parcels, {len(municipal)} municipal features "
          f"({len(correspondence)} correspondence records) to {OUT}")


if __name__ == "__main__":
    main()
