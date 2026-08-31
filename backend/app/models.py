"""Database models for UrbanLand Fusion AI.

Defines SQLAlchemy ORM models for:
- Harmonization jobs
- Canonical parcel records
- Source datasets
- Audit logs
- User decisions
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import JSON, Column, DateTime, Enum as SQLEnum, Float, Integer, String, Text, Boolean, ForeignKey, Table, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class JobStatus(str, Enum):
    """Harmonization job lifecycle."""
    PENDING = "pending"
    PROCESSING = "processing"
    CONFLICTS_DETECTED = "conflicts_detected"
    AWAITING_REVIEW = "awaiting_review"
    COMPLETED = "completed"
    FAILED = "failed"


class ReviewStatus(str, Enum):
    """Parcel review/decision status."""
    UNREVIEWED = "unreviewed"
    AI_ACCEPTED = "ai_accepted"
    AI_ASSISTED = "ai_assisted"
    HUMAN_REVIEW = "human_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    FLAGGED = "flagged"


class ConflictSeverity(str, Enum):
    """Conflict severity level."""
    INFORMATIONAL = "informational"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# Association table for job-source relationship
job_sources = Table(
    "job_sources",
    Base.metadata,
    Column("job_id", String, ForeignKey("harmonization_jobs.id")),
    Column("source_id", String, ForeignKey("data_sources.id")),
)


class HarmonizationJob(Base):
    """Represents a single harmonization/fusion run."""
    __tablename__ = "harmonization_jobs"

    id = Column(String, primary_key=True, index=True)
    ward_name = Column(String, nullable=False)
    status = Column(SQLEnum(JobStatus), default=JobStatus.PENDING, index=True)
    
    # Processing metadata
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    processing_time_seconds = Column(Float, nullable=True)
    
    # Job configuration
    geospatial_backend = Column(String, default="morphology")  # morphology, prithvi, clay
    semantic_backend = Column(String, default="sentence-transformers")
    confidence_method = Column(String, default="conformal")
    
    # Results
    canonical_record_count = Column(Integer, default=0)
    total_conflicts_detected = Column(Integer, default=0)
    high_severity_conflicts = Column(Integer, default=0)
    auto_resolved_count = Column(Integer, default=0)
    human_decisions_count = Column(Integer, default=0)
    
    # Performance metrics
    metrics = Column(JSON, nullable=True)  # {f1_score, recall, precision, ...}
    
    # Relationships
    sources = relationship("DataSource", secondary=job_sources, back_populates="jobs")
    canonical_records = relationship("CanonicalRecord", back_populates="job", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="job", cascade="all, delete-orphan")
    
    # User/system info
    created_by = Column(String, default="system")
    notes = Column(Text, nullable=True)
    
    __table_args__ = (
        Index("idx_job_ward_created", "ward_name", "created_at"),
        Index("idx_job_status_created", "status", "created_at"),
    )


class DataSource(Base):
    """Represents an ingested geospatial or tabular dataset."""
    __tablename__ = "data_sources"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    provider_name = Column(String, nullable=False)
    dataset_type = Column(String)  # cadastral, municipal, revenue, buildings, etc.
    source_type = Column(String)  # Vector, Tabular
    file_path = Column(String, nullable=False)  # Path to stored GeoJSON/CSV
    file_format = Column(String)  # GeoJSON, Shapefile, CSV, etc.
    crs = Column(String)  # EPSG:4326
    epsg_code = Column(String, nullable=True)
    
    # Metadata
    feature_count = Column(Integer, default=0)
    geometry_types = Column(String, nullable=True)  # Polygon, Point, LineString, etc.
    bbox = Column(JSON, nullable=True)  # [minx, miny, maxx, maxy]
    attribute_fields = Column(JSON, default=list)  # List of field names
    schema = Column(JSON, default=list)  # [{name, type}, ...]
    
    # Status & validation
    status = Column(String, default="READY")  # READY, VALIDATION_WARNING, NEEDS_METADATA
    validation_status = Column(String, default="PASSED")
    issues = Column(JSON, default=list)  # List of validation issues
    
    # Provenance
    acquisition_date = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    version = Column(Integer, default=1)
    is_demo = Column(Boolean, default=False)
    
    # Relationships
    jobs = relationship("HarmonizationJob", secondary=job_sources, back_populates="sources")
    
    # Metadata JSON fields
    provenance = Column(JSON, nullable=True)  # {organization, imported_by, source_reference}
    
    __table_args__ = (
        Index("idx_source_provider_created", "provider_name", "created_at"),
    )


class CanonicalRecord(Base):
    """The authoritative unified parcel record after harmonization."""
    __tablename__ = "canonical_records"

    id = Column(String, primary_key=True, index=True)  # CULR-5600XXXX
    job_id = Column(String, ForeignKey("harmonization_jobs.id"), index=True)
    
    # Identity
    survey_number = Column(String, nullable=True)
    land_use = Column(String, nullable=True)
    
    # Geometry (stored as GeoJSON)
    geometry = Column(JSON, nullable=False)
    bbox = Column(JSON, nullable=True)  # [minx, miny, maxx, maxy]
    area_sq_m = Column(Float, nullable=True)
    
    # Confidence & decision
    geometry_confidence = Column(Float, default=0.0)  # 0-1
    semantic_confidence = Column(Float, default=0.0)  # 0-1
    conformal_confidence = Column(Float, default=0.0)  # 0-1
    overall_confidence = Column(Float, default=0.0)  # combined 0-1
    confidence_decision = Column(String, nullable=True)  # accept, reject, review
    confidence_region = Column(String, nullable=True)
    confidence_set_size = Column(Integer, default=0)
    
    # Conflict information
    conflict_type = Column(String, nullable=True)  # boundary_offset, land_use_mismatch, etc.
    conflict_types = Column(JSON, default=list)  # Multiple conflict types
    conflict_severity = Column(SQLEnum(ConflictSeverity), default=ConflictSeverity.INFORMATIONAL)
    conflict_sources = Column(JSON, default=list)  # Which sources conflict
    
    # Review status
    review_status = Column(SQLEnum(ReviewStatus), default=ReviewStatus.UNREVIEWED, index=True)
    priority = Column(Integer, default=0)  # Higher = more urgent
    version = Column(Integer, default=1)
    
    # Lineage
    source_records = Column(JSON, nullable=True)  # Map of source_id -> record_id
    source_values = Column(JSON, nullable=True)  # Conflicting attribute values from sources
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    job = relationship("HarmonizationJob", back_populates="canonical_records")
    decisions = relationship("ParcelDecision", back_populates="record", cascade="all, delete-orphan")
    
    # Capture metadata
    capture_date = Column(String, nullable=True)
    ward_name = Column(String, nullable=True, index=True)
    
    __table_args__ = (
        Index("idx_record_job_status", "job_id", "review_status"),
        Index("idx_record_severity", "conflict_severity"),
        Index("idx_record_confidence", "overall_confidence"),
    )


class ParcelDecision(Base):
    """Audit trail: human approval/rejection/flagging decisions on parcels."""
    __tablename__ = "parcel_decisions"

    id = Column(String, primary_key=True, index=True)
    record_id = Column(String, ForeignKey("canonical_records.id"), index=True)
    
    # Decision
    action = Column(String, nullable=False)  # approve, reject, flag, review
    reasoning = Column(Text, nullable=True)
    decision_confidence = Column(Float, nullable=True)  # User's confidence in decision
    
    # User & context
    decided_by = Column(String, nullable=False)  # username/email
    user_role = Column(String, nullable=True)  # operator, reviewer, admin
    decided_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    
    # Metadata for audit
    source_system = Column(String, nullable=True)  # web, api, batch, etc.
    session_id = Column(String, nullable=True)
    
    # Relationships
    record = relationship("CanonicalRecord", back_populates="decisions")
    
    __table_args__ = (
        Index("idx_decision_decided_at", "decided_at"),
        Index("idx_decision_user_role", "user_role", "decided_at"),
    )


class AuditLog(Base):
    """Complete immutable audit trail of all system actions."""
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("harmonization_jobs.id"), index=True, nullable=True)
    
    # Event
    event_type = Column(String, nullable=False, index=True)  # job_created, job_completed, parcel_reviewed, data_uploaded, etc.
    entity_type = Column(String, nullable=True)  # job, parcel, source, user
    entity_id = Column(String, nullable=True, index=True)
    
    # Changes
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    change_summary = Column(Text, nullable=True)
    
    # Context
    user = Column(String, nullable=False)
    user_role = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    
    # Metadata
    source_ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    
    # Relationships
    job = relationship("HarmonizationJob", back_populates="audit_logs")
    
    __table_args__ = (
        Index("idx_audit_timestamp_type", "timestamp", "event_type"),
        Index("idx_audit_user", "user", "timestamp"),
    )


class HarmonizationMetrics(Base):
    """Aggregated performance metrics and quality indicators."""
    __tablename__ = "harmonization_metrics"

    id = Column(String, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("harmonization_jobs.id"), index=True, nullable=True)
    
    # Quality metrics
    match_f1_score = Column(Float, default=0.0)
    match_precision = Column(Float, default=0.0)
    match_recall = Column(Float, default=0.0)
    conflict_detection_rate = Column(Float, default=0.0)
    auto_resolution_rate = Column(Float, default=0.0)
    
    # Performance metrics
    processing_time_sec = Column(Float, default=0.0)
    records_per_second = Column(Float, default=0.0)
    
    # Coverage metrics
    spatial_coverage_percent = Column(Float, default=0.0)
    attribute_completeness_percent = Column(Float, default=0.0)
    
    # Confidence distribution
    high_confidence_percent = Column(Float, default=0.0)  # >= 0.9
    medium_confidence_percent = Column(Float, default=0.0)  # 0.75-0.89
    low_confidence_percent = Column(Float, default=0.0)  # < 0.75
    
    # Conflict distribution
    critical_conflicts = Column(Integer, default=0)
    high_conflicts = Column(Integer, default=0)
    medium_conflicts = Column(Integer, default=0)
    low_conflicts = Column(Integer, default=0)
    
    recorded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index("idx_metrics_job", "job_id"),
    )
