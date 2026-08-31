"""Raster ingestion and deterministic offline GeoAI adapter."""

from __future__ import annotations

import hashlib
import io
import math
from pathlib import Path
from typing import Any


def inspect_raster(content: bytes, filename: str, declared_crs: str | None = None) -> dict[str, Any]:
    digest = hashlib.sha256(content).hexdigest()
    metadata: dict[str, Any] = {"format": Path(filename).suffix.lower().lstrip("."), "checksum_sha256": digest, "crs": declared_crs, "bands": None, "width": None, "height": None, "dtype": None, "processing_backend": "metadata_only"}
    try:
        import rasterio
        with rasterio.MemoryFile(content) as memory:
            with memory.open() as dataset:
                metadata.update({"width": dataset.width, "height": dataset.height, "bands": dataset.count, "dtype": str(dataset.dtypes[0]) if dataset.dtypes else None, "crs": str(dataset.crs) if dataset.crs else declared_crs, "bbox": list(dataset.bounds), "transform": list(dataset.transform), "processing_backend": "rasterio"})
                values = dataset.read(out_shape=(min(dataset.count, 4), min(dataset.height, 256), min(dataset.width, 256)), masked=True)
                metadata["band_statistics"] = [{"min": float(values[index].min()), "max": float(values[index].max()), "mean": float(values[index].mean())} for index in range(len(values))]
                return metadata
    except (ImportError, Exception) as error:
        metadata["rasterio_note"] = str(error)[:180]
    try:
        from PIL import Image
        with Image.open(io.BytesIO(content)) as image:
            metadata.update({"width": image.width, "height": image.height, "bands": len(image.getbands()), "dtype": image.mode, "processing_backend": "pillow"})
            sample = image.convert("RGB").resize((min(image.width, 64), min(image.height, 64)))
            pixels = list(sample.getdata())
            metadata["band_statistics"] = [{"min": min(pixel[index] for pixel in pixels), "max": max(pixel[index] for pixel in pixels), "mean": round(sum(pixel[index] for pixel in pixels) / max(1, len(pixels)), 3)} for index in range(3)]
    except Exception as image_error:
        metadata["validation_error"] = f"Raster could not be inspected: {image_error}"
    return metadata


def raster_embedding(metadata: dict[str, Any], content: bytes) -> dict[str, Any]:
    """Return a contextual embedding, never a boundary-level claim."""
    stats = metadata.get("band_statistics") or []
    vector = []
    for item in stats[:4]:
        vector.extend([float(item.get("mean", 0)) / 255.0, float(item.get("min", 0)) / 255.0, float(item.get("max", 0)) / 255.0])
    digest = hashlib.sha256(content).digest()
    vector.extend(byte / 255.0 for byte in digest[:8])
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return {"vector": [round(value / norm, 6) for value in vector], "backend": "offline_contextual_pixel_encoder", "model": "demo-raster-adapter-v1", "trained_in_pipeline": False, "scope": "contextual", "resolution_warning": "Raster embedding is contextual; use high-resolution segmentation for parcel boundaries."}


def building_candidates(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    """Expose a transparent placeholder extraction result for the demo UI."""
    return [{"algorithm": "threshold/connected-components adapter", "status": "available" if metadata.get("bands") else "metadata_only", "confidence": 0.0, "note": "Configure a segmentation model for production building extraction."}]
