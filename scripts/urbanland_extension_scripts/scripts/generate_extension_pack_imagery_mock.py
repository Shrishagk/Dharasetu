"""Generate PLACEHOLDER raster tiles -- structural mocks only.

What this is: three small PNGs, each with a JSON sidecar giving its
EPSG:4326 bounding box, positioned over one real parcel from each of the
zones in this ward (original ward, dense_core extension, sparse_periurban
extension). Each tile is flat synthetic noise with a border -- it looks
like nothing, on purpose.

What this is NOT: a substitute for real drone/satellite imagery. It exists
so a function like `foundation_model.embed(image_chip)` in your pipeline
has *something* to call during a dry run or an offline demo rehearsal,
without needing network access or real imagery on hand. It carries zero
evidential value about matching accuracy -- do not benchmark against it,
and do not present it as if it were real coverage.

See imagery/REAL_SOURCES.md for actual open imagery you can pull instead,
and for why even that needs a resolution check before you point Prithvi /
Clay / AlphaEarth at individual parcel or building footprints in a ward
like this one.
"""
import json
import struct
import random
import zlib
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover - exercised only when Pillow is absent
    Image = ImageDraw = None

random.seed(56000123)  # same seed as the original generate_synthetic_ward.py, for consistency


def project_root() -> Path:
    for parent in (Path(__file__).resolve().parent, *Path(__file__).resolve().parents):
        if (parent / "data" / "generated").is_dir():
            return parent
    raise RuntimeError("Could not locate the UrbanLand project root containing data/generated")


ROOT = project_root()
OUT = ROOT / "data" / "urbanland_extension_pack" / "extension_pack" / "imagery"

TILES = [
    {"name": "mock_tile_original_ward_parcel001", "canonical_parcel_id": "CULR-56000001",
     "bbox": [77.590, 12.968, 77.59094, 12.96884]},
    {"name": "mock_tile_dense_core_parcel101", "canonical_parcel_id": "CULR-56000101",
     "bbox": [77.590, 12.9748, 77.59098, 12.97566]},
    {"name": "mock_tile_sparse_periurban_parcel107", "canonical_parcel_id": "CULR-56000107",
     "bbox": [77.590, 12.9759, 77.59098, 12.97676]},
]
PX = 128


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def write_fallback_png(path: Path) -> None:
    """Write the same 128px RGB noise tile without requiring Pillow."""
    rows = []
    for y in range(PX):
        row = bytearray()
        for x in range(PX):
            value = 90 + random.randint(-15, 15)
            if x < 2 or y < 2 or x >= PX - 2 or y >= PX - 2:
                pixel = (255, 0, 0)
            else:
                pixel = (value, value, value)
            row.extend(pixel)
        rows.append(b"\x00" + bytes(row))
    header = struct.pack(">IIBBBBB", PX, PX, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + _png_chunk(b"IEND", b"")
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for t in TILES:
        image_path = OUT / f"{t['name']}.png"
        if Image is not None:
            img = Image.new("RGB", (PX, PX))
            draw = ImageDraw.Draw(img)
            for y in range(PX):
                for x in range(PX):
                    v = 90 + random.randint(-15, 15)
                    img.putpixel((x, y), (v, v, v))
            draw.rectangle([0, 0, PX - 1, PX - 1], outline=(255, 0, 0), width=2)
            draw.text((6, 6), "MOCK", fill=(255, 0, 0))
            img.save(image_path)
        else:
            write_fallback_png(image_path)
        (OUT / f"{t['name']}.json").write_text(json.dumps({
            "placeholder": True,
            "warning": "Synthetic noise, not real imagery. See REAL_SOURCES.md.",
            "canonical_parcel_id": t["canonical_parcel_id"],
            "bbox_epsg4326": t["bbox"],
            "pixel_size": [PX, PX],
        }, indent=2), encoding="utf-8")
    print(f"Wrote {len(TILES)} placeholder tiles to {OUT}")


if __name__ == "__main__":
    main()
