"""Generate the SCHEMA HETEROGENEITY extension pack.

The gap this fixes: every file in data/generated/ (and in the spatial
extension) already uses identical field names -- survey_number,
source_record_id, land_use, area_sq_m, capture_date -- across every source.
That means Engine 2 as specified (LLM+embedding schema matching, grounded in
LADM, handling multilingual field labels) currently has nothing to actually
do: a plain `pd.merge(..., on="survey_number")` already solves the join.

This script reads the ORIGINAL 72 canonical parcels (data/generated/) plus
the 12 new ones (extension_pack/spatial/), and re-describes the SAME
underlying parcels through two more source systems that genuinely use
different identifiers, different field names, and partially different value
vocabularies -- grounded in real Karnataka land-record practice, not
invented terms:

  - Khata (ಖಾತೆ): the URBAN MUNICIPAL property-tax account. In Karnataka
    this is explicitly a *different* identifier from the revenue Survey
    Number -- Khata is issued by the municipality (BBMP-style) for tax
    purposes; Survey Number is the Revenue Department's spatial identifier.
    They co-exist for the same physical plot. Terms used here (Khata,
    Khate/ಖಾತೆ, Sankhye/ಸಂಖ್ಯೆ, Maalik/ಮಾಲೀಕ) are the standard Bhoomi/Khata
    vocabulary. Area is recorded in sq ft, not sq m -- also standard
    practice for municipal property-tax records in India.

  - Water/sewerage utility connection register (BWSSB-style): no
    survey_number or khata_number field AT ALL, only a connection_id, and
    only a *partial*, sometimes-missing cross-reference to khata_number --
    which is realistic (utility and revenue/municipal systems are rarely
    perfectly cross-linked). Its "premises_type" vocabulary (Domestic /
    Non-Domestic) is coarser than land_use (Residential / Commercial /
    Mixed use / Institutional) -- a genuine many-to-one category collapse,
    not just a renamed field.

A `crosswalk_answer_key.json` records the correct field-to-concept mapping
across every source file that now exists (original 3 + these 2), each
grounded against the real ISO 19152 LADM core classes where one genuinely
applies -- and explicitly marked "no clean LADM mapping" where one doesn't,
which is itself a useful test case (a good matcher should be able to say "I
don't have a confident match" rather than force one).

`cross_state_schema_samples.json` is NOT tied to this ward's geometry -- it's
a small, separately-labelled set of out-of-ward illustrative records showing
real field-name diversity from OTHER states (Tamil Nadu's Patta/Chitta/TSLR
convention, and generic Hindi-labelled NGDRS-style fields), to exercise the
"handles Hindi/Tamil/Telugu/English field labels" claim specifically.

Only vocabulary that was verified against real sources during generation is
used in non-English scripts (see README.md in this pack for the specific
terms and what they were checked against). Everything here is illustrative
demo data, not an authoritative record of any real property.
"""
import csv
import json
from pathlib import Path

def project_root() -> Path:
    for parent in (Path(__file__).resolve().parent, *Path(__file__).resolve().parents):
        if (parent / "data" / "generated").is_dir():
            return parent
    raise RuntimeError("Could not locate the UrbanLand project root containing data/generated")


ROOT = project_root()
OUT = ROOT / "data" / "urbanland_extension_pack" / "extension_pack" / "heterogeneous_schemas"
ONTOLOGY_OUT = ROOT / "data" / "urbanland_extension_pack" / "extension_pack" / "ontology"

# The original 72 (from the user's own data.zip) plus the 12 new ones from
# the spatial extension pack -- both are read, never modified.
ORIGINAL_TRUTH = ROOT / "data" / "generated" / "ground_truth_parcels.geojson"
EXT_TRUTH = ROOT / "data" / "urbanland_extension_pack" / "extension_pack" / "spatial" / "ground_truth_parcels_ext.geojson"

SQ_M_TO_SQ_FT = 10.7639


def load_parcels():
    parcels = []
    for path in (ORIGINAL_TRUTH, EXT_TRUTH):
        d = json.loads(path.read_text(encoding="utf-8"))
        for f in d["features"]:
            parcels.append(f["properties"])
    return parcels


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ONTOLOGY_OUT.mkdir(parents=True, exist_ok=True)
    parcels = load_parcels()

    # ---- Karnataka municipal Khata extract (urban property-tax account) ---
    # Deliberately different classification bucket names from land_use, and
    # area in sq ft (municipal-standard unit) instead of sq m.
    khata_class_map = {"Residential": "Residential", "Commercial": "Non-Residential (Commercial)",
                        "Mixed use": "Mixed (Res + Comm)", "Institutional": "Non-Residential (Institutional)"}
    # NOTE: deliberately NO survey_number / canonical_parcel_id column here.
    # A real municipal Khata extract does not carry the Revenue Department's
    # spatial identifier -- that absence IS the schema-matching problem
    # Engine 2 exists to solve. The true khata_number -> canonical_parcel_id
    # linkage is written separately below, to record_level_ground_truth.json,
    # exactly the way ground_truth_parcels.geojson is kept apart from the
    # matcher's inputs for Engine 1: it's for scoring, not for matching.
    khata_rows, khata_truth_link = [], []
    for i, p in enumerate(parcels, start=1):
        khata_rows.append({
            "khata_number": f"BBMP/W14/KH/{i:05d}",
            "khate_sankhye_kn": "ಖಾತೆ ಸಂಖ್ಯೆ",  # verified compositional term: ಖಾತೆ (Khata) + ಸಂಖ್ಯೆ (Number)
            "property_classification": khata_class_map[p["land_use"]],
            "registered_owner": f"OWNER-{1000 + i}",
            "built_up_area_sq_ft": round(p["area_sq_m"] * SQ_M_TO_SQ_FT, 1),
            "assessment_year": 2025,
        })
        khata_truth_link.append({"khata_number": khata_rows[-1]["khata_number"],
                                  "true_canonical_parcel_id": p["canonical_parcel_id"],
                                  "true_survey_number": p["survey_number"]})
    with (OUT / "khata_extract_karnataka.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=khata_rows[0].keys())
        w.writeheader()
        w.writerows(khata_rows)

    # ---- Water/sewerage utility connection register (BWSSB-style) --------
    # No survey_number / khata_number field. Only ~70% of rows carry a
    # linked_khata_ref at all -- realistic partial cross-linking.
    premises_map = {"Residential": "Domestic", "Commercial": "Non-Domestic",
                     "Mixed use": "Mixed", "Institutional": "Non-Domestic"}
    utility_rows = []
    for i, (p, khata) in enumerate(zip(parcels, khata_rows), start=1):
        row = {
            "connection_id": f"BWSSB-CONN-{20000 + i}",
            "premises_type": premises_map[p["land_use"]],
            "registered_occupant": khata["registered_owner"],
            "plot_area_sqft": khata["built_up_area_sq_ft"],
            "tariff_slab": "Slab-2" if p["land_use"] in ("Commercial", "Institutional") else "Slab-1",
        }
        if i % 10 != 0:  # ~90% linked, ~10% missing -- realistic partial cross-linking, not total absence
            row["linked_khata_ref"] = khata["khata_number"]
        utility_rows.append(row)
    (OUT / "water_connection_register.json").write_text(
        json.dumps({"source_system": "BWSSB-style consumer connection register (illustrative)",
                    "records": utility_rows}, indent=2), encoding="utf-8")

    # ---- Cross-state illustrative samples (NOT tied to this ward) --------
    cross_state = {
        "note": "Illustrative, out-of-ward examples only -- included to exercise cross-state / cross-script "
                "field-name diversity, not to extend the Demo Ward 14 geometry. Verify all native-script text "
                "with a native speaker and your target state's actual NGDRS/e-Services template before a live "
                "demo; see README.md for exactly which terms were checked and against what.",
        "tamil_nadu_urban_tslr_sample": {
            "_system": "Town Survey Land Register (TSLR) -- used for URBAN Tamil Nadu properties in place of "
                       "the rural Patta/Chitta pair",
            "town_survey_no": "TS-2210/4A",
            "சர்வே எண் (survey_number, Tamil)": "2210/4A",
            "\u0baa\u0b9f\u0bcd\u0b9f\u0bbe \u0b8e\u0ba3\u0bcd (patta_number, Tamil -- rural equivalent, shown for contrast)": "N/A (urban TSLR record)",
            "classification_\u0b9a\u0bbf\u0b9f\u0bcd\u0b9f\u0bbe": "\u0baa\u0bc1\u0b9e\u0bcd\u0b9a\u0bc8 (dry / non-agricultural urban land)",
        },
        "generic_hindi_ngdrs_style_sample": {
            "_system": "Illustrative NGDRS-style export, Hindi field labels (Hindi land-record vocabulary is "
                       "broadly standard across Hindi-belt states but templates vary -- confirm the exact "
                       "labels your target state's NGDRS instance actually uses)",
            "\u0916\u093e\u0924\u093e \u0938\u0902\u0916\u094d\u092f\u093e (khata_sankhya)": "KH-04471",
            "\u092e\u093e\u0932\u093f\u0915 \u0915\u093e \u0928\u093e\u092e (malik_ka_naam)": "OWNER-1077",
            "\u092d\u0942\u092e\u093f \u0909\u092a\u092f\u094b\u0917 (bhoomi_upyog)": "\u0906\u0935\u093e\u0938\u0940\u092f (Residential)",
            "\u0915\u094d\u0937\u0947\u0924\u094d\u0930\u092b\u0932 (kshetrafal, sq m)": 950.4,
        },
    }
    (OUT / "cross_state_schema_samples.json").write_text(json.dumps(cross_state, indent=2, ensure_ascii=False),
                                                          encoding="utf-8")

    # ---- Record-level ground truth (separate from field-level crosswalk) --
    # crosswalk_answer_key.json scores "which COLUMN means the same concept";
    # this scores "which ROW is the same real-world parcel" -- two different
    # sub-problems Engine 2 needs to solve (schema mapping, then entity
    # resolution using the reconciled fields). Never feed this to the matcher.
    (OUT / "record_level_ground_truth.json").write_text(
        json.dumps({"usage_note": "Ground truth for khata_number -> canonical_parcel_id linkage. This is a "
                                   "DIFFERENT thing from crosswalk_answer_key.json: that file scores field/column "
                                   "mapping (schema matching); this file scores row/record matching (entity "
                                   "resolution) once the schema mapping tells you khata_number and survey_number "
                                   "are 'the same kind of identifier'. Do not feed this to the matcher.",
                    "links": khata_truth_link}, indent=2), encoding="utf-8")

    # ---- Crosswalk answer key (the Engine-2 scoring target) ---------------
    crosswalk = {
        "usage_note": "This is the EVALUATION target for Engine 2's schema matcher, analogous to "
                       "benchmark_manifest.json for Engine 1. Do not feed this file to the matcher -- only use "
                       "it to score the matcher's proposed field-to-concept mappings.",
        "ladm_grounding_reference": "ontology/ladm_core_subset.json (compact subset of the real ISO 19152-1:2024 "
                                     "LADM core -- 4 base classes only, not the full standard)",
        "fields": [
            {"source_file": "data/generated/revenue_records.csv (and ground_truth/cadastral/municipal parcels)",
             "field_name": "survey_number", "canonical_concept": "parcel_spatial_identifier",
             "ladm_grounding": "LA_SpatialUnit.suID / .label", "notes": "Revenue Dept's spatial identifier."},
            {"source_file": "heterogeneous_schemas/khata_extract_karnataka.csv",
             "field_name": "khata_number", "canonical_concept": "parcel_administrative_identifier",
             "ladm_grounding": "LA_BAUnit.uID",
             "notes": "Khata is an ADMINISTRATIVE/fiscal unit (the tax account), not a spatial identifier -- "
                      "it is a genuinely different LADM concept from survey_number, not just a renamed field. "
                      "A real property in Karnataka carries both simultaneously."},
            {"source_file": "heterogeneous_schemas/water_connection_register.json",
             "field_name": "connection_id", "canonical_concept": "utility_account_identifier",
             "ladm_grounding": None,
             "notes": "No clean home in core LADM (4 base classes) -- utility billing accounts are not a land-"
                      "administration concept. Intentional: a correct matcher should be able to flag 'no "
                      "confident LADM mapping' here rather than force one onto LA_BAUnit or LA_SpatialUnit."},
            {"source_file": "revenue_records.csv / municipal_parcels / cadastral_parcels",
             "field_name": "land_use", "canonical_concept": "land_use_classification", "ladm_grounding": None,
             "notes": "Not in core LADM's 4 base classes. Lives in the Land-Use extension package added in "
                      "LADM Edition II -- ground against that package if you go beyond the core 4, don't force "
                      "it into LA_SpatialUnit."},
            {"source_file": "khata_extract_karnataka.csv", "field_name": "property_classification",
             "canonical_concept": "land_use_classification", "ladm_grounding": None,
             "value_vocabulary_mapping": {"Residential": "Residential",
                                            "Non-Residential (Commercial)": "Commercial",
                                            "Mixed (Res + Comm)": "Mixed use",
                                            "Non-Residential (Institutional)": "Institutional"},
             "notes": "Same concept as land_use, different vocabulary AND different granularity -- a straight "
                      "string-similarity match will not catch 'Non-Residential (Institutional)' -> 'Institutional' "
                      "without also using the sample values, not just the field name."},
            {"source_file": "water_connection_register.json", "field_name": "premises_type",
             "canonical_concept": "land_use_classification", "ladm_grounding": None,
             "value_vocabulary_mapping": {"Domestic": ["Residential"],
                                            "Non-Domestic": ["Commercial", "Institutional"],
                                            "Mixed": ["Mixed use"]},
             "notes": "MANY-TO-ONE, not 1:1 -- both Commercial and Institutional land_use values collapse to "
                      "the single 'Non-Domestic' utility tariff bucket. This is a coarser vocabulary, not a "
                      "renamed one; a matcher that assumes bijective value mappings will get this wrong."},
            {"source_file": "revenue_records.csv", "field_name": "owner_reference",
             "canonical_concept": "party_identifier", "ladm_grounding": "LA_Party.partyID / .name"},
            {"source_file": "khata_extract_karnataka.csv / water_connection_register.json",
             "field_name": "registered_owner / registered_occupant", "canonical_concept": "party_identifier",
             "ladm_grounding": "LA_Party.partyID / .name",
             "notes": "'Occupant' and 'owner' are not guaranteed to be the same LA_Party role in reality "
                      "(tenant vs owner) -- this demo data treats them as identical for simplicity; flag this "
                      "simplification if you present it, since a real matcher grounded in LADM's LA_PartyRoleType "
                      "should NOT assume occupant==owner."},
            {"source_file": "ground_truth/cadastral/municipal parcels", "field_name": "area_sq_m",
             "canonical_concept": "area", "ladm_grounding": "LA_SpatialUnit.area (LA_AreaValue)",
             "notes": "Unit is square metres."},
            {"source_file": "khata_extract_karnataka.csv / water_connection_register.json",
             "field_name": "built_up_area_sq_ft / plot_area_sqft", "canonical_concept": "area",
             "ladm_grounding": "LA_SpatialUnit.area (LA_AreaValue)",
             "notes": "Same concept as area_sq_m but in SQUARE FEET -- standard for Indian municipal/property-"
                      "tax records. Needs unit-aware reconciliation (x10.7639), not just a field-name match; a "
                      "naive numeric-similarity check across sources will otherwise look like a mismatch."},
            {"source_file": "cross_state_schema_samples.json (Tamil Nadu)", "field_name": "town_survey_no",
             "canonical_concept": "parcel_spatial_identifier", "ladm_grounding": "LA_SpatialUnit.suID / .label",
             "notes": "Same concept as survey_number, different numbering scheme (TSLR is urban-only in TN; "
                      "rural TN uses Patta/Chitta survey numbers instead)."},
            {"source_file": "cross_state_schema_samples.json (Hindi/NGDRS-style)",
             "field_name": "\u0916\u093e\u0924\u093e \u0938\u0902\u0916\u094d\u092f\u093e (khata_sankhya)",
             "canonical_concept": "parcel_administrative_identifier", "ladm_grounding": "LA_BAUnit.uID",
             "notes": "Devanagari label for the same Khata concept as Karnataka's khata_number -- cross-script "
                      "match, not just cross-field-name."},
        ],
    }
    (OUT / "crosswalk_answer_key.json").write_text(json.dumps(crosswalk, indent=2, ensure_ascii=False),
                                                     encoding="utf-8")

    # ---- Compact, accurate LADM core-class subset --------------------------
    ladm = {
        "standard": "ISO 19152-1:2024, Land Administration Domain Model (LADM) -- CORE package only "
                    "(the 4 base classes). This is a compact illustrative subset for grounding the demo's LLM "
                    "schema matcher, NOT a reproduction of the standard.",
        "real_sources_for_the_actual_standard": [
            "https://www.iso.org/standard/78554.html (ISO 19152-1:2024, official, paid)",
            "https://www.icaci.org/ (International Cartographic Association) and FIG (fig.net) publish open "
            "LADM overview material and country-profile case studies referencing the same 4 core classes",
            "Lemmen, van Oosterom & Bennett, 'The Land Administration Domain Model' (foundational open-access "
            "journal article describing LA_Party / LA_RRR / LA_BAUnit / LA_SpatialUnit)",
        ],
        "classes": {
            "LA_Party": {
                "definition": "A party -- typically a person or organisation -- that can hold a right, "
                               "restriction, or responsibility.",
                "attributes": ["partyID", "type (LA_PartyType)", "role (LA_PartyRoleType)", "name"],
            },
            "LA_RRR": {
                "definition": "Abstract class for Rights, Restrictions, or Responsibilities -- what a party "
                               "holds over a basic administrative unit.",
                "attributes": ["description", "share (Rational)", "shareCheck (Boolean)", "timeSpec"],
                "note": "Abstract -- concrete subclasses (right / restriction / responsibility) specialise it.",
            },
            "LA_BAUnit": {
                "definition": "Basic Administrative Unit -- the ADMINISTRATIVE unit an RRR applies to (e.g. "
                               "'Peter's estate'). Distinct from the spatial footprint itself.",
                "attributes": ["name", "type (LA_BAUnitType)", "uID"],
            },
            "LA_SpatialUnit": {
                "definition": "One or more areas of land/water (or volumes of space) -- the SPATIAL/geometric "
                               "footprint. A single LA_BAUnit can be composed of multiple LA_SpatialUnit parcels.",
                "attributes": ["address", "area (LA_AreaValue)", "dimension (LA_DimensionType)", "label",
                               "referencePoint (GM_Point)", "suID"],
            },
        },
        "not_in_core_note": "Land use, land value, and land development are NOT in the core 4 classes -- they "
                             "were added as extension packages in LADM Edition II. Don't force land_use fields "
                             "into LA_SpatialUnit; ground them against the Land-Use package instead if you "
                             "extend beyond the core.",
    }
    (ONTOLOGY_OUT / "ladm_core_subset.json").write_text(json.dumps(ladm, indent=2), encoding="utf-8")

    print(f"Wrote {len(khata_rows)} Khata rows, {len(utility_rows)} utility rows, "
          f"crosswalk with {len(crosswalk['fields'])} field mappings, and the LADM core subset.")


if __name__ == "__main__":
    main()
