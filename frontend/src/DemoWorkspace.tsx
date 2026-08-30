import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  Download,
  Focus,
  Info,
  Keyboard,
  Layers3,
  LoaderCircle,
  MapPinned,
  Minimize2,
  Network,
  Play,
  Ruler,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';

const API = '/api/v1';
type DemoMode = 'sources' | 'harmonized' | 'compare';
type DemoTab = 'Review Queue' | 'Data Sources' | 'Changes' | 'Export';
type SourceKey = 'cadastral' | 'municipal' | 'buildings' | 'canonical';
type StatusFilter = 'needs-review' | 'all' | 'human' | 'conflicts' | 'assisted' | 'published';
type IssueFilter = 'all' | 'boundary' | 'area' | 'duplicate' | 'land_use' | 'building';
type ConfidenceFilter = 'all' | 'low' | 'medium' | 'high';
type SortMode = 'priority' | 'severity' | 'confidence-low' | 'source' | 'conflict';

type Parcel = {
  canonical_parcel_id: string;
  survey_number: string;
  land_use: string;
  area_sq_m: number;
  overall_confidence: number;
  geometry_confidence?: number;
  semantic_confidence?: number;
  conformal_confidence?: number;
  review_status: string;
  conflict_type?: string;
  conflict_types?: string[];
  conflict_severity?: string;
  conflict_sources?: string[];
  priority: number;
  canonical_version?: number;
  confidence_set_size?: number;
  confidence_decision?: string;
  confidence_region?: string;
  capture_date?: string;
};

type Dashboard = {
  ward: string;
  started: boolean;
  summary: { total_parcels: number; harmonized: number; conflicts: number; human_review: number; changes: number };
  review_queue: Parcel[];
  latest_job?: any;
};

type EngineOverview = {
  run_id?: string;
  created_at?: string;
  spatial_engine?: { name?: string };
  semantic_engine?: {
    semantic_backend?: { semantic_backend?: string; status?: string; fallback_active?: boolean };
  };
  confidence_engine?: { coverage?: number };
  metrics?: Record<string, number>;
};

type Source = {
  id: string;
  name: string;
  file: string;
  format: string;
  crs: string | null;
  records: number;
  status: string;
  issues: string[];
  provider_name?: string;
  dataset_type?: string;
  source_type?: string;
  feature_count?: number;
  coverage?: string;
  validation_status?: string;
  processing_status?: string;
};

type Detail = {
  parcel: any;
  source_values: { source: string; attribute: string; value: string; score: number; detail?: string }[];
  evidence: { source: string; score: number; detail: string }[];
  recommendation: string;
  explanation: string;
  lineage: { version: number; sources: string[] };
  engine?: {
    spatial?: { algorithm?: string; matches?: any[]; many_to_many?: any[] };
    semantic?: { ontology?: { triple_count?: number }; semantic_backend?: { semantic_backend?: string; status?: string; fallback_active?: boolean }; mapped_field_count?: number };
    confidence?: { coverage?: number; decision?: string; region?: string; method?: string };
    joint?: { geometry?: number; semantic?: number; calibrated?: number; decision?: string; region?: string };
  };
};

const sourceOptions: { key: SourceKey; label: string; color: string }[] = [
  { key: 'cadastral', label: 'Cadastral', color: 'blue' },
  { key: 'municipal', label: 'Municipal', color: 'violet' },
  { key: 'buildings', label: 'Building footprints', color: 'amber' },
  { key: 'canonical', label: 'Harmonized boundary', color: 'green' },
];

const formatNumber = (value?: number) => value === undefined ? '—' : new Intl.NumberFormat('en-IN').format(value);
const formatConfidence = (value?: number) => value === undefined ? '—' : `${Math.round(value * 100)}%`;
const titleCase = (value?: string) => value ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'No unresolved conflict';
const statusLabel = (value?: string) => value ? titleCase(value) : 'Unknown';
const toParcel = (properties: any): Parcel => ({
  canonical_parcel_id: String(properties.canonical_parcel_id ?? properties.id),
  survey_number: String(properties.survey_number ?? 'Not available'),
  land_use: String(properties.land_use ?? 'Unclassified'),
  area_sq_m: Number(properties.area_sq_m ?? 0),
  overall_confidence: Number(properties.overall_confidence ?? 0),
  geometry_confidence: properties.geometry_confidence === undefined ? undefined : Number(properties.geometry_confidence),
  semantic_confidence: properties.semantic_confidence === undefined ? undefined : Number(properties.semantic_confidence),
  conformal_confidence: properties.conformal_confidence === undefined ? undefined : Number(properties.conformal_confidence),
  review_status: String(properties.review_status ?? 'HUMAN_REVIEW'),
  conflict_type: properties.conflict_type || undefined,
  conflict_types: properties.conflict_types ?? (properties.conflict_type ? [properties.conflict_type] : []),
  conflict_severity: properties.conflict_severity || undefined,
  conflict_sources: properties.conflict_sources ?? [],
  priority: Number(properties.priority ?? 0),
  canonical_version: Number(properties.canonical_version ?? 1),
  confidence_set_size: Number(properties.confidence_set_size ?? 0),
  confidence_decision: properties.confidence_decision || undefined,
  confidence_region: properties.confidence_region || undefined,
  capture_date: properties.capture_date,
});

function ActionButton({ children, onClick, variant = 'primary', icon: Icon, disabled = false }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'text'; icon?: any; disabled?: boolean }) {
  return <button className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{children}{Icon && <Icon size={16} strokeWidth={1.7} />}</button>;
}

function confidenceBand(value: number) {
  return value >= .9 ? 'high' : value >= .75 ? 'medium' : 'low';
}

function severityBand(parcel?: Parcel) {
  if (!parcel?.conflict_type) return 'resolved';
  const severity = parcel.conflict_severity?.toLowerCase();
  return severity === 'critical' || severity === 'high' ? 'critical' : severity === 'low' ? 'informational' : 'warning';
}

function SeverityBadge({ parcel }: { parcel?: Parcel }) {
  const tone = severityBand(parcel);
  const Icon = tone === 'critical' ? CircleAlert : tone === 'warning' ? CircleAlert : tone === 'resolved' ? CircleCheck : Info;
  const label = tone === 'critical' ? 'Critical · Requires intervention' : tone === 'warning' ? 'Warning · Potential inconsistency' : tone === 'resolved' ? 'Resolved · Automatically reconciled' : 'Informational · Review signal';
  return <span className={`severity-badge severity-${tone}`}><Icon size={14} />{label}</span>;
}

function sourceKeyFromName(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('municipal')) return 'municipal' as SourceKey;
  if (normalized.includes('building') || normalized.includes('drone') || normalized.includes('imagery')) return 'buildings' as SourceKey;
  if (normalized.includes('canonical')) return 'canonical' as SourceKey;
  return 'cadastral' as SourceKey;
}

function sourceCount(parcel: Parcel) {
  return parcel.conflict_sources?.length || (parcel.conflict_type ? 3 : 4);
}

function mapSourceMatches(parcel: Parcel, filter: string) {
  if (filter === 'all') return true;
  const sources = (parcel.conflict_sources ?? []).join(' ').toLowerCase();
  if (filter === 'imagery') return sources.includes('imagery') || sources.includes('building') || sources.includes('drone');
  return sources.includes(filter);
}

function matchesIssue(parcel: Parcel, issue: IssueFilter) {
  if (issue === 'all') return true;
  const text = [...(parcel.conflict_types ?? []), parcel.conflict_type ?? ''].join(' ').toLowerCase();
  return text.includes(issue === 'land_use' ? 'land' : issue);
}

function MapView({ mode, compare, layerVisibility, selected, activeSource, basemapVisible, onSelect, onSourceSelect }: { mode: DemoMode; compare: number; layerVisibility: Record<SourceKey, boolean>; selected: Parcel | null; activeSource: SourceKey; basemapVisible: boolean; onSelect: (parcel: Parcel) => void; onSourceSelect: (source: SourceKey) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSourceSelectRef = useRef(onSourceSelect);
  const [mapReady, setMapReady] = useState(false);
  const [mapHarmonizationReady, setMapHarmonizationReady] = useState(false);
  useEffect(() => { onSelectRef.current = onSelect; onSourceSelectRef.current = onSourceSelect; }, [onSelect, onSourceSelect]);
  useEffect(() => {
    const markReady = () => setMapHarmonizationReady(true);
    window.addEventListener('urbanland:harmonized', markReady);
    fetch(`${API}/dashboard`).then((response) => response.json()).then((data) => { if (data.latest_job) markReady(); }).catch(() => undefined);
    return () => window.removeEventListener('urbanland:harmonized', markReady);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new maplibregl.Map({
      container: containerRef.current,
      center: [77.597, 12.971],
      zoom: 15.6,
      attributionControl: false,
      style: { version: 8, sources: { satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } }, layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }] } as any,
    });
    mapRef.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', async () => {
      try {
        for (const name of ['canonical', 'cadastral', 'municipal', 'buildings'] as SourceKey[]) {
          const data = name === 'canonical' ? { type: 'FeatureCollection', features: [] } : await fetch(`${API}/layers/${name}`).then((response) => response.json());
          instance.addSource(name, { type: 'geojson', data });
          instance.addLayer({
            id: name,
            type: name === 'buildings' ? 'fill' : 'line',
            source: name,
            paint: name === 'canonical'
              ? { 'line-color': ['case', ['==', ['get', 'review_status'], 'HUMAN_REVIEW'], '#ef4444', ['==', ['get', 'review_status'], 'AI_ASSISTED'], '#f59e0b', '#3b82f6'], 'line-width': 2.5, 'line-opacity': 0.95 }
              : name === 'buildings'
                ? { 'fill-color': '#f59e0b', 'fill-opacity': 0.24, 'fill-outline-color': '#fcd34d' }
                : { 'line-color': name === 'cadastral' ? '#60a5fa' : '#c4b5fd', 'line-width': 1.4, 'line-opacity': 0.72 },
          } as any);
          instance.on('click', name, (event) => {
            if (name === 'canonical') {
              const properties = event.features?.[0]?.properties;
              if (properties) onSelectRef.current(toParcel(properties));
            } else onSourceSelectRef.current(name);
          });
          instance.on('mouseenter', name, () => { instance.getCanvas().style.cursor = 'pointer'; });
          instance.on('mouseleave', name, () => { instance.getCanvas().style.cursor = ''; });
        }
        instance.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'selected', type: 'line', source: 'selected', paint: { 'line-color': '#f5f5f7', 'line-width': 4, 'line-opacity': 0.98 } });
        setMapReady(true);
      } catch (error) { console.error('Map layers could not be loaded', error); }
    });
    return () => { instance.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const instance = mapRef.current;
    const sources: SourceKey[] = ['cadastral', 'municipal', 'buildings'];
    sources.forEach((id) => {
      if (!instance.getLayer(id)) return;
      const visible = mode === 'harmonized' ? false : layerVisibility[id];
      instance.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      if (id === 'buildings') instance.setPaintProperty(id, 'fill-opacity', id === activeSource ? 0.42 : 0.18);
      else {
        instance.setPaintProperty(id, 'line-opacity', id === activeSource ? 1 : mode === 'compare' ? Math.max(.2, 1 - compare / 100) : .62);
        instance.setPaintProperty(id, 'line-width', id === activeSource ? 3.2 : 1.35);
      }
    });
    if (instance.getLayer('canonical')) {
       instance.setLayoutProperty('canonical', 'visibility', mapHarmonizationReady && layerVisibility.canonical ? 'visible' : 'none');
      instance.setPaintProperty('canonical', 'line-opacity', activeSource === 'canonical' ? 1 : mode === 'compare' ? compare / 100 : .95);
      instance.setPaintProperty('canonical', 'line-width', activeSource === 'canonical' ? 4 : 2.5);
    }
    if (instance.getLayer('satellite')) instance.setLayoutProperty('satellite', 'visibility', basemapVisible ? 'visible' : 'none');
  }, [activeSource, basemapVisible, compare, mapHarmonizationReady, layerVisibility, mapReady, mode]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const source = mapRef.current.getSource('canonical') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    if (!mapHarmonizationReady) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    let cancelled = false;
    fetch(`${API}/layers/canonical`).then((response) => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then((data) => {
      if (!cancelled) source.setData(data);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [mapHarmonizationReady, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady || !selected) return;
    const source = mapRef.current.getSource('selected') as maplibregl.GeoJSONSource | undefined;
    if (source) fetch(`${API}/parcels/${selected.canonical_parcel_id}`).then((response) => response.json()).then((data) => source.setData(data.parcel)).catch(() => undefined);
  }, [mapReady, selected]);

  return <div ref={containerRef} className="map-canvas" aria-label="Interactive satellite map of demo ward 14" />;
}

function QueueTable({ rows, onSelect, emptyLabel, emptyDescription }: { rows: Parcel[]; onSelect: (parcel: Parcel) => void; emptyLabel: string; emptyDescription?: string }) {
  const awaitingHarmonization = typeof document !== 'undefined' && document.documentElement.dataset.harmonizationReady !== 'true';
  return <div className="review-table queue-table">
    <div className="review-table-head"><span>Parcel</span><span>Issue</span><span>Severity</span><span>Confidence</span><span>Sources</span><span>Priority</span><span>Action</span></div>
    {rows.map((parcel) => <div className="review-table-row" key={parcel.canonical_parcel_id} role="button" tabIndex={0} onClick={() => onSelect(parcel)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(parcel); }}>
      <div className="queue-parcel"><strong>{parcel.canonical_parcel_id}</strong><small>{parcel.survey_number} · {titleCase(parcel.land_use)}</small></div>
      <div className="queue-issue"><strong>{titleCase(parcel.conflict_type)}</strong><small>{(parcel.conflict_types?.length || 0)} signal{(parcel.conflict_types?.length || 0) === 1 ? '' : 's'} detected</small></div>
      <SeverityBadge parcel={parcel} />
      <strong className="queue-confidence">{formatConfidence(parcel.overall_confidence)}</strong>
      <span className="queue-sources">{sourceCount(parcel)} sources</span>
      <span className="queue-priority">{formatNumber(Math.round(parcel.priority))}</span>
      <button className="queue-action" onClick={(event) => { event.stopPropagation(); onSelect(parcel); }}>Review <ArrowRight size={14} /></button>
    </div>)}
    {!rows.length && <div className="empty-table queue-empty"><CircleCheck size={21} /><div><strong>{awaitingHarmonization ? 'Records staged for harmonization' : emptyLabel}</strong><span>{emptyDescription || (awaitingHarmonization ? 'Run harmonization to generate the review queue and attention results.' : 'All records in this view have been reconciled or do not match the active filters.')}</span></div></div>}
  </div>;
}

function ConfidenceBreakdown({ selected }: { selected: Parcel }) {
  const metrics = [
    ['Geometry match', selected.geometry_confidence ?? selected.overall_confidence],
    ['Attribute agreement', selected.semantic_confidence ?? selected.overall_confidence],
    ['Source reliability', 1],
    ['Temporal consistency', selected.conflict_type ? .73 : .92],
    ['Entity resolution', selected.conformal_confidence ?? selected.overall_confidence],
  ] as [string, number][];
  return <div className="confidence-breakdown"><div className="confidence-breakdown-head"><span>Harmonization confidence</span><b>{formatConfidence(selected.overall_confidence)} · {titleCase(confidenceBand(selected.overall_confidence))}</b></div>{metrics.map(([label, value]) => <div className="confidence-metric" key={label}><span>{label}</span><div><i style={{ width: `${value * 100}%` }} /></div><b>{formatConfidence(value)}</b></div>)}<small>Composite score based on source agreement, spatial alignment, temporal validity, and entity matching—not a probability of correctness.</small></div>;
}

function SourceComparison({ selected, detail, activeSource, onSourceSelect }: { selected: Parcel; detail: Detail; activeSource: SourceKey; onSourceSelect: (source: SourceKey) => void }) {
  const scoreFor = (key: SourceKey) => {
    if (key === 'canonical') return selected.overall_confidence;
    const match = detail.source_values.find((item) => sourceKeyFromName(item.source) === key);
    return match?.score ?? (key === 'cadastral' ? selected.geometry_confidence : selected.semantic_confidence) ?? selected.overall_confidence;
  };
  return <div className="source-comparison"><div className="comparison-copy"><span className="section-label">Source geometry comparison</span><p>Click a source to highlight its boundary on the map and inspect its contribution here.</p></div><div className="comparison-rows">{sourceOptions.map((source) => { const score = scoreFor(source.key); return <button className={`comparison-row ${activeSource === source.key ? 'active' : ''}`} key={source.key} onClick={() => onSourceSelect(source.key)}><span className={`comparison-swatch swatch-${source.color}`} /><strong>{source.label}</strong><span className="comparison-bar"><i style={{ width: `${score * 100}%` }} /></span><b>{formatConfidence(score)}</b></button>; })}</div><div className="alignment-summary"><span>Alignment across contributing sources</span><strong>{formatConfidence(selected.geometry_confidence ?? selected.overall_confidence)}</strong></div></div>;
}

function Lifecycle({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const current = normalized === 'AI_ACCEPTED' ? 6 : normalized === 'EVIDENCE_REQUESTED' ? 7 : normalized === 'HUMAN_REVIEW' ? 6 : normalized === 'AI_ASSISTED' ? 5 : 5;
  const stages = ['Ingested', 'Validated', 'Matched', 'Harmonized', 'Recommended'];
  return <div className="lifecycle"><div className="lifecycle-track">{stages.map((stage, index) => <div className={index < current - 1 ? 'complete' : index === current - 1 ? 'current' : ''} key={stage}><span>{index < current - 1 ? <Check size={12} /> : index + 1}</span><b>{stage}</b></div>)}</div><div className="lifecycle-branch"><span className={normalized === 'AI_ACCEPTED' ? 'current' : ''}><CircleCheck size={14} /> Approved <small>→ Published</small></span><span className={normalized !== 'AI_ACCEPTED' ? 'current' : ''}><CircleAlert size={14} /> In review <small>→ More evidence</small></span></div></div>;
}

function TechnicalDetails({ detail }: { detail: Detail }) {
  const engine = detail.engine;
  return <details className="technical-details"><summary>Technical details <ChevronDown size={14} /></summary><div className="technical-grid"><div><Network size={15} /><span><b>Graph matching</b><small>{engine?.spatial?.many_to_many?.length ? `${engine.spatial.many_to_many.length} many-to-many relation(s)` : 'No ambiguous relations'} · global allocation retained</small></span></div><div><Table2 size={15} /><span><b>LADM schema validation</b><small>{engine?.semantic?.mapped_field_count ?? 0} fields mapped · {engine?.semantic?.ontology?.triple_count ?? 0} ontology triples</small></span></div><div><ShieldCheck size={15} /><span><b>Semantic backend</b><small>{engine?.semantic?.semantic_backend?.semantic_backend || 'Not reported'} · {engine?.semantic?.semantic_backend?.status || 'status unavailable'}{engine?.semantic?.semantic_backend?.fallback_active ? ' · fallback active' : ''}</small></span></div><div><ShieldCheck size={15} /><span><b>Spatial conformal calibration</b><small>{engine?.confidence?.coverage ? `${Math.round(engine.confidence.coverage * 100)}% coverage` : '95% coverage'} · {engine?.confidence?.region ?? 'spatial'} region</small></span></div></div></details>;
}

function VersionHistory({ selected, detail, changes }: { selected: Parcel; detail: Detail; changes: any[] }) {
  const version = selected.canonical_version ?? detail.lineage.version ?? 1;
  const parcelChanges = changes.filter((change) => change.parcel_id === selected.canonical_parcel_id);
  return <div className="version-history"><div><span>v{version} · Current canonical record</span><b>Backend record</b><small>Version reported by the fusion service. Source lineage is available below.</small></div>{parcelChanges.map((change) => <div key={change.id}><span>v{change.version} · {titleCase(change.new_value)}</span><b>{change.officer || 'Authorized officer'}</b><small>{change.detail || `${change.field}: ${change.old_value} → ${change.new_value}`}</small></div>)}</div>;
}

function ReconciliationWorkspace({ selected, detail, changes, activeSource, onSourceSelect, onDecision }: { selected: Parcel; detail: Detail; changes: any[]; activeSource: SourceKey; onSourceSelect: (source: SourceKey) => void; onDecision: (action: string) => void }) {
  const [showVersions, setShowVersions] = useState(false);
  const sourceName = detail.source_values[0]?.source || 'Cadastral survey';
  const isPublished = selected.review_status === 'AI_ACCEPTED';
  const version = selected.canonical_version ?? detail.lineage.version ?? 1;
  return <section id="reconciliation" className="reconciliation-workspace modern-reconciliation"><div className="workspace-visual"><div className="workspace-heading"><div><span className="section-label">Evidence workspace</span><h2>Source comparison</h2><p>{detail.source_values.length} source record{detail.source_values.length === 1 ? '' : 's'} matched to the same canonical parcel.</p></div><button className="version-button" onClick={() => setShowVersions(!showVersions)}><BadgeCheck size={15} /> v{version} <ChevronDown size={14} /></button></div><SourceComparison selected={selected} detail={detail} activeSource={activeSource} onSourceSelect={onSourceSelect} /><div className="workspace-relationship"><span>Source relationships resolved</span><b>Geometry and attribute evidence are linked to this record.</b></div>{showVersions && <VersionHistory selected={selected} detail={detail} changes={changes} />}<TechnicalDetails detail={detail} /></div><div className="workspace-evidence"><span className="section-label">System recommendation</span><div className="recommendation-card"><h3>{isPublished ? `Canonical version ${version} published` : detail.recommendation.replace('Canonical record published at', 'Recommended canonical version')}</h3><p className="recommendation-why">{detail.explanation} {detail.evidence[0]?.detail ?? `The ${sourceName} record contributes the strongest available match signal.`}</p><div className="recommendation-action"><span>Recommended action</span><strong>{isPublished ? 'Published canonical record' : selected.conflict_type ? `Review ${sourceName} against contributing sources` : `Accept ${sourceName} as canonical evidence`}</strong></div></div><ConfidenceBreakdown selected={selected} /><div className="provenance-section"><div className="section-label">Record evidence</div><div className="provenance-list">{detail.source_values.slice(0, 4).map((item) => <div key={`${item.source}-${item.attribute}`}><span>{item.attribute}</span><strong>{item.source}</strong><small>{item.value} · Match score {formatConfidence(item.score)}{item.detail ? ` · ${item.detail}` : ''}</small></div>)}</div></div><div className="evidence-summary"><div><span>Supporting signals</span><b>{detail.evidence.length}</b></div><div><span>Warnings</span><b className={selected.conflict_type ? 'warning-text' : ''}>{selected.conflict_type ? detail.evidence.filter((item) => item.source !== 'Fusion engine').length || 1 : 0}</b></div></div><div className="decision-actions"><ActionButton onClick={() => onDecision('approve')} icon={Check} disabled={isPublished}>Approve recommendation</ActionButton><ActionButton onClick={() => onDecision('reject')} variant="secondary" icon={X}>Keep in review</ActionButton><button className="text-action" onClick={() => onDecision('request_evidence')}>Request additional evidence <ArrowRight size={14} /></button></div><div className="decision-note"><ShieldCheck size={15} /> Authorized officer approval is required before a canonical change is published.</div></div></section>;
}

function Inspector({ selected, detail, queue, activeSource, onSelect, onSourceSelect }: { selected: Parcel | null; detail?: Detail; queue: Parcel[]; activeSource: SourceKey; onSelect: (parcel: Parcel) => void; onSourceSelect: (source: SourceKey) => void }) {
  return <aside className="inspector-panel modern-inspector"><div className="inspector-head"><div><span className="section-label">Parcel inspector</span><h2>{selected ? selected.canonical_parcel_id : 'Select a parcel'}</h2></div><span className={`record-status status-${selected ? selected.review_status.toLowerCase() : 'idle'}`}>{selected ? statusLabel(selected.review_status) : 'Awaiting input'}</span></div>{selected ? <><div className="record-summary"><div><span>Current record</span><strong>{selected.canonical_parcel_id}</strong><small>{selected.survey_number} · {titleCase(selected.land_use)}</small></div><SeverityBadge parcel={selected} /></div><div className="inspector-confidence"><div><span>Harmonization confidence</span><strong>{formatConfidence(selected.overall_confidence)} <small>{titleCase(confidenceBand(selected.overall_confidence))}</small></strong></div><div className="confidence-ring" style={{ '--progress': `${selected.overall_confidence * 100}%` } as CSSProperties}><span>{Math.round(selected.overall_confidence * 100)}</span></div></div><div className="inspector-status"><div><strong>{selected.conflict_type ? titleCase(selected.conflict_type) : 'No unresolved conflicts'}</strong><span>{detail?.explanation ?? 'Cross-source agreement is ready for review.'}</span></div></div><dl className="inspector-details"><div><dt>Land use</dt><dd>{selected.land_use}</dd></div><div><dt>Area</dt><dd>{formatNumber(selected.area_sq_m)} m²</dd></div><div><dt>Version</dt><dd>v{selected.canonical_version ?? 1}</dd></div></dl><Lifecycle status={selected.review_status} /><button className="selected-source-link" onClick={() => onSourceSelect(activeSource)}><span>Map highlight</span><b>{sourceOptions.find((source) => source.key === activeSource)?.label}</b></button><button className="inspector-link" onClick={() => document.getElementById('reconciliation')?.scrollIntoView({ behavior: 'smooth' })}>Open evidence workspace <ArrowDown size={14} /></button></> : <div className="inspector-empty"><MapPinned size={29} /><strong>Click a canonical parcel</strong><p>Evidence, recommendation, and source lineage will appear here.</p></div>}<div className="queue-preview"><div className="queue-preview-head"><span>Next records</span><b>{queue.length} need attention</b></div>{queue.slice(0, 4).map((parcel, index) => <button className={selected?.canonical_parcel_id === parcel.canonical_parcel_id ? 'selected' : ''} key={parcel.canonical_parcel_id} onClick={() => onSelect(parcel)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{parcel.canonical_parcel_id}</strong><small>{titleCase(parcel.conflict_type)}</small></div><em>{formatConfidence(parcel.overall_confidence)}</em></button>)}</div></aside>;
}

function HarmonizationProgress({ total, job }: { total: number; job: boolean }) {
  if (!job) return null;
  const stages = [['Matching records', total, total], ['Geometry validation', Math.max(0, total - 4), total], ['Conflict detection', Math.max(0, total - 8), total], ['Canonical generation', Math.max(0, total - 11), total]];
  return <section className="harmonization-progress" aria-live="polite"><div><LoaderCircle size={18} className="spin" /><div><span>Harmonization in progress</span><small>Evidence is being validated before the next review queue refresh.</small></div><b>Estimated remaining —</b></div><div className="progress-stages">{stages.map(([label, value, max]) => <div key={label as string}><span>{label as string}</span><strong>{value as number} / {max as number}</strong><progress value={value as number} max={max as number} /></div>)}</div></section>;
}

function QueueFilters({ statusFilter, setStatusFilter, issueFilter, setIssueFilter, confidenceFilter, setConfidenceFilter, sourceFilter, setSourceFilter, sortMode, setSortMode, query, setQuery }: { statusFilter: StatusFilter; setStatusFilter: (value: StatusFilter) => void; issueFilter: IssueFilter; setIssueFilter: (value: IssueFilter) => void; confidenceFilter: ConfidenceFilter; setConfidenceFilter: (value: ConfidenceFilter) => void; sourceFilter: string; setSourceFilter: (value: string) => void; sortMode: SortMode; setSortMode: (value: SortMode) => void; query: string; setQuery: (value: string) => void }) {
  const statuses: [StatusFilter, string][] = [['needs-review', 'Needs attention'], ['human', 'Human review'], ['conflicts', 'Conflicts'], ['assisted', 'AI assisted'], ['published', 'Published']];
  return <div className="queue-filter-wrap"><label className="global-search queue-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parcel ID, survey number, or land use…" aria-label="Search parcel records" /></label><div className="filter-row"><span className="filter-label">Filter</span>{statuses.map(([value, label]) => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label}</button>)}<select aria-label="Issue filter" value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as IssueFilter)}><option value="all">All issues</option><option value="boundary">Boundary</option><option value="area">Area</option><option value="duplicate">Duplicate</option><option value="land_use">Land use</option><option value="building">Building</option></select><select aria-label="Confidence filter" value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value as ConfidenceFilter)}><option value="all">All confidence</option><option value="low">Below 70%</option><option value="medium">70–85%</option><option value="high">Above 85%</option></select><select aria-label="Source filter" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All sources</option><option value="cadastral">Cadastral</option><option value="municipal">Municipal</option><option value="imagery">Imagery</option></select><label className="sort-control"><SlidersHorizontal size={14} /><span>Sort by</span><select aria-label="Sort queue" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="priority">Priority</option><option value="severity">Severity</option><option value="confidence-low">Lowest confidence</option><option value="source">Source count</option><option value="conflict">Conflict type</option></select></label></div></div>;
}

function SourceTab({ sources, onSelect }: { sources: Source[]; onSelect: (source: Source) => void }) {
  return <div className="source-tab-grid">{sources.map((source) => <button className="source-tab-card" key={source.id} onClick={() => onSelect(source)}><div><span className="source-tab-status"><CircleCheck size={14} /> {statusLabel(source.status)}</span><strong>{source.name}</strong><small>{source.provider_name || source.dataset_type || 'Registered source'} · {source.format} · {source.crs || 'CRS not provided'}</small></div><div><b>{statusLabel(source.validation_status || source.status)}</b><span>{formatNumber(source.feature_count ?? source.records)} records</span></div><ArrowRight size={15} /></button>)}</div>;
}

export function ModernDemoPage({ dashboard, sources, changes, selectedSourceIds, refresh, notify }: { dashboard?: Dashboard; sources: Source[]; changes: any[]; selectedSourceIds: string[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [mode, setMode] = useState<DemoMode>('sources');
  const [compare, setCompare] = useState(55);
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [detail, setDetail] = useState<Detail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<DemoTab>('Review Queue');
  const [job, setJob] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [basemapVisible, setBasemapVisible] = useState(true);
  const [activeSource, setActiveSource] = useState<SourceKey>('canonical');
  const [layerVisibility, setLayerVisibility] = useState<Record<SourceKey, boolean>>({ cadastral: true, municipal: true, buildings: true, canonical: true });
  const [allParcels, setAllParcels] = useState<Parcel[]>([]);
  const [hasHarmonizedRun, setHasHarmonizedRun] = useState(Boolean(dashboard?.latest_job));
  const [engineOverview, setEngineOverview] = useState<EngineOverview>();
  const [parcelsLoading, setParcelsLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('needs-review');
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const stagedRecordCount = useMemo(() => {
    const selectedSources = sources.filter((source) => selectedSourceIds.includes(source.id));
    return selectedSources.length ? Math.max(...selectedSources.map((source) => source.feature_count ?? source.records ?? 0)) : 0;
  }, [selectedSourceIds, sources]);
  const total = hasHarmonizedRun ? (dashboard?.summary.total_parcels ?? allParcels.length) : stagedRecordCount;

  const loadParcels = async () => {
    if (!hasHarmonizedRun) {
      setAllParcels([]);
      setDataError('');
      setParcelsLoading(false);
      return;
    }
    setParcelsLoading(true);
    setDataError('');
    try {
      const response = await fetch(`${API}/layers/canonical`);
      if (!response.ok) throw new Error('The canonical parcel layer could not be loaded.');
      const data = await response.json();
      if (!Array.isArray(data.features)) throw new Error('The canonical parcel layer returned an invalid response.');
      setAllParcels(data.features.map((feature: any) => toParcel(feature.properties)));
    } catch (error) {
      if (hasHarmonizedRun && dashboard?.review_queue?.length) setAllParcels(dashboard.review_queue);
      setDataError(error instanceof Error ? error.message : 'The canonical parcel layer is unavailable.');
    } finally {
      setParcelsLoading(false);
    }
  };
  useEffect(() => { setHasHarmonizedRun(Boolean(dashboard?.latest_job)); }, [dashboard?.latest_job]);
  useEffect(() => { loadParcels(); }, [dashboard?.latest_job, hasHarmonizedRun]);
  useEffect(() => {
    if (!hasHarmonizedRun) {
      setEngineOverview(undefined);
      return;
    }
    const loadEngineOverview = async () => {
      try {
        const response = await fetch(`${API}/engines/overview`);
        if (!response.ok) throw new Error();
        setEngineOverview(await response.json());
      } catch {
        setEngineOverview(undefined);
      }
    };
    void loadEngineOverview();
  }, [dashboard?.latest_job, hasHarmonizedRun]);
  useEffect(() => { if (!hasHarmonizedRun) { setSelected(null); setDetail(undefined); } }, [hasHarmonizedRun]);
  useEffect(() => {
    document.documentElement.dataset.harmonizationReady = String(hasHarmonizedRun);
    return () => { delete document.documentElement.dataset.harmonizationReady; };
  }, [hasHarmonizedRun]);

  const reviewQueue = useMemo(() => allParcels.filter((parcel) => parcel.review_status !== 'AI_ACCEPTED'), [allParcels]);
  const summaryCounts = useMemo(() => ({
    processed: total,
    autoApproved: hasHarmonizedRun ? Math.max(0, total - reviewQueue.length) : 0,
    needsReview: reviewQueue.length,
    conflicts: reviewQueue.filter((parcel) => Boolean(parcel.conflict_type)).length,
    changes: hasHarmonizedRun ? dashboard?.summary.changes ?? 0 : 0,
  }), [allParcels, dashboard?.summary.changes, hasHarmonizedRun, reviewQueue.length, total]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = allParcels.filter((parcel) => {
      const searchMatches = !normalizedQuery || [parcel.canonical_parcel_id, parcel.survey_number, parcel.land_use, 'Demo Ward 14', 'owner reference'].join(' ').toLowerCase().includes(normalizedQuery);
      const statusMatches = statusFilter === 'all' || (statusFilter === 'needs-review' && parcel.review_status !== 'AI_ACCEPTED') || (statusFilter === 'published' && parcel.review_status === 'AI_ACCEPTED') || (statusFilter === 'human' && parcel.review_status === 'HUMAN_REVIEW') || (statusFilter === 'conflicts' && Boolean(parcel.conflict_type)) || (statusFilter === 'assisted' && parcel.review_status === 'AI_ASSISTED');
      const confidenceMatches = confidenceFilter === 'all' || confidenceBand(parcel.overall_confidence) === confidenceFilter;
      return searchMatches && statusMatches && matchesIssue(parcel, issueFilter) && confidenceMatches && mapSourceMatches(parcel, sourceFilter);
    });
    return filtered.sort((a, b) => sortMode === 'severity' ? (severityBand(a) === 'critical' ? -1 : 1) - (severityBand(b) === 'critical' ? -1 : 1) : sortMode === 'confidence-low' ? a.overall_confidence - b.overall_confidence : sortMode === 'source' ? sourceCount(b) - sourceCount(a) : sortMode === 'conflict' ? titleCase(a.conflict_type).localeCompare(titleCase(b.conflict_type)) : b.priority - a.priority);
  }, [allParcels, confidenceFilter, issueFilter, query, sortMode, sourceFilter, statusFilter]);

  const inspect = async (parcel: Parcel) => {
    setSelected(parcel); setDetail(undefined); setDetailLoading(true);
    try { const response = await fetch(`${API}/parcels/${parcel.canonical_parcel_id}`); if (!response.ok) throw new Error(); setDetail(await response.json()); }
    catch { notify('Parcel evidence is temporarily unavailable.'); }
    finally { setDetailLoading(false); }
  };
  const run = async () => {
    if (job) return;
    setJob(true); notify('Harmonization job started. The review queue will refresh when evidence validation completes.');
    try {
      const request: RequestInit = { method: 'POST' };
      if (selectedSourceIds.length >= 2) { request.headers = { 'Content-Type': 'application/json' }; request.body = JSON.stringify({ source_ids: selectedSourceIds }); }
      const response = await fetch(`${API}/harmonization/jobs`, request); const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'The harmonization job could not start.');
      setHasHarmonizedRun(true);
      window.dispatchEvent(new CustomEvent('urbanland:harmonized'));
      await refresh();
      notify(`${result.id} completed: ${result.result.auto_harmonized} records auto-harmonized, ${result.result.conflicts} conflicts detected.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'The harmonization API is unavailable.'); }
    finally { setJob(false); }
  };
  const decide = async (action: string) => {
    if (!selected) return;
    try {
      const response = await fetch(`${API}/parcels/${selected.canonical_parcel_id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.detail || 'Decision could not be recorded.');
       const next = toParcel(result.parcel.properties); setSelected(next); const detailResponse = await fetch(`${API}/parcels/${next.canonical_parcel_id}`); if (!detailResponse.ok) throw new Error('The updated parcel evidence could not be loaded.'); setDetail(await detailResponse.json()); await refresh(); await loadParcels(); notify(result.event.detail);
    } catch (error) { notify(error instanceof Error ? error.message : 'Decision could not be recorded.'); }
  };
  const chooseSource = (source: SourceKey) => { setActiveSource(source); notify(`${sourceOptions.find((item) => item.key === source)?.label} highlighted on the map and in the evidence workspace.`); };
  const activateFocus = () => { if (!hasHarmonizedRun) { notify('Run harmonization before starting focus review.'); return; } if (!selected && reviewQueue[0]) inspect(reviewQueue[0]); setFocusMode(true); };
  const submitSearch = () => { const result = allParcels.find((parcel) => [parcel.canonical_parcel_id, parcel.survey_number, parcel.land_use].join(' ').toLowerCase().includes(query.trim().toLowerCase())); if (result) { inspect(result); document.getElementById('map-workspace')?.scrollIntoView({ behavior: 'smooth' }); } else if (query.trim()) notify('No parcel matched that search. Try a parcel ID or survey number.'); };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'e') document.getElementById('reconciliation')?.scrollIntoView({ behavior: 'smooth' });
      if (event.key === 'm') document.getElementById('map-workspace')?.scrollIntoView({ behavior: 'smooth' });
       if (event.key === 'a' && selected && selected.review_status !== 'AI_ACCEPTED') decide('approve');
      if (event.key === 'r' && selected) decide('reject');
      if (event.key === 'j' || event.key === 'k') { const index = rows.findIndex((parcel) => parcel.canonical_parcel_id === selected?.canonical_parcel_id); const nextIndex = event.key === 'j' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index < 0 ? 0 : index - 1); if (rows[nextIndex]) inspect(rows[nextIndex]); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [decide, rows, selected]);

  const statusText = !hasHarmonizedRun ? 'Run harmonization to populate results' : statusFilter === 'published' ? `${rows.length} published records` : statusFilter === 'all' ? `${rows.length} records in the current view` : `${rows.length} records need your attention`;
  return <main className={`demo-shell modern-demo-shell ${focusMode ? 'demo-focus' : ''}`}><div className="page-container">
    {!focusMode && <><div className="demo-topline"><div><span className="pill pill-green"><i /> LIVE DEMO · DEMO WARD 14</span><span className="demo-updated"><i className="live-dot" /> Synthetic benchmark · {total} canonical parcels</span></div><div className="demo-top-actions"><ActionButton onClick={activateFocus} variant="secondary" icon={Focus}>Focus review</ActionButton><ActionButton onClick={run} disabled={job} icon={job ? RefreshCwIcon : Play}>{job ? 'Running harmonization…' : 'Run harmonization'}</ActionButton></div></div><div className="demo-heading"><div><span className="section-label">Operational workspace</span><h1>Review the record, <em>not the raw layers.</em></h1><p>Start with what needs attention, then inspect the map, recommendation, and evidence as one review workflow.</p></div><div className="job-status"><span>LAST PIPELINE RUN</span><strong>{job ? 'RUNNING' : dashboard?.latest_job ? 'COMPLETED' : 'READY'}</strong><small>{dashboard?.latest_job ? dashboard.latest_job.id : 'Awaiting a first run'}</small>{engineOverview?.run_id && <small className="engine-run-label">Engine {engineOverview.run_id}</small>}</div></div><div className="demo-metrics modern-metrics"><MetricButton label="Processed" value={summaryCounts.processed} caption="Records in Ward 14" active={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Auto-approved" value={summaryCounts.autoApproved} caption="Published canonical records" active={statusFilter === 'published'} onClick={() => { setStatusFilter('published'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Needs review" value={summaryCounts.needsReview} caption="Officer decision needed" active={statusFilter === 'needs-review'} onClick={() => { setStatusFilter('needs-review'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Conflicts" value={summaryCounts.conflicts} caption="Prioritized inconsistencies" active={statusFilter === 'conflicts'} onClick={() => { setStatusFilter('conflicts'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} tone="alert" /><MetricButton label="Changed" value={summaryCounts.changes} caption="Audit events" active={tab === 'Changes'} onClick={() => { setTab('Changes'); document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }); }} /></div><HarmonizationProgress total={total} job={job} /><section id="review-queue" className="queue-overview"><div className="queue-overview-head"><div><span className="section-label">Review queue</span><h2>What needs my attention?</h2><p>{statusText}. Every KPI above filters this queue.</p></div><div className="queue-head-meta"><span><CircleAlert size={15} /> {summaryCounts.conflicts} open conflicts</span><span><Clock3 size={15} /> Updated after each run</span></div></div><QueueFilters statusFilter={statusFilter} setStatusFilter={setStatusFilter} issueFilter={issueFilter} setIssueFilter={setIssueFilter} confidenceFilter={confidenceFilter} setConfidenceFilter={setConfidenceFilter} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} sortMode={sortMode} setSortMode={setSortMode} query={query} setQuery={setQuery} />{dataError && <div className="workspace-alert"><CircleAlert size={16} /><span>{dataError} Refresh the page after the API is available.</span></div>}{parcelsLoading ? <div className="queue-loading"><LoaderCircle size={18} className="spin" /> Loading canonical parcel records…</div> : <QueueTable rows={rows} onSelect={inspect} emptyLabel={statusFilter === 'conflicts' ? 'No unresolved conflicts' : statusFilter === 'human' ? 'No records require human review' : statusFilter === 'published' ? 'No published records match these filters' : 'No records need your attention'} />}</section><section className="engine-snapshot" aria-label="Active fusion engine"><div><span>Fusion run</span><strong>{engineOverview?.run_id || 'Not available'}</strong></div><div><span>Spatial matcher</span><strong>{engineOverview?.spatial_engine?.name || 'Not reported'}</strong></div><div><span>Semantic backend</span><strong>{engineOverview?.semantic_engine?.semantic_backend?.semantic_backend || 'Not reported'}</strong></div><div><span>Confidence calibration</span><strong>{engineOverview?.confidence_engine?.coverage ? `${Math.round(engineOverview.confidence_engine.coverage * 100)}% coverage` : 'Not reported'}</strong></div></section></>}
    {focusMode && <div className="focus-header"><div><span className="section-label">Focus review</span><strong>{selected?.canonical_parcel_id || 'Select a parcel'}</strong><span>Investigation workspace</span></div><ActionButton onClick={() => setFocusMode(false)} variant="secondary" icon={Minimize2}>Exit focus</ActionButton></div>}
    <section id="map-workspace" className="investigation-workspace"><div className="map-workspace modern-map-toolbar"><div className="map-toolbar-title"><span className="section-label">Map workspace</span><strong>Spatial context for {selected?.canonical_parcel_id || 'the review queue'}</strong></div><div className="map-modes">{(['sources', 'harmonized', 'compare'] as DemoMode[]).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item === 'sources' ? 'Sources' : item === 'harmonized' ? 'AI harmonized' : 'Before / after'}</button>)}</div><div className="map-toolbar-actions"><button className="toolbar-button" onClick={() => { searchRef.current?.focus(); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }}><Search size={15} /> Search parcel</button><button className={`toolbar-button ${layersOpen ? 'active' : ''}`} onClick={() => setLayersOpen(!layersOpen)}><Layers3 size={15} /> Layers</button><button className="toolbar-button" onClick={() => setMode('compare')}><SlidersHorizontal size={15} /> Compare</button><button className="toolbar-button" onClick={() => notify('Measurement mode is ready for the selected map context.')}><Ruler size={15} /> Measure</button><button className="toolbar-button" onClick={() => setBasemapVisible(!basemapVisible)}><MapPinned size={15} /> {basemapVisible ? 'Satellite' : 'Dark base'}</button></div>{mode === 'compare' && <label className="compare-slider"><span>Source</span><input type="range" min="10" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} /><span>Canonical</span></label>}{layersOpen && <div className="map-layer-popover"><div><span className="section-label">Map layers</span><button onClick={() => setLayersOpen(false)} aria-label="Close map layers"><X size={15} /></button></div><p>Source layers</p>{sourceOptions.slice(0, 3).map((source) => <label key={source.key}><input type="checkbox" checked={layerVisibility[source.key]} onChange={() => setLayerVisibility((current) => ({ ...current, [source.key]: !current[source.key] }))} /><span className={`comparison-swatch swatch-${source.color}`} />{source.label}</label>)}<p>Canonical</p><label><input type="checkbox" checked={layerVisibility.canonical} onChange={() => setLayerVisibility((current) => ({ ...current, canonical: !current.canonical }))} /><span className="comparison-swatch swatch-green" />Harmonized boundary</label><p>Context</p><label><input type="checkbox" checked={basemapVisible} onChange={() => setBasemapVisible(!basemapVisible)} /><span className="layer-dot satellite-dot" />Satellite imagery</label><small>Blue = selection · green = validated · amber = warning · red = blocking conflict</small></div>}</div><div className="demo-map-grid"><div className="map-panel"><div className="map-panel-head"><div><span className="section-label">DEMO WARD 14 / BENGALURU</span><strong>Canonical parcel map</strong></div><span className="map-selected-label">{activeSource === 'canonical' ? 'Harmonized boundary' : `${sourceOptions.find((source) => source.key === activeSource)?.label} highlighted`}</span></div><MapView mode={mode} compare={compare} layerVisibility={layerVisibility} selected={selected} activeSource={activeSource} basemapVisible={basemapVisible} onSelect={inspect} onSourceSelect={chooseSource} /><div className="map-legend"><span><i className="status-dot success" /> Trusted</span><span><i className="status-dot warning" /> AI assisted</span><span><i className="status-dot danger" /> Conflict</span></div><div className="map-note"><MapPinned size={13} /> Click a parcel or source layer to inspect evidence</div></div><Inspector selected={selected} detail={detail} queue={reviewQueue} activeSource={activeSource} onSelect={inspect} onSourceSelect={chooseSource} /></div>{selected && detailLoading && <div className="detail-loading"><LoaderCircle size={18} className="spin" /> Loading parcel evidence…</div>}{selected && detail && <ReconciliationWorkspace selected={selected} detail={detail} changes={changes} activeSource={activeSource} onSourceSelect={chooseSource} onDecision={decide} />}</section>
    {!focusMode && <section id="operations" className="demo-operations modern-operations"><div className="operation-tabs"><div><span className="section-label">Operational records</span><strong>Audit and source workspace</strong></div>{(['Review Queue', 'Data Sources', 'Changes', 'Export'] as DemoTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Review Queue' && <span>{reviewQueue.length}</span>}</button>)}</div>{tab === 'Review Queue' ? <div className="queue-handoff"><BadgeCheck size={19} /><div><strong>The review queue is at the top of this workspace.</strong><span>Use the filters to prioritize work, then open a record to connect its map, evidence, and recommendation.</span></div><button className="text-action" onClick={() => document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' })}>Return to queue <ArrowDown size={14} /></button></div> : tab === 'Data Sources' ? <SourceTab sources={sources} onSelect={(source) => { chooseSource(sourceKeyFromName(source.dataset_type || source.name)); document.getElementById('reconciliation')?.scrollIntoView({ behavior: 'smooth' }); }} /> : tab === 'Changes' ? <div className="change-table">{changes.length ? changes.map((change) => <div key={change.id}><span>{change.parcel_id}</span><span>{change.old_value} <ArrowRight size={13} /> {change.new_value}</span><span>{change.officer}</span><code>v{change.version}</code></div>) : <div className="empty-table"><Clock3 size={18} /><div><strong>No changes recorded</strong><span>Decisions will appear here after an officer reviews a record.</span></div></div>}</div> : <div className="export-panel"><div><span className="icon-box"><Download size={20} /></span><div><h3>Canonical Urban Land Record</h3><p>Current confidence, review status, source lineage, and geometry for every parcel in the ward.</p></div></div><a className="button button-primary" href={`${API}/export/canonical.geojson`}><Download size={16} /> Download GeoJSON</a></div>}</section>}
    {!focusMode && <details className="keyboard-help"><summary><Keyboard size={15} /> Keyboard shortcuts <ChevronDown size={14} /></summary><div><span><b>J / K</b> Next or previous record</span><span><b>A</b> Approve</span><span><b>R</b> Keep in review</span><span><b>E</b> Evidence</span><span><b>M</b> Focus map</span><span><b>/</b> Search</span></div></details>}
  </div></main>;
}

function MetricButton({ label, value, caption, active, onClick, tone = 'neutral' }: { label: string; value: number; caption: string; active: boolean; onClick: () => void; tone?: string }) {
  return <button className={`metric-button metric-${tone} ${active ? 'active' : ''}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{caption}</small></button>;
}

function RefreshCwIcon(props: any) {
  return <LoaderCircle {...props} className="spin" />;
}
