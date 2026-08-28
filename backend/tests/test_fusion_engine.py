import json
import unittest
from pathlib import Path

from backend.app.fusion_engine import LADMKnowledgeGraph, execute_fusion_pipeline, hungarian_maximize, polygon_area, schema_candidates


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "generated"


class FusionEngineTests(unittest.TestCase):
    def test_hungarian_assignment_is_global(self):
        self.assertEqual(hungarian_maximize([[9, 1], [2, 8]]), [(0, 0), (1, 1)])

    def test_generated_polygons_keep_metre_scale_geometry(self):
        collection = json.loads((DATA / "ground_truth_parcels.geojson").read_text(encoding="utf-8"))
        self.assertGreater(polygon_area(collection["features"][0]), 0)

    def test_multilingual_ladm_identifier_mapping(self):
        mapping = schema_candidates([{"name": "खसरा नंबर", "type": "string", "sample_values": ["142/2"]}], LADMKnowledgeGraph())[0]
        self.assertEqual(mapping["target_concept"], "spatial_unit.id")
        self.assertTrue(mapping["knowledge_graph_validation"]["valid"])

    def test_benchmark_runs_all_three_engines(self):
        result = execute_fusion_pipeline(DATA)
        self.assertGreaterEqual(result["metrics"]["source_match_f1_proxy"], 0.9)
        self.assertGreaterEqual(result["metrics"]["conflict_recall"], 0.9)
        self.assertTrue(any(relation["relation"] == "many_sources_to_one_target" for relation in result["spatial_engine"]["matching"]["municipal"]["relations"]))
        self.assertEqual(result["parcels"]["CULR-56000052"]["conflict"]["primary"], "outdated_building")
        self.assertTrue(result["confidence_engine"]["spatial_autocorrelation_handled"])


if __name__ == "__main__":
    unittest.main()
