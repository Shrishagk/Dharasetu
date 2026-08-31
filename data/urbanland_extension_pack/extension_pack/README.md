# Extension pack — what's here and why

This is purely additive. Nothing in your original `data.zip` / `scripts.zip`
is modified. Everything here is new IDs, new files, new folders, generated
by the two scripts in `scripts/` (also included so you can regenerate or
extend it — everything is deterministic, no hidden random seed to lose).

**First, an unrelated but important finding from inspecting your original
data:** `data/audit_tmp/` is corrupted — a coordinate-rounding bug collapsed
89–93% of every layer's polygons into degenerate zero-area points (and 2
ground-truth features vanished entirely). `data/generated/` is fine and is
what everything below builds on. Don't point anything at `audit_tmp/`; see
the full comparison in the chat response this pack was delivered with.

## Gap → file map

| Gap (Engine) | What was missing | Fixed by |
|---|---|---|
| Many-to-many correspondence (Engine 1) | Every source parcel maps 1:1 to ground truth except one literal duplicate. No split, no merge, anywhere. | `spatial/municipal_parcels_ext.geojson` + `spatial/correspondence_manifest_ext.json` — 1→2 and 1→3 subdivisions (real Hissa-style numbering), 2→1 and 3→1 merges, with full scoreable ground truth |
| Spatial heterogeneity for conformal prediction (Engine 3) | Uniform noise across the whole ward — nothing that would make spatially-weighted CP behave differently from a global model. | The same spatial files, split into `dense_core` and `sparse_periurban` zones with **measured** ~0.9 m vs ~6.5 m positional offsets (see `zone_noise_summary_m` in the manifest — computed from the actual generated coordinates, not asserted) |
| Schema heterogeneity (Engine 2) | All five original sources use identical field names (`survey_number`, `land_use`, `area_sq_m`...). A plain merge-on-column already solves the join. | `heterogeneous_schemas/khata_extract_karnataka.csv` (Karnataka municipal Khata — a genuinely different identifier from Survey Number, not a renamed field) + `water_connection_register.json` (no shared ID field at all, coarser category vocabulary, ~10% missing cross-links) |
| Multilingual field labels (Engine 2) | Zero non-English content anywhere, despite the Hindi/Tamil/Telugu claim in the pitch. | `heterogeneous_schemas/cross_state_schema_samples.json` — Tamil Nadu TSLR-style and Hindi NGDRS-style illustrative records |
| LADM grounding target (Engine 2) | Nothing to validate an LLM's proposed mapping against. | `ontology/ladm_core_subset.json` — compact, verified subset of the real ISO 19152 core (4 base classes) |
| Foundation-model imagery (Engine 1) | Zero raster data; Prithvi/Clay/AlphaEarth need pixels, not polygons. | `imagery/` — placeholder tiles so your pipeline runs end-to-end offline, **plus `imagery/REAL_SOURCES.md`**, which is the part actually worth reading: real open sources, and a verified resolution-mismatch number (NAKSHA's 5cm vs these models' 10–30m) that matters for how you present this piece |

## Two kinds of ground truth — don't confuse them

- **Field-level** (which *column* means the same concept): `heterogeneous_schemas/crosswalk_answer_key.json`. Scores your schema matcher.
- **Record-level** (which *row* is the same real-world parcel): `heterogeneous_schemas/record_level_ground_truth.json`. Scores entity resolution once the schema mapping is known.

Real Engine 2 needs both steps; they're different problems. Neither file
should ever be an input to the matcher itself — same rule as
`ground_truth_parcels.geojson` in your original data.zip.

## How the new schema files relate to what you already have

`khata_extract_karnataka.csv` and `water_connection_register.json` describe
the *same* 84 parcels (your original 72 + the 12 new ones in
`spatial/ground_truth_parcels_ext.geojson`) through two more source
systems. Join all five together (revenue, cadastral, municipal, Khata,
utility) and you have something closer to the real multi-agency
reconciliation problem the source document describes, rather than five
files that all already agree on a column name.

## Honesty notes (please keep these if you present this pack)

- Kannada, Tamil, and Hindi terms used here were checked character-by-
  character against real sources during generation (Karnataka's Bhoomi
  terminology, Tamil Nadu's e-Services/TNREGINET terminology) — not
  reconstructed from memory. They're still a small, illustrative set.
  Have a native speaker confirm before a live demo; state-specific NGDRS
  templates vary.
- The subdivision numbering (`131/1-1`, `131/1-2`) follows the real
  concept of a Karnataka "Hissa" (a survey number's sub-division) but the
  exact notation format (numeric suffix vs. alphabetic) varies by state
  and era — confirm your target state's actual convention.
- The imagery placeholders are flat noise. They exist so code doesn't
  crash offline, not to simulate accuracy. Don't benchmark against them.
