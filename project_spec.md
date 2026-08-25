# Project Specification: UrbanLand Fusion AI

## 1. Project Title

**UrbanLand Fusion AI — Intelligent Multi-Source Geospatial Harmonization and Land Record Reconciliation Platform**

---

## 2. Executive Summary

UrbanLand Fusion AI is an **AI-powered geospatial data harmonization platform** designed to create a trusted, synchronized digital representation of urban land parcels by integrating heterogeneous datasets from revenue, municipal, survey, utility, and remote-sensing sources.

Instead of treating the problem as simply "putting multiple GIS layers together," the system creates a **Canonical Urban Land Record** for every parcel.

The platform ingests:

* Drone imagery
* Orthorectified imagery (ORI)
* DSM/DTM
* Existing cadastral maps
* Revenue records
* Municipal GIS
* Utility networks
* Ground Truthing (GT)
* GNSS/CORS survey data
* AI-extracted building footprints

It then performs:

**Ingestion → Coordinate Normalization → Feature Extraction → Spatial Matching → Attribute Reconciliation → Topology Repair → Conflict Detection → Confidence Scoring → Human Validation → Canonical Land Record**

The key innovation is that the system does **not blindly merge datasets**.

When sources disagree, it determines:

1. Which records refer to the same real-world parcel/feature.
2. Which source is more reliable for the particular attribute.
3. What the most probable correct geometry/attribute is.
4. How confident the system is.
5. Whether the result can be automatically accepted or requires human review.

This creates an **AI-assisted land-record reconciliation system rather than a conventional GIS/ETL tool**.

---

# 3. Core Problem

Urban land information is fragmented across departments.

For the same physical property, different systems may contain:

* Different parcel boundaries
* Different survey numbers
* Different coordinate systems
* Different building footprints
* Different owner/occupancy attributes
* Different road boundaries
* Different area measurements
* Outdated geometries
* Missing records
* Duplicate records
* Overlapping polygons
* Invalid topology

Manual GIS operators currently spend substantial effort aligning, comparing, correcting, and reconciling these datasets.

The result is:

* High processing time
* Human-dependent workflows
* Inconsistent decisions
* Difficult inter-departmental data exchange
* Delayed cadastral finalization
* Poor traceability of corrections
* Difficulty identifying genuine changes from surveying/GIS errors

The proposed system addresses the central question:

> **"Given multiple imperfect representations of the same urban land parcel, what is the most reliable unified representation, and how confident are we?"**

---

# 4. Product Vision

Build a **"single source of spatial truth" layer for urban land administration**.

The system should allow a government GIS operator to upload multiple datasets and obtain:

### A. Harmonized parcel map

A unified parcel layer with corrected:

* Geometry
* CRS
* Topology
* Parcel identifiers
* Area
* Building relationships

### B. Reconciled land record

A canonical record combining relevant attributes from:

* Revenue
* Municipal
* Survey
* Utility
* Ground-truth
* Remote-sensing sources

### C. Conflict report

For every disagreement:

> **Conflict → Sources → Evidence → AI decision → Confidence → Recommended action**

### D. Human review queue

Instead of manually checking everything, officials review only:

> **High-impact + low-confidence + conflicting records**

This dramatically reduces manual workload.

---

# 5. Key Differentiator

## From GIS Data Integration to AI Land Record Reconciliation

Traditional approach:

```text
Dataset A
   ↓
Dataset B
   ↓
Manual GIS alignment
   ↓
Manual attribute matching
   ↓
Manual topology correction
   ↓
Final GIS layer
```

UrbanLand Fusion AI:

```text
                    ┌───────────────┐
                    │ Multi-source  │
                    │ Land Data     │
                    └───────┬───────┘
                            ↓
                 ┌─────────────────────┐
                 │ Data Quality & CRS  │
                 │ Normalization       │
                 └──────────┬──────────┘
                            ↓
              ┌───────────────────────────┐
              │ AI Spatial Conflation     │
              │ + Feature Matching        │
              └────────────┬──────────────┘
                           ↓
              ┌───────────────────────────┐
              │ Attribute Reconciliation  │
              │ + Source Reliability      │
              └────────────┬──────────────┘
                           ↓
              ┌───────────────────────────┐
              │ Topology & Conflict       │
              │ Resolution Engine         │
              └────────────┬──────────────┘
                           ↓
              ┌───────────────────────────┐
              │ Confidence & Explainability│
              └────────────┬──────────────┘
                           ↓
                ┌──────────────────────┐
                │ Canonical Urban Land │
                │ Record               │
                └───────────┬──────────┘
                            ↓
                 ┌─────────────────────┐
                 │ Human Review Queue  │
                 └─────────────────────┘
```

---

# 6. Primary Innovation: Canonical Land Record

The central data product is a **Canonical Urban Land Record (CULR)**.

Each parcel receives a persistent internal `canonical_parcel_id`.

Example:

```text
CULR-56000123
```

The record can contain:

```json
{
  "canonical_parcel_id": "CULR-56000123",
  "survey_numbers": ["45/2A", "45/2B"],
  "geometry": "...",
  "area_sq_m": 1842.6,
  "building_count": 3,
  "building_area_sq_m": 921.4,
  "revenue_source": "...",
  "municipal_source": "...",
  "survey_source": "...",
  "land_use": "residential",
  "geometry_confidence": 0.94,
  "attribute_confidence": 0.89,
  "topology_confidence": 0.97,
  "overall_confidence": 0.92,
  "review_status": "AI_ACCEPTED"
}
```

The important principle is:

> **The canonical record does not destroy source records. It preserves provenance and creates a reconciled view over them.**

---

# 7. Source Reliability Model

Different datasets should not be treated as equally authoritative for every attribute.

For example:

| Attribute               | Potential Preferred Evidence                 |
| ----------------------- | -------------------------------------------- |
| Survey boundary         | GNSS/CORS / verified cadastral survey        |
| Parcel identifier       | Revenue record                               |
| Building footprint      | Recent high-resolution imagery / drone       |
| Building height         | DSM                                          |
| Road geometry           | Municipal GIS / recent imagery               |
| Utility location        | Utility network / surveyed data              |
| Current physical change | Recent imagery / GT                          |
| Land-use classification | Municipal/revenue records + spatial evidence |

The system therefore uses an **attribute-specific source reliability model** rather than a single global source priority.

Conceptually:

```text
Reliability(attribute, source)
        +
Spatial agreement
        +
Temporal freshness
        +
Survey accuracy
        +
Cross-source agreement
        ↓
Evidence Score
```

This prevents the dangerous assumption that:

> "Dataset A is always more trustworthy than Dataset B."

---

# 8. AI Spatial Matching Engine

The system must determine whether features in different datasets represent the same real-world object.

## Example

Revenue:

```text
Parcel A
Survey No: 125/4
Area: 1,820 m²
```

Cadastral:

```text
Parcel B
Survey No: 125/4
Area: 1,790 m²
```

Drone-derived geometry:

```text
Parcel C
Area: 1,845 m²
```

The system computes a match probability.

### Matching features

* Centroid distance
* Polygon IoU
* Boundary Hausdorff distance
* Area similarity
* Shape similarity
* Shared road adjacency
* Neighboring parcel similarity
* Survey-number similarity
* Spatial containment
* Building-footprint overlap
* Temporal consistency

Example:

```text
Match probability = 0.96
```

Therefore:

```text
A ↔ B ↔ C
```

are linked to the same canonical parcel.

---

# 9. Spatial Conflation Model

The system should use a hybrid approach rather than relying entirely on deep learning.

## Layer 1 — Deterministic GIS rules

Fast and highly explainable:

* CRS transformation
* Spatial joins
* Buffer matching
* Intersection-over-Union
* Centroid distance
* Area difference
* Geometry validity

## Layer 2 — ML matching model

Used for ambiguous cases.

Candidate features:

```text
area_difference
centroid_distance
IoU
boundary_distance
shape_similarity
neighbor_similarity
building_overlap
identifier_similarity
source_age_difference
```

A lightweight model such as:

* XGBoost
* LightGBM
* Random Forest

can initially estimate:

```text
P(same_real_world_feature)
```

This is highly feasible within a hackathon because it does not require training a massive geospatial foundation model.

---

# 10. Intelligent Attribute Reconciliation

Spatial matching alone is insufficient.

The system must reconcile conflicting attributes.

Example:

```text
Revenue:
Land use = Residential

Municipal:
Land use = Commercial

AI imagery:
Building pattern = Commercial

Latest survey:
Land use = Commercial
```

The engine should not simply select the first value.

It generates:

```text
Resolved value:
Commercial

Confidence:
0.91

Evidence:
- Municipal record
- Latest survey
- Recent imagery

Conflict:
Revenue record differs
```

---

# 11. Attribute Resolution Algorithm

For every attribute:

```text
Candidate values
       ↓
Normalize values
       ↓
Check temporal freshness
       ↓
Check source reliability
       ↓
Check spatial evidence
       ↓
Check cross-source agreement
       ↓
Calculate evidence score
       ↓
Select value
       ↓
Generate confidence
       ↓
Create provenance record
```

Example:

```text
land_use = commercial

confidence = 0.91

supporting_sources:
    municipal_gis
    latest_gt
    imagery

contradicting_sources:
    revenue_record
```

---

# 12. Automated Topology Correction

The platform identifies and proposes corrections for:

* Gaps
* Overlaps
* Sliver polygons
* Self-intersections
* Duplicate geometries
* Multipart inconsistencies
* Boundary mismatches
* Invalid rings

Example:

```text
Parcel A ──────┐
               │ overlap
Parcel B ──────┘
```

The engine evaluates:

```text
Which boundary has stronger evidence?
```

Potential evidence:

* GNSS points
* Cadastral boundary
* Recent imagery
* Adjacent parcel geometry
* Road alignment
* Historical boundary
* Survey accuracy

The system then proposes:

```text
Recommended correction
Confidence = 0.93
```

---

# 13. Conflict Resolution Framework

Not every conflict should be automatically resolved.

The system classifies conflicts into:

### Level 1 — Safe to auto-resolve

High confidence.

Example:

```text
CRS mismatch
```

### Level 2 — AI-assisted resolution

Moderate confidence.

Example:

```text
Two parcel geometries differ by 3.8%
```

### Level 3 — Human decision required

Low confidence or legally significant conflict.

Example:

```text
Two sources indicate different parcel ownership.
```

The platform should **never silently overwrite legally significant records**.

Instead:

```text
CONFLICT
   ↓
Evidence
   ↓
AI recommendation
   ↓
Confidence
   ↓
Human approval
```

---

# 14. Confidence Scoring

Every harmonized output receives confidence scores.

## Geometry Confidence

Based on:

* Source positional accuracy
* Spatial agreement
* GNSS proximity
* Boundary similarity
* Imagery agreement

## Attribute Confidence

Based on:

* Source reliability
* Recency
* Cross-source agreement
* Data completeness

## Overall Confidence

Example:

```text
Geometry confidence       0.95
Attribute confidence      0.88
Topology confidence       0.97
Temporal confidence       0.91

Overall confidence        0.92
```

The system can categorize records:

```text
90–100%  → Auto-approved
70–89%   → AI-assisted review
<70%     → Mandatory human review
```

Thresholds should be configurable by the implementing authority.

---

# 15. Change Detection

The platform compares historical and current datasets to identify:

* New buildings
* Demolished buildings
* Expanded buildings
* Parcel boundary changes
* Road changes
* Land-use changes
* Construction activity
* Utility changes

Example:

```text
2024 Building
       ↓
2026 Drone imagery
       ↓
Building expanded by 31%
```

Output:

```text
CHANGE DETECTED

Parcel: CULR-56000123
Change: Building expansion
Estimated change: +31%
Confidence: 94%
```

This creates a direct operational benefit:

> **Authorities can prioritize records that actually changed instead of reprocessing the entire city.**

---

# 16. High-Impact Feature: Risk-Based Review Queue

The most important operational feature is the **Intelligent Review Queue**.

Instead of asking officials to inspect thousands of parcels, the system ranks records by:

```text
Priority =
  conflict severity
  × confidence uncertainty
  × spatial importance
  × change magnitude
```

Example:

```text
Priority 98
Parcel CULR-10092
Reason:
- Boundary conflict
- Large area discrepancy
- Recent construction
- Low confidence
```

Officials review the most important cases first.

This transforms the system from a passive GIS tool into a **decision-support system for land administration**.

---

# 17. Explainable AI Review

Every AI decision must be explainable.

Example UI:

```text
PARCEL CULR-10092

AI Decision:
Boundary from GNSS survey recommended

Confidence:
94%

Why?

✓ GNSS points within 0.4 m
✓ 96% agreement with recent drone imagery
✓ 2.1% area difference
✓ Adjacent parcel boundaries consistent

Conflicting source:
Revenue cadastral boundary

Recommended Action:
Approve GNSS-aligned boundary
```

This is significantly more suitable for government workflows than a black-box prediction.

---

# 18. Data Provenance

Every canonical attribute must retain provenance.

Example:

```text
canonical.land_use

        ↓

Value: Commercial

Sources:
1. Municipal GIS — 2026
2. Ground Truth — 2026
3. Revenue — 2024

Decision:
Municipal + GT supported Commercial

Confidence:
91%
```

This enables:

* Auditing
* Reproducibility
* Accountability
* Legal traceability
* Future reprocessing

---

# 19. System Architecture

```text
                         DATA SOURCES
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   Raster Data          Vector Data           Tabular Data
        │                     │                     │
 Drone / ORI / DSM      Cadastral / GIS       Revenue / GT
        │                     │                 Municipal
        └─────────────────────┼─────────────────────┘
                              ↓
                    DATA INGESTION LAYER
                              ↓
                 FORMAT + CRS NORMALIZATION
                              ↓
                    QUALITY CONTROL ENGINE
                              ↓
                ┌─────────────┴─────────────┐
                ↓                           ↓
        AI FEATURE EXTRACTION       VECTOR PROCESSING
                ↓                           ↓
        Building / Road / etc.       Parcel / Network
                └─────────────┬─────────────┘
                              ↓
                   SPATIAL MATCHING ENGINE
                              ↓
                  ENTITY RESOLUTION GRAPH
                              ↓
                  ATTRIBUTE RECONCILIATION
                              ↓
                 TOPOLOGY CORRECTION ENGINE
                              ↓
                   CONFLICT RESOLUTION
                              ↓
                  CONFIDENCE SCORING
                              ↓
                 CANONICAL LAND RECORD
                              ↓
             ┌────────────────┴────────────────┐
             ↓                                 ↓
      AUTO-APPROVED RECORDS             HUMAN REVIEW
             │                                 │
             └────────────────┬────────────────┘
                              ↓
                    FINAL LAND DATABASE
                              ↓
                  WEB GIS / API / EXPORT
```

---

# 20. Entity Resolution Graph

A particularly useful architectural component is the **Land Entity Graph**.

Instead of storing only merged polygons, the platform maintains relationships:

```text
                 ┌───────────────┐
                 │ Revenue       │
                 │ Parcel 125/4  │
                 └───────┬───────┘
                         │
                    MATCH 0.97
                         │
                 ┌───────▼───────┐
                 │ Canonical     │
                 │ Parcel        │
                 └───────┬───────┘
                         │
              ┌──────────┼───────────┐
              │          │           │
          MATCH 0.94  MATCH 0.91  MATCH 0.98
              │          │           │
          Municipal    Drone       GNSS
           Parcel     Boundary     Survey
```

This allows the system to preserve the relationship between:

**source entity → canonical entity → evidence**

rather than destroying source identity during merging.

---

# 21. Minimum Viable Product

For a hackathon, the MVP should deliberately avoid attempting to solve every geospatial problem.

## MVP Input

Use a small urban test area containing:

1. Existing cadastral polygons
2. Municipal parcel/building layer
3. Revenue attributes
4. Drone/ORI imagery
5. AI-generated building footprints
6. GNSS/GT sample points

---

## MVP Pipeline

### Step 1 — Upload

User uploads:

```text
GeoJSON / Shapefile / GeoPackage / CSV / Raster
```

### Step 2 — Automatic CRS detection

System identifies:

```text
EPSG:xxxx
```

and normalizes all spatial layers into a common reference system.

### Step 3 — Data quality audit

Generate:

```text
Invalid geometries: 14
Duplicate parcels: 7
CRS mismatches: 2
Missing attributes: 31
```

### Step 4 — Spatial matching

Match cadastral, municipal, and AI-derived features.

### Step 5 — Attribute reconciliation

Resolve:

* Area
* Land use
* Building count
* Parcel ID
* Survey ID

### Step 6 — Conflict detection

Identify disagreements.

### Step 7 — Confidence scoring

Rank every result.

### Step 8 — Review dashboard

Show:

```text
Total parcels:              1,250
Auto harmonized:              987
AI-assisted review:           193
Human review required:         70
```

### Step 9 — Export

Generate:

* Harmonized GeoJSON
* GeoPackage
* CSV reconciliation report
* Conflict report
* Audit/provenance report

---

# 22. Technology Stack

## Frontend

* React
* TypeScript
* MapLibre GL JS or OpenLayers
* Tailwind CSS

## Backend

* Python
* FastAPI

## Geospatial Processing

* GDAL
* GeoPandas
* Shapely
* Rasterio
* PyProj
* PostGIS

## Spatial Database

**PostgreSQL + PostGIS**

Recommended because it provides:

* Spatial indexing
* Geometry operations
* Spatial joins
* Topology-related processing
* Scalable geospatial queries

## Machine Learning

* scikit-learn
* XGBoost

## Computer Vision

For the MVP:

* YOLO/Segmentation model for building detection
* Existing pretrained model rather than training from scratch

## Raster/Remote Sensing

* Rasterio
* GDAL
* OpenCV

## API

FastAPI REST endpoints.

## Deployment

* Docker
* PostgreSQL/PostGIS
* Cloud VM or container platform

---

# 23. Suggested Database Model

### `canonical_parcels`

```text
canonical_parcel_id
geometry
area
land_use
building_count
overall_confidence
review_status
created_at
updated_at
```

### `source_parcels`

```text
source_id
source_name
source_record_id
geometry
attributes
capture_date
source_accuracy
```

### `entity_matches`

```text
source_record_a
source_record_b
canonical_parcel_id
match_probability
matching_features
```

### `attribute_evidence`

```text
canonical_parcel_id
attribute_name
value
source_id
evidence_score
confidence
```

### `conflicts`

```text
conflict_id
canonical_parcel_id
conflict_type
severity
description
recommended_action
confidence
status
```

### `review_actions`

```text
review_id
parcel_id
reviewer
decision
comment
timestamp
```

---

# 24. API Design

## Upload Dataset

```http
POST /datasets/upload
```

## Run Data Audit

```http
POST /datasets/{dataset_id}/audit
```

## Harmonize Datasets

```http
POST /harmonization/run
```

## Get Parcel

```http
GET /parcels/{canonical_parcel_id}
```

## Get Conflicts

```http
GET /conflicts
```

## Get Review Queue

```http
GET /review/priority
```

## Approve Recommendation

```http
POST /review/{review_id}/approve
```

## Reject Recommendation

```http
POST /review/{review_id}/reject
```

## Export Harmonized Layer

```http
GET /exports/{job_id}
```

---

# 25. Web GIS Dashboard

The dashboard should contain four major panels.

## Panel 1 — Map

Interactive urban map displaying:

* Parcels
* Buildings
* Roads
* Utilities
* Conflicts
* Changes

---

## Panel 2 — Data Sources

Toggle layers:

```text
☑ Revenue
☑ Cadastral
☑ Municipal
☑ Drone
☑ AI Buildings
☑ GNSS
☑ Utilities
```

---

## Panel 3 — Conflict Heatmap

Display areas with:

* High disagreement
* Boundary conflicts
* Attribute conflicts
* Low confidence

---

## Panel 4 — Review Queue

Example:

```text
#1  Parcel 1092
    Boundary conflict
    Confidence: 61%

#2  Parcel 1044
    Area discrepancy
    Confidence: 67%

#3  Parcel 2219
    Land-use conflict
    Confidence: 72%
```

Clicking a record opens an evidence panel.

---

# 26. "Before vs After" Demonstration

The hackathon demo should focus heavily on visualization.

## Before

```text
Cadastral layer
       +
Municipal layer
       +
AI building layer
       +
Survey layer

       ↓

Overlapping / inconsistent data
```

## After

```text
                    AI Harmonizer

Cadastral ───────┐
Municipal ───────┤
Revenue ─────────┤
Drone ───────────┤
AI Buildings ────┤
GNSS ────────────┘
                  ↓
          Canonical Parcel
                  ↓
       Confidence + Evidence
                  ↓
         Human Verification
                  ↓
         Trusted Land Record
```

The visual difference should be immediately obvious to evaluators.

---

# 27. Business Impact

The solution creates value at multiple levels.

## Government

* Reduces manual GIS processing
* Accelerates cadastral finalization
* Improves record consistency
* Enables inter-departmental interoperability
* Creates auditable reconciliation workflows

## Survey Departments

* Faster integration of GNSS/GNSS-CORS results
* Automatic comparison against existing cadastral layers
* Reduced repetitive GIS operations

## Municipalities

* Faster building/parcel updates
* Better land-use information
* Better synchronization between municipal and revenue records

## Utility Departments

Accurate parcel/building relationships can support:

* Water networks
* Electricity networks
* Drainage
* Roads
* Infrastructure planning

## Citizens

Potential downstream benefits include:

* Faster land-record services
* Fewer contradictory records
* Better digital property services
* Faster mutation/update workflows

---

# 28. Quantifiable Success Metrics

The project should measure actual improvement rather than simply demonstrating that the pipeline runs.

## Integration Efficiency

```text
Manual processing time
        vs
AI-assisted processing time
```

Target:

> **70%+ reduction in repetitive GIS integration work in the demonstration dataset.**

---

## Matching Accuracy

Measure:

```text
Precision
Recall
F1-score
```

for known parcel matches.

Target:

> **90%+ F1 on the curated demonstration benchmark.**

---

## Geometry Accuracy

Measure:

* IoU
* Hausdorff distance
* Area error

Target:

> **<5% median area discrepancy for successfully harmonized parcels.**

---

## Conflict Detection

Measure:

```text
True conflicts detected
-----------------------
Total known conflicts
```

Target:

> **90%+ recall on intentionally injected conflicts.**

---

## Human Review Reduction

Measure:

```text
Total records
-
Records requiring human review
```

Target:

> **60–80% of records automatically resolved in the controlled MVP dataset.**

These are project targets to validate experimentally, not claims of achieved performance.

---

# 29. Dataset Strategy for Hackathon

A fully operational government-scale dataset may not be available.

Therefore use a **synthetic + real-world proxy strategy**.

## Base Dataset

Use an openly available urban geospatial dataset where licensing permits the intended demonstration.

Create:

```text
Ground-truth layer
```

Then generate realistic source imperfections:

* CRS differences
* Positional shifts
* Missing attributes
* Duplicate records
* Boundary offsets
* Attribute conflicts
* Outdated buildings
* Polygon overlaps
* Sliver geometries

This provides a controlled benchmark.

---

# 30. Synthetic Conflict Generator

This is another strong demo component.

The system can deliberately introduce:

```text
+ 2m boundary shift
+ missing survey number
+ 8% area error
+ duplicate parcel
+ invalid polygon
+ outdated building footprint
+ land-use conflict
```

Then demonstrate that UrbanLand Fusion AI detects and resolves them.

This makes evaluation measurable.

---

# 31. Unique Innovation: Evidence-Weighted Conflation

The strongest technical novelty should be the combination of:

```text
Spatial similarity
        +
Temporal freshness
        +
Source reliability
        +
Survey accuracy
        +
Cross-source agreement
        +
AI feature evidence
        ↓
Evidence-weighted decision
```

Instead of:

> "Dataset X wins."

The system answers:

> **"Dataset X wins for this attribute because the evidence supports it."**

---

# 32. Unique Innovation: Confidence-Aware Automation

The platform should explicitly separate:

```text
Automation
```

from

```text
Human judgment
```

This is important for government adoption.

The AI does not claim:

> "This is definitely correct."

It says:

```text
95% confidence → Auto-resolve
78% confidence → Review recommended
52% confidence → Human decision required
```

This makes the architecture safer and more practical.

---

# 33. Unique Innovation: Temporal Land Record Synchronization

Instead of creating a one-time harmonized dataset, the platform maintains:

```text
Historical State
       ↓
Current State
       ↓
Detected Changes
       ↓
Updated Canonical Record
```

Therefore, when new drone imagery or GNSS data arrives, the system does not need to rebuild the entire database.

It identifies:

> **What changed?**

and updates only affected records.

---

# 34. Unique Innovation: Impact-Aware Review

Not every conflict has equal importance.

A 2 m boundary discrepancy in an empty plot is different from a boundary discrepancy involving:

* Dense construction
* Major road
* Utility infrastructure
* Large parcel
* Multiple neighboring parcels

Therefore the review priority should incorporate **impact**, not just confidence.

Example:

```text
Review Priority =
Uncertainty
× Conflict Severity
× Change Magnitude
× Spatial Impact
```

This helps government staff focus limited human resources on the most consequential cases.

---

# 35. Security and Governance

Because land records can be sensitive and legally significant:

* Role-based access control
* Authentication
* Dataset-level permissions
* Audit logs
* Immutable review history
* Source provenance
* Versioned canonical records
* Human approval for legally significant changes

should be incorporated.

The AI should **recommend changes**, while authorized officials retain decision authority.

---

# 36. Scalability Strategy

The architecture should support scaling from:

```text
1 ward
```

to:

```text
1 city
```

to:

```text
multiple cities
```

Processing should be asynchronous.

```text
Upload
  ↓
Create Job
  ↓
Queue
  ↓
Geospatial Processing
  ↓
AI Processing
  ↓
Validation
  ↓
Result
```

Large raster operations should be processed independently from transactional API operations.

