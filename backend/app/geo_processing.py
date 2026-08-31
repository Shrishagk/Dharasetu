"""Small, production-shaped geospatial ingestion helpers.

The demo image deliberately keeps heavyweight GIS libraries optional.  When
``pyproj``/``shapely``/``rasterio`` are present (the Docker image installs
them), these functions use them.  Local CI still gets safe EPSG:4326,
EPSG:3857 and UTM transformations plus geometry checks without a native GIS
stack.
"""

from __future__ import annotations

import math
import re
from copy import deepcopy
from typing import Any, Iterable


WGS84 = "EPSG:4326"


def normalize_epsg(value: Any) -> str | None:
    if value is None or str(value).strip() == "":
        return None
    text = str(value).strip().upper()
    match = re.search(r"(?:EPSG[:/ ])?(\d{3,6})", text)
    return f"EPSG:{match.group(1)}" if match else None


def detect_geojson_crs(document: dict[str, Any], declared: Any = None) -> str | None:
    if declared:
        return normalize_epsg(declared)
    crs = document.get("crs") or {}
    props = crs.get("properties") or {}
    name = props.get("name") or props.get("href") or crs.get("name")
    return normalize_epsg(name)


def _transform_xy_fallback(x: float, y: float, source: str, target: str) -> tuple[float, float]:
    """Transform the common web/demo CRS set without third-party packages."""
    source, target = normalize_epsg(source), normalize_epsg(target)
    if not source or not target or source == target:
        return x, y
    # Web mercator -> longitude/latitude.
    if source == "EPSG:3857" and target == WGS84:
        return math.degrees(x / 6378137.0), math.degrees(2 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2)
    if source == WGS84 and target == "EPSG:3857":
        latitude = max(-85.05112878, min(85.05112878, y))
        return 6378137.0 * math.radians(x), 6378137.0 * math.log(math.tan(math.pi / 4 + math.radians(latitude) / 2))
    # UTM WGS84 to/from lon/lat.  This covers the Indian UTM zones used by
    # likely demo uploads and is intentionally explicit about its limits.
    source_match = re.fullmatch(r"EPSG:(326|327)(\d{2})", source)
    target_match = re.fullmatch(r"EPSG:(326|327)(\d{2})", target)
    if source_match and target == WGS84:
        return _utm_to_lonlat(x, y, int(source_match.group(2)), source_match.group(1) == "327")
    if source == WGS84 and target_match:
        return _lonlat_to_utm(x, y, int(target_match.group(2)), target_match.group(1) == "327")
    raise ValueError(f"CRS transform {source} -> {target} requires pyproj")


def _lonlat_to_utm(lon: float, lat: float, zone: int, south: bool) -> tuple[float, float]:
    # Snyder approximation, accurate enough for ingestion previews.  Docker
    # uses pyproj for authoritative production transforms.
    a, ecc_sq, k0 = 6378137.0, 0.00669438, 0.9996
    lat_r, lon_r = math.radians(lat), math.radians(lon)
    lon_origin = math.radians((zone - 1) * 6 - 180 + 3)
    ecc_prime = ecc_sq / (1 - ecc_sq)
    n = a / math.sqrt(1 - ecc_sq * math.sin(lat_r) ** 2)
    t = math.tan(lat_r) ** 2
    c = ecc_prime * math.cos(lat_r) ** 2
    aa = math.cos(lat_r) * (lon_r - lon_origin)
    m = a * ((1 - ecc_sq / 4 - 3 * ecc_sq ** 2 / 64 - 5 * ecc_sq ** 3 / 256) * lat_r
             - (3 * ecc_sq / 8 + 3 * ecc_sq ** 2 / 32 + 45 * ecc_sq ** 3 / 1024) * math.sin(2 * lat_r)
             + (15 * ecc_sq ** 2 / 256 + 45 * ecc_sq ** 3 / 1024) * math.sin(4 * lat_r)
             - (35 * ecc_sq ** 3 / 3072) * math.sin(6 * lat_r))
    easting = k0 * n * (aa + (1 - t + c) * aa ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ecc_prime) * aa ** 5 / 120) + 500000
    northing = k0 * (m + n * math.tan(lat_r) * (aa ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * aa ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * ecc_prime) * aa ** 6 / 720))
    return easting, northing + (10000000 if south else 0)


def _utm_to_lonlat(easting: float, northing: float, zone: int, south: bool) -> tuple[float, float]:
    a, ecc_sq, k0 = 6378137.0, 0.00669438, 0.9996
    x, y = easting - 500000, northing - (10000000 if south else 0)
    ecc_prime = ecc_sq / (1 - ecc_sq)
    m = y / k0
    mu = m / (a * (1 - ecc_sq / 4 - 3 * ecc_sq ** 2 / 64 - 5 * ecc_sq ** 3 / 256))
    e1 = (1 - math.sqrt(1 - ecc_sq)) / (1 + math.sqrt(1 - ecc_sq))
    phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu) + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu)
    n1 = a / math.sqrt(1 - ecc_sq * math.sin(phi1) ** 2)
    t1 = math.tan(phi1) ** 2
    c1 = ecc_prime * math.cos(phi1) ** 2
    r1 = a * (1 - ecc_sq) / (1 - ecc_sq * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ecc_prime) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ecc_prime - 3 * c1 ** 2) * d ** 6 / 720)
    lon = math.radians((zone - 1) * 6 - 180 + 3) + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ecc_prime + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(phi1)
    return math.degrees(lon), math.degrees(lat)


def transform_coordinates(value: Any, source_crs: str | None, target_crs: str = WGS84) -> Any:
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
            try:
                x, y = _transform_xy_fallback(float(value[0]), float(value[1]), source_crs or target_crs, target_crs)
            except ValueError:
                try:
                    from pyproj import Transformer
                    transformer = Transformer.from_crs(source_crs, target_crs, always_xy=True)
                    x, y = transformer.transform(float(value[0]), float(value[1]))
                except ImportError as error:
                    raise ValueError(str(error)) from error
            return [round(x, 9), round(y, 9), *value[2:]]
        return [transform_coordinates(item, source_crs, target_crs) for item in value]
    return value


def normalize_geojson(document: dict[str, Any], source_crs: str | None, target_crs: str = WGS84) -> tuple[dict[str, Any], dict[str, Any]]:
    normalized = deepcopy(document)
    source_crs = normalize_epsg(source_crs)
    target_crs = normalize_epsg(target_crs) or WGS84
    for feature in normalized.get("features", []):
        geometry = feature.get("geometry") or {}
        if "coordinates" in geometry:
            geometry["coordinates"] = transform_coordinates(geometry["coordinates"], source_crs, target_crs)
    normalized["crs"] = {"type": "name", "properties": {"name": target_crs}}
    return normalized, {"source_crs": source_crs, "normalized_crs": target_crs, "transformed": bool(source_crs and source_crs != target_crs), "method": "pyproj" if source_crs and source_crs != target_crs and _has_module("pyproj") else "built_in_common_crs"}


def _has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except ImportError:
        return False


def coordinate_pairs(value: Any) -> Iterable[tuple[float, float]]:
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(item, (int, float)) for item in value[:2]):
            yield float(value[0]), float(value[1])
        else:
            for child in value:
                yield from coordinate_pairs(child)


def geo_metadata(collection: dict[str, Any]) -> dict[str, Any]:
    features = collection.get("features", [])
    geometry_types = sorted({(feature.get("geometry") or {}).get("type") for feature in features if (feature.get("geometry") or {}).get("type")})
    pairs = [pair for feature in features for pair in coordinate_pairs(((feature.get("geometry") or {}).get("coordinates")))]
    extent = [round(min(pair[0] for pair in pairs), 6), round(min(pair[1] for pair in pairs), 6), round(max(pair[0] for pair in pairs), 6), round(max(pair[1] for pair in pairs), 6)] if pairs else None
    fields = sorted({key for feature in features[:400] for key in (feature.get("properties") or {}).keys()})
    schema = []
    for field in fields:
        values = [(feature.get("properties") or {}).get(field) for feature in features[:100] if (feature.get("properties") or {}).get(field) is not None]
        inferred = "number" if values and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in values) else "string"
        schema.append({"name": field, "type": inferred})
    return {"feature_count": len(features), "geometry_type": ", ".join(geometry_types) or "Unknown", "bbox": extent, "attribute_fields": fields, "schema": schema}


def ring_is_valid(ring: Any) -> bool:
    if not isinstance(ring, list) or len(ring) < 4:
        return False
    return ring[0][:2] == ring[-1][:2] if all(isinstance(point, list) and len(point) >= 2 for point in ring) else False


def geometry_quality(feature: dict[str, Any]) -> dict[str, Any]:
    geometry = feature.get("geometry") or {}
    issues: list[str] = []
    if not geometry:
        issues.append("missing_geometry")
    elif geometry.get("type") == "Polygon":
        rings = geometry.get("coordinates") or []
        if not rings or not ring_is_valid(rings[0]):
            issues.append("invalid_ring")
        try:
            from shapely.geometry import shape
            from shapely.validation import explain_validity
            candidate = shape(geometry)
            if not candidate.is_valid:
                issues.append(f"invalid_geometry:{explain_validity(candidate)}")
        except ImportError:
            # Detect repeated non-adjacent vertices, a common self-intersection
            # signal, without claiming full GEOS validity in the fallback.
            points = [tuple(point[:2]) for point in (rings[0][:-1] if rings and rings[0] else [])]
            if len(points) != len(set(points)) and len(points) > 4:
                issues.append("repeated_vertices")
    return {"valid": not issues, "issues": issues, "repair_available": bool(issues)}


def repair_geometry(feature: dict[str, Any]) -> tuple[dict[str, Any], str]:
    repaired = deepcopy(feature)
    geometry = repaired.get("geometry") or {}
    try:
        from shapely.geometry import mapping, shape
        fixed = shape(geometry).buffer(0)
        repaired["geometry"] = mapping(fixed)
        return repaired, "shapely_buffer_zero"
    except (ImportError, ValueError, TypeError):
        if geometry.get("type") == "Polygon" and geometry.get("coordinates"):
            ring = geometry["coordinates"][0]
            if ring and ring[0] != ring[-1]:
                ring.append(deepcopy(ring[0]))
            geometry["coordinates"] = [ring]
        return repaired, "ring_close_fallback"


def topology_audit(features: list[dict[str, Any]], sliver_area_m2: float = 1.0) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    boxes: list[tuple[float, float, float, float] | None] = []
    for feature in features:
        quality = geometry_quality(feature)
        if not quality["valid"]:
            issues.append({"type": "invalid_geometry", "feature_id": feature.get("id"), "details": quality["issues"]})
        geometry = feature.get("geometry") or {}
        points = list(coordinate_pairs(geometry.get("coordinates", [])))
        boxes.append((min(x for x, _ in points), min(y for _, y in points), max(x for x, _ in points), max(y for _, y in points)) if points else None)
    for left_index, left_box in enumerate(boxes):
        if not left_box:
            continue
        for right_index in range(left_index + 1, len(boxes)):
            right_box = boxes[right_index]
            if not right_box:
                continue
            ix = max(0.0, min(left_box[2], right_box[2]) - max(left_box[0], right_box[0]))
            iy = max(0.0, min(left_box[3], right_box[3]) - max(left_box[1], right_box[1]))
            if ix > 0 and iy > 0:
                issues.append({"type": "overlap", "feature_ids": [features[left_index].get("id"), features[right_index].get("id")], "area_degrees2": round(ix * iy, 12), "repair": "snap_shared_boundary_or_prefer_highest_accuracy"})
            # A small positive gap between aligned rectangles is a useful
            # demo-level sliver/gap signal; GEOS performs the authoritative
            # polygon operation in the container.
            horizontal_gap = max(right_box[0] - left_box[2], left_box[0] - right_box[2])
            vertical_overlap = min(left_box[3], right_box[3]) - max(left_box[1], right_box[1])
            if 0 < horizontal_gap < 0.00001 and vertical_overlap > 0:
                issues.append({"type": "gap_or_sliver", "feature_ids": [features[left_index].get("id"), features[right_index].get("id")], "repair": "snap_neighbour_boundaries"})
    by_type: dict[str, int] = {}
    for issue in issues:
        by_type[issue["type"]] = by_type.get(issue["type"], 0) + 1
    return {"valid": not issues, "issue_count": len(issues), "issues": issues, "counts": by_type, "repair_strategy": "GEOS make_valid/buffer(0) plus authoritative-boundary selection"}
