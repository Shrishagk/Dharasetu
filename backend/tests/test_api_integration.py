"""Production-demo API contract tests.

These tests start the real FastAPI service against an isolated SQLite file.
SQLite keeps the suite portable, while the health assertion verifies that the
same persistence adapter is active and durable. PostGIS is exercised by the
container deployment configuration and the storage adapter's SQL projection.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

requests = pytest.importorskip("requests", reason="pip install -r backend/requirements-dev.txt")

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:8811"
_completed_job: dict | None = None


@pytest.fixture(scope="module")
def server():
    runtime = ROOT / ".runtime" / f"api-test-{os.getpid()}"
    runtime.mkdir(parents=True, exist_ok=True)
    child_env = os.environ.copy()
    child_env.update({
        "SEMANTIC_EMBEDDING_BACKEND": "deterministic_fallback",
        "AUTH_ENABLED": "false",
        "STATE_DB_PATH": str(runtime / "state.sqlite3"),
        "UPLOAD_DIR": str(runtime / "uploads"),
    })
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8811"],
        cwd=str(ROOT / "backend"),
        env=child_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        for _ in range(60):
            time.sleep(0.25)
            try:
                response = requests.get(f"{BASE}/health", timeout=1)
                if response.ok:
                    break
            except requests.exceptions.ConnectionError:
                continue
        else:
            output = proc.stdout.read() if proc.stdout else ""
            pytest.fail(f"server never came up:\n{output}")
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def wait_for_job(job_id: str) -> dict:
    for _ in range(160):
        job = requests.get(f"{BASE}/api/v1/harmonization/jobs/{job_id}", timeout=10).json()
        if job["status"] in {"COMPLETED", "FAILED", "CANCELLED"}:
            assert job["status"] == "COMPLETED", job
            return job
        time.sleep(0.25)
    pytest.fail(f"job {job_id} did not finish")


def run_harmonization(server) -> dict:
    global _completed_job
    if _completed_job is None:
        response = requests.post(f"{BASE}/api/v1/harmonization/jobs", json={}, timeout=5)
        assert response.status_code == 202, response.text
        queued = response.json()
        assert queued["status"] in {"PENDING", "RUNNING"}
        _completed_job = wait_for_job(queued["id"])
    return _completed_job


def test_health_reports_durable_store(server):
    health = requests.get(f"{BASE}/health").json()
    assert health["status"] == "healthy"
    assert health["database"]["durable"] is True
    assert health["database"]["backend"] == "sqlite"
    assert health["auth_enabled"] is False
    assert health["queue"]["workers"] >= 1


def test_sources_catalog(server):
    sources = requests.get(f"{BASE}/api/v1/sources").json()["sources"]
    by_id = {source["id"]: source for source in sources}
    assert {"cadastral", "municipal", "buildings", "revenue", "gnss", "ground_truth", "imagery", "dsm", "khata", "utility", "cross_state_samples"} <= set(by_id)
    assert by_id["cadastral"]["eligible_for_harmonization"] is True
    assert by_id["municipal"]["feature_count"] >= 72
    assert by_id["imagery"]["source_type"] == "Raster"
    assert by_id["dsm"]["source_type"] == "Raster"
    assert by_id["gnss"]["source_type"] == "Vector"
    assert by_id["gnss"]["geometry_type"] == "Point"
    assert by_id["ground_truth"]["eligible_for_harmonization"] is False


def test_layers_and_raster_preview(server):
    canonical = requests.get(f"{BASE}/api/v1/layers/canonical").json()
    assert canonical["type"] == "FeatureCollection"
    assert len(canonical["features"]) == 72
    assert requests.get(f"{BASE}/api/v1/layers/municipal").status_code == 200
    assert requests.get(f"{BASE}/api/v1/layers/does-not-exist").status_code == 404
    raster = requests.get(f"{BASE}/api/v1/sources/imagery/preview").json()
    assert raster["type"] == "RasterPreview"
    assert raster["metadata"]["width"] > 0
    assert raster["embedding"]["model"]


def test_full_async_harmonization_and_metrics(server):
    job = run_harmonization(server)
    assert job["records"] == 72
    assert job["attempts"] == 1
    assert job["stage"] == "Canonical dataset generated"
    metrics = job["engine_metrics"]
    assert metrics["natural_conflict_recall"] >= 0.9
    assert metrics["annotation_conflict_recall"] == metrics["natural_conflict_recall"]
    assert metrics["source_match_f1_proxy"] >= 0.9
    assert job["result"]["auto_harmonized"] + job["result"]["conflicts"] >= 72


def test_conflicts_and_explainable_parcel_detail(server):
    run_harmonization(server)
    conflicts = requests.get(f"{BASE}/api/v1/conflicts").json()
    conflict_ids = {item["canonical_parcel_id"] for item in conflicts}
    assert len(conflicts) >= 8
    assert {f"CULR-560000{number:02d}" for number in (6, 12, 20, 28, 35, 44, 45, 52, 64)} <= conflict_ids

    detail = requests.get(f"{BASE}/api/v1/parcels/CULR-56000044").json()
    assert detail["parcel"]["properties"]["canonical_origin"] == "cadastral"
    assert "topology_overlap" in detail["parcel"]["properties"]["conflict_types"]
    assert detail["attributes"]["provenance"]
    assert detail["lineage"]["sources"]
    assert detail["engine"]["spatial"]["matches"]


def test_dashboard_engine_and_quality_endpoints(server):
    run_harmonization(server)
    context = requests.get(f"{BASE}/api/v1/map/context").json()
    assert context["dataset_mode"] == "synthetic_benchmark"
    assert context["basemap"]["role"] == "context_only"
    assert context["coverage"]["bbox"][0] <= 77.59
    assert context["coverage"]["bbox"][1] <= 12.968
    assert context["coverage"]["bbox"][2] >= 77.604
    assert context["coverage"]["bbox"][3] >= 12.974443
    assert context["coverage_boundary"]["properties"]["is_official_ward_boundary"] is False
    assert context["coverage_boundary"]["geometry"]["type"] == "Polygon"

    dashboard = requests.get(f"{BASE}/api/v1/dashboard").json()
    assert dashboard["summary"]["total_parcels"] == 72
    assert dashboard["summary"]["conflicts"] >= 8
    # Automated temporal signals are analysis output, not user changes.
    assert dashboard["summary"]["changes"] == 0
    assert len(dashboard["review_queue"]) >= 8

    overview = requests.get(f"{BASE}/api/v1/engines/overview").json()
    assert overview["canonical_origin"] == "cadastral"
    assert overview["geoai_model"]["status"] in {"trained_demo", "fitted_for_demo_run", "fallback_morphology"}
    assert overview["topology_engine"]["status"] == "PROPOSAL_READY"
    assert overview["change_detection"]["count"] >= 1
    assert overview["extension_pack"]["enabled"] is True
    assert overview["extension_pack"]["imagery"]["placeholder_tile_count"] >= 1

    topology = requests.get(f"{BASE}/api/v1/topology/audit").json()
    assert topology["valid"] is True
    change_detection = requests.get(f"{BASE}/api/v1/change-detection").json()
    assert change_detection["algorithm"]


def test_schema_match_and_graph_endpoint(server):
    mapping = requests.post(
        f"{BASE}/api/v1/engines/schema-match",
        json={"fields": [{"name": "survey number", "type": "string", "sample_values": ["3/5"]}]},
    ).json()
    assert mapping["mappings"][0]["target_concept"] == "spatial_unit.id"
    graph = requests.get(f"{BASE}/api/v1/engines/graphs/municipal").json()
    assert graph["nodes"]
    assert graph["edges"]


def test_decision_audit_and_persistent_exports(server):
    run_harmonization(server)
    decision = requests.post(
        f"{BASE}/api/v1/parcels/CULR-56000044/decision",
        json={"action": "approve", "comment": "Reviewed against the survey evidence."},
    )
    assert decision.status_code == 200, decision.text
    event = decision.json()["event"]
    assert event["event_hash"]
    assert event["previous_hash"] is not None
    assert event["new_value"] == "OFFICER_APPROVED"
    assert decision.json()["parcel"]["properties"]["review_status"] == "OFFICER_APPROVED"
    assert requests.get(f"{BASE}/api/v1/dashboard").json()["summary"]["changes"] == 1

    audit = requests.get(f"{BASE}/api/v1/audit").json()
    assert audit["immutable"] is True
    assert any(item["id"] == event["id"] for item in audit["events"])
    assert requests.get(f"{BASE}/api/v1/export/canonical.geojson").headers["content-type"].startswith("application/geo+json")
    assert "canonical_parcel_id" in requests.get(f"{BASE}/api/v1/export/reconciliation.csv").text.splitlines()[0]
    assert requests.get(f"{BASE}/api/v1/export/audit.json").json()["immutable"] is True


def test_upload_crs_area_and_raster_ingestion(server):
    tiny_geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "id": "UPLOAD-TEST-1",
            "geometry": {"type": "Polygon", "coordinates": [[[77.5946, 12.9721], [77.5948, 12.9721], [77.5948, 12.9723], [77.5946, 12.9723], [77.5946, 12.9721]]]},
            "properties": {"note": "area is intentionally absent"},
        }],
    }
    files = {"file": ("upload_test.geojson", json.dumps(tiny_geojson), "application/geo+json")}
    data = {"provider_type": "Test Department", "provider_name": "Test Uploader", "dataset_name": "Upload smoke test", "dataset_type": "Vector"}
    uploaded = requests.post(f"{BASE}/api/v1/sources/upload", files=files, data=data)
    assert uploaded.status_code == 200, uploaded.text
    source = uploaded.json()
    assert source["id"].startswith("SRC-")
    assert source["normalized_crs"] == "EPSG:4326"
    preview = requests.get(f"{BASE}/api/v1/sources/{source['id']}/preview").json()
    assert 300 <= preview["features"][0]["properties"]["area_sq_m"] <= 800
    assert preview["features"][0]["properties"]["area_backfilled"] is True

    raster_path = ROOT / "data" / "urbanland_extension_pack" / "extension_pack" / "imagery" / "noise_tile_01.png"
    raster_upload = requests.post(
        f"{BASE}/api/v1/sources/upload",
        files={"file": ("survey_tile.png", raster_path.read_bytes(), "image/png")},
        data={"provider_type": "Survey Agency", "provider_name": "Raster Test", "dataset_name": "Drone tile", "dataset_type": "Drone / ORI Imagery", "epsg_code": "4326"},
    )
    assert raster_upload.status_code == 200, raster_upload.text
    raster_source = raster_upload.json()
    assert raster_source["source_type"] == "Raster"
    assert requests.get(f"{BASE}/api/v1/sources/{raster_source['id']}/preview").json()["feature_extraction"]
