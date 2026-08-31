# Real imagery sources, and a resolution problem worth knowing about before your demo

The three mock tiles next to this file are structural placeholders only —
flat noise, so a `.embed(image_chip)` call has something to run against
offline. They carry no evidential value. This file is the substitute:
real sources, and a real number you should have in your back pocket if a
judge asks how Prithvi/Clay/AlphaEarth actually help with parcel-level
matching.

## The resolution mismatch (verified, not a guess)

- **NAKSHA** (the actual program this pitch targets — 152 ULBs, drone +
  LiDAR) captures at **5 cm ground resolution**.
- **Prithvi-EO-2.0** is trained on NASA's Harmonized Landsat/Sentinel-2
  archive at **30 m resolution**.
- **Clay v1.5** runs at native sensor resolution — for Sentinel-2 that's
  **10–20 m** depending on band.
- **AlphaEarth Foundations** (Google DeepMind) publishes embeddings at a
  fixed **10 m** per pixel.

That's a 200×–600× gap between what NAKSHA actually captures and what
these three models were built on. Concretely, in *this* synthetic ward:

- A canonical parcel is ~100 m × 95 m → spans roughly 10×10 AlphaEarth
  pixels. Workable as a coarse contextual signal.
- The AI-extracted **building** footprints are ~55 m × 50 m → 5×5 pixels
  at best. Marginal.
- A real small urban residential plot in an Indian ULB is very often
  **9–18 m on a side** (30–60 ft frontage is standard) — *smaller than a
  single AlphaEarth or Clay pixel*, and a small fraction of one Prithvi
  pixel.

**What this means for the pitch:** these three models are real, open, and
worth citing — but at parcel/building scale in a typical Indian ULB, they
function as *regional/contextual* embeddings ("does this look like a dense
residential block vs. a commercial strip"), not as a per-parcel shape
descriptor for the Engine-1 Siamese comparison the source document
describes. Two honest ways to use them that don't overclaim:

1. **Contextual feature only.** Feed the embedding as one input among
   several to the GNN node features (e.g., "this parcel sits in a
   commercially-embedded context") — genuinely useful, but say so, don't
   present it as boundary-level shape matching.
2. **Skip imagery for the core match entirely.** Vector shape descriptors
   (turning-function / Fourier descriptors of the polygon, or a GNN over
   the polygon's own vertex graph) need no raster data at all and are
   buildable *today* against `data/generated/` and this extension pack's
   geometries. This sidesteps the resolution problem completely and is
   lower-risk for a live demo.

If you do want to show the imagery track working, use option 1, and be
ready to give the numbers above if asked — being the team that raises this
before a judge does reads as exactly the kind of engineering honesty the
source document itself argues is a credibility signal (it says as much
about the LLM-schema-matching caveat).

## Where to actually get imagery, if you want it for visual polish

- **Sentinel-2** — free, immediate, no registration friction for basic
  access: [Copernicus Browser](https://browser.dataspace.copernicus.eu/),
  or programmatically via [AWS Open Data](https://registry.opendata.aws/sentinel-2/)
  or [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/).
  This is literally what Prithvi-EO-2.0 and AlphaEarth were trained on, so
  it's the most "in-distribution" choice if you want the embeddings to
  mean something.
- **Bhuvan** (ISRO) — [bhuvan.nrsc.gov.in](https://bhuvan.nrsc.gov.in/) —
  Cartosat-derived products give meaningfully higher resolution over
  India than Sentinel-2 (down to ~1–2.5 m for some products). Free
  registration required; check the specific product's license before
  redistributing anything in a public repo.
- **OpenAerialMap** — [openaerialmap.org](https://openaerialmap.org/) —
  genuinely open-licensed drone/aerial imagery, closest in spirit to real
  drone-ORI. Coverage over any specific Indian ULB is not guaranteed —
  search before you plan a demo around it.
- **NAKSHA/SVAMITVA raw drone tiles** — as far as this research could
  establish, the raw drone orthophotos are **not** published as an open,
  bulk-downloadable dataset; what's on data.gov.in under the SVAMITVA
  catalog is aggregate/statistical (villages surveyed, counts), not pixel
  data. If your team has an actual pilot-ULB relationship, that's a real
  data-access conversation to have — just don't assume it's a public
  download.

## Model links (verified working as of this pack's generation)

- Prithvi-EO-2.0: [github.com/NASA-IMPACT/Prithvi-EO-2.0](https://github.com/NASA-IMPACT/Prithvi-EO-2.0) · Hugging Face · IBM TerraTorch
- Clay v1.5: [clay-foundation.github.io/model](https://clay-foundation.github.io/model/) · GitHub (Apache-2.0) · Hugging Face (Apache-2.0)
- AlphaEarth Foundations: via Google Earth Engine, collection `GOOGLE_SATELLITE_EMBEDDING_V1_ANNUAL`
