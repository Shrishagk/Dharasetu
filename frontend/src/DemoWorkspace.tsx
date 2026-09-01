import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  Database,
  Download,
  FileCheck2,
  Focus,
  Globe2,
  HardDrive,
  Info,
  Keyboard,
  KeyRound,
  Layers3,
  LoaderCircle,
  MapPinned,
  Minimize2,
  Network,
  Play,
  Ruler,
  RefreshCw,
  ScanLine,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  UploadCloud,
  UsersRound,
  Workflow,
  Zap,
  X,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import { FusionLabs } from './FusionLabs';

const API = '/api/v1';
type DemoMode = 'sources' | 'harmonized' | 'compare';
type DemoTab = 'Review Queue' | 'Data Sources' | 'Changes' | 'Export';
type ControlTab = 'Inputs' | 'Processing' | 'Governance';
type SourceKey = 'cadastral' | 'municipal' | 'buildings' | 'gnss' | 'ground_truth' | 'canonical';
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
  attributes?: { provenance?: any; confidence?: number };
  topology?: { issue_count?: number; issues?: any[] };
  changes?: any[];
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
  { key: 'gnss', label: 'GNSS / CORS', color: 'cyan' },
  { key: 'ground_truth', label: 'Ground truth', color: 'rose' },
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
  return <button type="button" className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{children}{Icon && <Icon size={16} strokeWidth={1.7} aria-hidden="true" />}</button>;
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
  if (normalized.includes('gnss') || normalized.includes('cors')) return 'gnss' as SourceKey;
  if (normalized.includes('ground')) return 'ground_truth' as SourceKey;
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
  if (filter === 'gnss') return sources.includes('gnss') || sources.includes('cors') || sources.includes('survey');
  if (filter === 'utility') return sources.includes('utility') || sources.includes('water');
  if (filter === 'revenue') return sources.includes('revenue') || sources.includes('khata');
  return sources.includes(filter);
}

function matchesIssue(parcel: Parcel, issue: IssueFilter) {
  if (issue === 'all') return true;
  const text = [...(parcel.conflict_types ?? []), parcel.conflict_type ?? ''].join(' ').toLowerCase();
  return text.includes(issue === 'land_use' ? 'land' : issue);
}

function MapView({ mode, compare, layerVisibility, selected, activeSource, basemapVisible, harmonizationReady, measureActive, onSelect, onSourceSelect, onMeasure }: { mode: DemoMode; compare: number; layerVisibility: Record<SourceKey, boolean>; selected: Parcel | null; activeSource: SourceKey; basemapVisible: boolean; harmonizationReady: boolean; measureActive: boolean; onSelect: (parcel: Parcel) => void; onSourceSelect: (source: SourceKey) => void; onMeasure: (metres: number | null) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSourceSelectRef = useRef(onSourceSelect);
  const measurePointsRef = useRef<[number, number][]>([]);
  const [mapReady, setMapReady] = useState(false);
  const mapHarmonizationReady = harmonizationReady;
  const [mapError, setMapError] = useState('');
  useEffect(() => { onSelectRef.current = onSelect; onSourceSelectRef.current = onSourceSelect; }, [onSelect, onSourceSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new maplibregl.Map({
      container: containerRef.current,
      center: [77.597, 12.971],
      zoom: 15.6,
      pitch: 38,
      bearing: -14,
      attributionControl: false,
      style: { version: 8, sources: { satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } }, layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }] } as any,
    });
    mapRef.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', async () => {
      try {
        setMapError('');
        const vectorLayers: { name: SourceKey; paint: any; type: 'line' | 'fill-extrusion' | 'circle' }[] = [
          { name: 'canonical', type: 'line', paint: { 'line-color': ['case', ['==', ['get', 'review_status'], 'HUMAN_REVIEW'], '#ef4444', ['==', ['get', 'review_status'], 'AI_ASSISTED'], '#f59e0b', '#3b82f6'], 'line-width': 2.5, 'line-opacity': 0.95 } },
          { name: 'cadastral', type: 'line', paint: { 'line-color': '#60a5fa', 'line-width': 1.4, 'line-opacity': 0.72 } },
          { name: 'municipal', type: 'line', paint: { 'line-color': '#c4b5fd', 'line-width': 1.4, 'line-opacity': 0.72 } },
          { name: 'buildings', type: 'fill-extrusion', paint: { 'fill-extrusion-color': '#f59e0b', 'fill-extrusion-height': ['coalesce', ['get', 'height_m'], ['get', 'height'], 8], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.48, 'fill-extrusion-vertical-gradient': true } },
          { name: 'ground_truth', type: 'line', paint: { 'line-color': '#fb7185', 'line-width': 1.2, 'line-dasharray': [2, 1], 'line-opacity': 0.7 } },
          { name: 'gnss', type: 'circle', paint: { 'circle-color': '#22d3ee', 'circle-radius': 5, 'circle-stroke-color': '#ecfeff', 'circle-stroke-width': 1.2, 'circle-opacity': 0.92 } },
        ];
        for (const layer of vectorLayers) {
          const data = layer.name === 'canonical' ? { type: 'FeatureCollection', features: [] } : await fetch(`${API}/layers/${layer.name}`).then((response) => response.ok ? response.json() : { type: 'FeatureCollection', features: [] });
          instance.addSource(layer.name, { type: 'geojson', data });
          instance.addLayer({ id: layer.name, type: layer.type, source: layer.name, paint: layer.paint } as any);
          instance.on('click', layer.name, (event) => {
            if (layer.name === 'canonical') {
              const properties = event.features?.[0]?.properties;
              if (properties) onSelectRef.current(toParcel(properties));
            } else onSourceSelectRef.current(layer.name);
          });
          instance.on('mouseenter', layer.name, () => { instance.getCanvas().style.cursor = 'pointer'; });
          instance.on('mouseleave', layer.name, () => { instance.getCanvas().style.cursor = ''; });
        }
        instance.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'selected', type: 'line', source: 'selected', paint: { 'line-color': '#f5f5f7', 'line-width': 4, 'line-opacity': 0.98 } });
        instance.addSource('measure', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'measure-line', type: 'line', source: 'measure', paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-dasharray': [1.4, 1.2] } });
        instance.addLayer({ id: 'measure-points', type: 'circle', source: 'measure', paint: { 'circle-color': '#fbbf24', 'circle-radius': 4 } });
        setMapReady(true);
      } catch { setMapError('Map layers are temporarily unavailable. The review queue remains available above.'); }
    });
    return () => { instance.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const instance = mapRef.current;
    const sources: SourceKey[] = ['cadastral', 'municipal', 'buildings', 'gnss', 'ground_truth'];
    sources.forEach((id) => {
      if (!instance.getLayer(id)) return;
      const visible = mode === 'harmonized' ? false : layerVisibility[id];
      instance.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      if (id === 'buildings') instance.setPaintProperty(id, 'fill-extrusion-opacity', id === activeSource ? 0.82 : 0.38);
      else if (id === 'gnss') instance.setPaintProperty(id, 'circle-opacity', id === activeSource ? 1 : 0.72);
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

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !mapReady) return;
    const haversine = (from: [number, number], to: [number, number]) => {
      const toRad = (value: number) => value * Math.PI / 180;
      const dLat = toRad(to[1] - from[1]);
      const dLng = toRad(to[0] - from[0]);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLng / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (!measureActive) return;
      const point: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      const points = [...measurePointsRef.current, point].slice(-2);
      measurePointsRef.current = points;
      const features: any[] = points.map((coordinate) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: coordinate }, properties: {} }));
      if (points.length === 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: {} });
      (instance.getSource('measure') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
      onMeasure(points.length === 2 ? Math.round(haversine(points[0], points[1])) : null);
    };
    if (!measureActive) {
      measurePointsRef.current = [];
      (instance.getSource('measure') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
      onMeasure(null);
    }
    instance.on('click', onClick);
    return () => { instance.off('click', onClick); };
  }, [mapReady, measureActive, onMeasure]);

  return <div ref={containerRef} className="map-canvas" role="application" aria-label="Interactive map of Demo Ward 14. Select a canonical parcel to inspect its evidence.">{mapError && <div className="map-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{mapError}</span></div>}</div>;
}

type SummaryCounts = {
  processed: number;
  autoApproved: number;
  needsReview: number;
  conflicts: number;
  changes: number;
};

function AnalyticsPulse({ total, summaryCounts, reviewQueue, stagedRecordCount, hasHarmonizedRun, engineOverview, onOpenQueue }: { total: number; summaryCounts: SummaryCounts; reviewQueue: Parcel[]; stagedRecordCount: number; hasHarmonizedRun: boolean; engineOverview?: EngineOverview; onOpenQueue: () => void }) {
  const approvalRate = total ? summaryCounts.autoApproved / total : 0;
  const avgConfidence = reviewQueue.length ? reviewQueue.reduce((sum, parcel) => sum + parcel.overall_confidence, 0) / reviewQueue.length : 0;
  const confidenceValues = reviewQueue.length
    ? reviewQueue.slice(0, 8).map((parcel) => Math.round(parcel.overall_confidence * 100)).reverse()
    : [0, 0, 0, 0, 0, 0, 0, 0];
  const chartPoints = confidenceValues.map((value, index) => ({ x: 28 + index * 62, y: 154 - value * 1.1 }));
  const linePath = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${chartPoints[chartPoints.length - 1].x} 166 L ${chartPoints[0].x} 166 Z`;
  const issueBuckets = [
    ['Boundary', reviewQueue.filter((parcel) => (parcel.conflict_type || '').toLowerCase().includes('boundary')).length],
    ['Area', reviewQueue.filter((parcel) => (parcel.conflict_type || '').toLowerCase().includes('area')).length],
    ['Land use', reviewQueue.filter((parcel) => (parcel.conflict_type || '').toLowerCase().includes('land')).length],
    ['Building', reviewQueue.filter((parcel) => (parcel.conflict_type || '').toLowerCase().includes('building')).length],
  ] as [string, number][];
  const maxIssue = Math.max(...issueBuckets.map(([, value]) => value), 1);

  return <section className="analytics-pulse" aria-label="Ward 14 fusion analytics">
    <div className="pulse-intro"><div><span className="section-label">Signal overview</span><h2>See the city resolve in real time.</h2><p>One live view of source alignment, review risk, and the evidence behind every canonical parcel.</p></div><button type="button" className="pulse-link" onClick={onOpenQueue}>Open priority queue <ArrowUpRight size={15} aria-hidden="true" /></button></div>
    <div className="pulse-layout">
      <div className="fusion-3d-card">
        <div className="pulse-card-head"><div><span className="pulse-kicker"><Activity size={13} aria-hidden="true" /> SYSTEM STATE</span><strong>{hasHarmonizedRun ? 'Fusion engine online' : 'Fusion engine ready'}</strong></div><span className="pulse-live"><i /> LIVE</span></div>
        <div className="fusion-3d-stage" aria-label={`3D fusion core showing ${hasHarmonizedRun ? `${Math.round(approvalRate * 100)} percent automated resolution` : 'ready for harmonization'}`}>
          <div className="fusion-grid-plane" />
          <div className="fusion-orbit fusion-orbit-one" />
          <div className="fusion-orbit fusion-orbit-two" />
          <div className="fusion-orbit fusion-orbit-three" />
          <span className="fusion-node fusion-node-one">IMAGERY</span><span className="fusion-node fusion-node-two">CADASTRAL</span><span className="fusion-node fusion-node-three">MUNICIPAL</span><span className="fusion-node fusion-node-four">GNSS</span>
          <div className="fusion-core"><span>FUSION CORE</span><strong>{hasHarmonizedRun ? `${Math.round(approvalRate * 100)}%` : 'READY'}</strong><small>{hasHarmonizedRun ? 'auto-resolved' : `${stagedRecordCount || '4'} source groups staged`}</small></div>
          <div className="fusion-base"><span>CANONICAL URBAN LAND RECORD</span><strong>{hasHarmonizedRun ? formatNumber(total) : '—'}</strong></div>
        </div>
        <div className="pulse-foot"><span><i className="pulse-dot pulse-dot-green" /> {hasHarmonizedRun ? `${summaryCounts.autoApproved} auto-approved` : 'Awaiting first run'}</span><span><i className="pulse-dot pulse-dot-amber" /> {summaryCounts.conflicts} conflict signals</span></div>
      </div>
      <div className="trend-card">
        <div className="pulse-card-head"><div><span className="pulse-kicker"><BarChart3 size={13} aria-hidden="true" /> REVIEW QUALITY</span><strong>Confidence across priority records</strong></div><span className="trend-value">{hasHarmonizedRun ? `${Math.round(avgConfidence * 100)}%` : '—'}<small> avg. signal</small></span></div>
        <div className="trend-chart-wrap"><svg className="trend-chart" viewBox="0 0 520 190" role="img" aria-label="Line chart of confidence across the eight highest priority records"><defs><linearGradient id="confidence-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".26" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><g className="chart-grid"><line x1="28" y1="44" x2="500" y2="44" /><line x1="28" y1="88" x2="500" y2="88" /><line x1="28" y1="132" x2="500" y2="132" /></g><path className="chart-area" d={areaPath} /><path className="chart-line" d={linePath} /><g className="chart-points">{chartPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4" />)}</g><text x="28" y="182" className="chart-axis-label">01</text><text x="248" y="182" className="chart-axis-label">04</text><text x="480" y="182" className="chart-axis-label">08</text><text x="5" y="48" className="chart-axis-label">100</text><text x="12" y="136" className="chart-axis-label">25</text></svg></div>
        <div className="trend-caption"><span>Lowest confidence: <b>{hasHarmonizedRun && confidenceValues.length ? `${Math.min(...confidenceValues)}%` : '—'}</b></span><span><i className="pulse-dot pulse-dot-blue" /> Priority records · indexed by review risk</span></div>
      </div>
      <div className="issue-card">
        <div className="pulse-card-head"><div><span className="pulse-kicker">ATTENTION MIX</span><strong>What needs a decision?</strong></div><span className="issue-total">{summaryCounts.needsReview}</span></div>
        <div className="issue-bars">{issueBuckets.map(([label, value]) => <div className="issue-bar-row" key={label}><span>{label}</span><div><i style={{ width: `${(value / maxIssue) * 100}%` }} /></div><b>{value}</b></div>)}</div>
        <div className="issue-card-note"><span><i className="pulse-dot pulse-dot-red" /> {summaryCounts.conflicts} open conflicts</span><span>{engineOverview?.confidence_engine?.coverage ? `${Math.round(engineOverview.confidence_engine.coverage * 100)}% calibrated` : 'Evidence-led review'}</span></div>
      </div>
    </div>
  </section>;
}

function QueueTable({ rows, onSelect, emptyLabel, emptyDescription }: { rows: Parcel[]; onSelect: (parcel: Parcel) => void; emptyLabel: string; emptyDescription?: string }) {
  const awaitingHarmonization = typeof document !== 'undefined' && document.documentElement.dataset.harmonizationReady !== 'true';
  return <div className="review-table queue-table">
    <div className="review-table-head" role="row"><span role="columnheader">Parcel</span><span role="columnheader">Issue</span><span role="columnheader">Severity</span><span role="columnheader">Review signals</span><span role="columnheader">Action</span></div>
    {rows.map((parcel) => <button type="button" className="review-table-row" key={parcel.canonical_parcel_id} onClick={() => onSelect(parcel)} aria-label={`Review ${parcel.canonical_parcel_id}`}>
      <div className="queue-parcel"><strong>{parcel.canonical_parcel_id}</strong><small>{parcel.survey_number} · {titleCase(parcel.land_use)}</small></div>
      <div className="queue-issue"><strong>{titleCase(parcel.conflict_type)}</strong><small>{(parcel.conflict_types?.length || 0)} signal{(parcel.conflict_types?.length || 0) === 1 ? '' : 's'} detected</small></div>
      <SeverityBadge parcel={parcel} />
      <div className="queue-meta" aria-label={`Confidence ${formatConfidence(parcel.overall_confidence)}, ${sourceCount(parcel)} sources, priority ${formatNumber(Math.round(parcel.priority))}`}><span><small>Confidence</small><strong className="queue-confidence">{formatConfidence(parcel.overall_confidence)}</strong></span><span><small>Sources</small><b className="queue-sources">{sourceCount(parcel)}</b></span><span><small>Priority</small><b className="queue-priority">{formatNumber(Math.round(parcel.priority))}</b></span></div>
      <span className="queue-action">Review <ArrowRight size={14} aria-hidden="true" /></span>
    </button>)}
    {!rows.length && <div className="empty-table queue-empty" role="status"><CircleCheck size={21} /><div><strong>{awaitingHarmonization ? 'Records staged for harmonization' : emptyLabel}</strong><span>{emptyDescription || (awaitingHarmonization ? 'Run harmonization to generate the review queue and attention results.' : 'All records in this view have been reconciled or do not match the active filters.')}</span></div></div>}
  </div>;
}

function QueueSkeleton() {
  return <div className="queue-skeleton" aria-label="Loading parcel records" role="status">{Array.from({ length: 5 }, (_, index) => <div className="queue-skeleton-row" key={index}><span /><span /><span /><span /><span /></div>)}</div>;
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
  return <div className="source-comparison"><div className="comparison-copy"><span className="section-label">Source geometry comparison</span><p>Choose a source to highlight its boundary on the map and inspect its contribution here.</p></div><div className="comparison-rows">{sourceOptions.map((source) => { const score = scoreFor(source.key); return <button type="button" className={`comparison-row ${activeSource === source.key ? 'active' : ''}`} aria-pressed={activeSource === source.key} key={source.key} onClick={() => onSourceSelect(source.key)}><span className={`comparison-swatch swatch-${source.color}`} /><strong>{source.label}</strong><span className="comparison-bar"><i style={{ width: `${score * 100}%` }} /></span><b>{formatConfidence(score)}</b></button>; })}</div><div className="alignment-summary"><span>Alignment across contributing sources</span><strong>{formatConfidence(selected.geometry_confidence ?? selected.overall_confidence)}</strong></div></div>;
}

function Lifecycle({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const current = normalized === 'AI_ACCEPTED' ? 6 : normalized === 'EVIDENCE_REQUESTED' ? 7 : normalized === 'HUMAN_REVIEW' ? 6 : normalized === 'AI_ASSISTED' ? 5 : 5;
  const stages = ['Ingested', 'Validated', 'Matched', 'Harmonized', 'Recommended'];
  return <div className="lifecycle"><div className="lifecycle-track">{stages.map((stage, index) => <div className={index < current - 1 ? 'complete' : index === current - 1 ? 'current' : ''} key={stage}><span>{index < current - 1 ? <Check size={12} /> : index + 1}</span><b>{stage}</b></div>)}</div><div className="lifecycle-branch"><span className={normalized === 'AI_ACCEPTED' ? 'current' : ''}><CircleCheck size={14} /> Approved <small>→ Published</small></span><span className={normalized !== 'AI_ACCEPTED' ? 'current' : ''}><CircleAlert size={14} /> In review <small>→ More evidence</small></span></div></div>;
}

function TechnicalDetails({ detail }: { detail: Detail }) {
  const engine = detail.engine;
  return <details className="technical-details"><summary>Technical details <ChevronDown size={14} /></summary><div className="technical-grid"><div><Network size={15} /><span><b>Graph matching</b><small>{engine?.spatial?.matches?.length ?? 0} candidate match(es) · {engine?.spatial?.many_to_many?.length ? `${engine.spatial.many_to_many.length} many-to-many` : 'no ambiguous relations'} · {engine?.spatial?.algorithm || 'graph matcher'}</small></span></div><div><Table2 size={15} /><span><b>LADM schema validation</b><small>{engine?.semantic?.mapped_field_count ?? 0} fields mapped · {engine?.semantic?.ontology?.triple_count ?? 0} ontology triples</small></span></div><div><ShieldCheck size={15} /><span><b>Semantic backend</b><small>{engine?.semantic?.semantic_backend?.semantic_backend || 'Not reported'} · {engine?.semantic?.semantic_backend?.status || 'status unavailable'}{engine?.semantic?.semantic_backend?.fallback_active ? ' · fallback active' : ''}</small></span></div><div><ShieldCheck size={15} /><span><b>Spatial conformal calibration</b><small>{engine?.confidence?.coverage ? `${Math.round(engine.confidence.coverage * 100)}% coverage` : '95% coverage'} · {engine?.confidence?.region ?? 'spatial'} region</small></span></div><div><ScanLine size={15} /><span><b>Topology on this parcel</b><small>{detail.topology?.issue_count ? `${detail.topology.issue_count} repair signal(s)` : 'No local topology issue recorded'}</small></span></div><div><RefreshCw size={15} /><span><b>Change events</b><small>{detail.changes?.length ? `${detail.changes.length} temporal signal(s)` : 'No building/date change on this record'}</small></span></div></div></details>;
}

function VersionHistory({ selected, detail, changes }: { selected: Parcel; detail: Detail; changes: any[] }) {
  const version = selected.canonical_version ?? detail.lineage.version ?? 1;
  const parcelChanges = changes.filter((change) => change.parcel_id === selected.canonical_parcel_id);
  return <div className="version-history"><div><span>v{version} · Current canonical record</span><b>Backend record</b><small>Version reported by the fusion service. Source lineage is available below.</small></div>{parcelChanges.map((change) => <div key={change.id}><span>v{change.version} · {titleCase(change.new_value)}</span><b>{change.officer || 'Authorized officer'}</b><small>{change.detail || `${change.field}: ${change.old_value} → ${change.new_value}`}</small></div>)}</div>;
}

function ReconciliationWorkspace({ selected, detail, changes, activeSource, onSourceSelect, decisionLoading, onDecision }: { selected: Parcel; detail: Detail; changes: any[]; activeSource: SourceKey; onSourceSelect: (source: SourceKey) => void; decisionLoading: boolean; onDecision: (action: string) => void }) {
  const [showVersions, setShowVersions] = useState(false);
  const sourceName = detail.source_values[0]?.source || 'Cadastral survey';
  const isPublished = selected.review_status === 'AI_ACCEPTED';
  const version = selected.canonical_version ?? detail.lineage.version ?? 1;
  return <section id="reconciliation" className="reconciliation-workspace modern-reconciliation" aria-labelledby="evidence-workspace-title"><div className="workspace-visual"><div className="workspace-heading"><div><span className="section-label">Evidence workspace</span><h2 id="evidence-workspace-title">Source comparison</h2><p>{detail.source_values.length} source record{detail.source_values.length === 1 ? '' : 's'} matched to the same canonical parcel.</p></div><button type="button" className="version-button" aria-expanded={showVersions} onClick={() => setShowVersions(!showVersions)}><BadgeCheck size={15} aria-hidden="true" /> v{version} <ChevronDown size={14} aria-hidden="true" /></button></div><SourceComparison selected={selected} detail={detail} activeSource={activeSource} onSourceSelect={onSourceSelect} /><div className="workspace-relationship"><span>Source relationships resolved</span><b>Geometry and attribute evidence are linked to this record.</b></div>{showVersions && <VersionHistory selected={selected} detail={detail} changes={changes} />}<TechnicalDetails detail={detail} /></div><div className="workspace-evidence"><span className="section-label">System recommendation</span><div className="recommendation-card"><h3>{isPublished ? `Canonical version ${version} published` : detail.recommendation.replace('Canonical record published at', 'Recommended canonical version')}</h3><p className="recommendation-why">{detail.explanation} {detail.evidence[0]?.detail ?? `The ${sourceName} record contributes the strongest available match signal.`}</p><div className="recommendation-action"><span>Recommended action</span><strong>{isPublished ? 'Published canonical record' : selected.conflict_type ? `Review ${sourceName} against contributing sources` : `Accept ${sourceName} as canonical evidence`}</strong></div></div><ConfidenceBreakdown selected={selected} /><div className="provenance-section"><div className="section-label">Record evidence</div><div className="provenance-list">{detail.source_values.slice(0, 4).map((item) => <div key={`${item.source}-${item.attribute}`}><span>{item.attribute}</span><strong>{item.source}</strong><small>{item.value} · Match score {formatConfidence(item.score)}{item.detail ? ` · ${item.detail}` : ''}</small></div>)}</div></div><div className="evidence-summary"><div><span>Supporting signals</span><b>{detail.evidence.length}</b></div><div><span>Warnings</span><b className={selected.conflict_type ? 'warning-text' : ''}>{selected.conflict_type ? detail.evidence.filter((item) => item.source !== 'Fusion engine').length || 1 : 0}</b></div></div><div className="decision-actions"><ActionButton onClick={() => onDecision('approve')} icon={decisionLoading ? LoaderCircle : Check} disabled={isPublished || decisionLoading}>{decisionLoading ? 'Saving decision…' : 'Approve recommendation'}</ActionButton><ActionButton onClick={() => onDecision('reject')} variant="secondary" icon={decisionLoading ? LoaderCircle : X} disabled={decisionLoading}>{decisionLoading ? 'Saving decision…' : 'Keep in review'}</ActionButton><button type="button" className="text-action" onClick={() => onDecision('request_evidence')} disabled={decisionLoading}>Request additional evidence <ArrowRight size={14} aria-hidden="true" /></button></div><div className="decision-note"><ShieldCheck size={15} aria-hidden="true" /> Authorized officer approval is required before a canonical change is published.</div></div></section>;
}

function Inspector({ selected, detail, queue, activeSource, onSelect, onSourceSelect }: { selected: Parcel | null; detail?: Detail; queue: Parcel[]; activeSource: SourceKey; onSelect: (parcel: Parcel) => void; onSourceSelect: (source: SourceKey) => void }) {
  return <aside className="inspector-panel modern-inspector" aria-labelledby="parcel-inspector-title"><div className="inspector-head"><div><span className="section-label">Parcel inspector</span><h2 id="parcel-inspector-title">{selected ? selected.canonical_parcel_id : 'Select a parcel'}</h2></div><span className={`record-status status-${selected ? selected.review_status.toLowerCase() : 'idle'}`}>{selected ? statusLabel(selected.review_status) : 'Awaiting input'}</span></div>{selected ? <><div className="record-summary"><div><span>Current record</span><strong>{selected.canonical_parcel_id}</strong><small>{selected.survey_number} · {titleCase(selected.land_use)}</small></div><SeverityBadge parcel={selected} /></div><div className="inspector-confidence"><div><span>Harmonization confidence</span><strong>{formatConfidence(selected.overall_confidence)} <small>{titleCase(confidenceBand(selected.overall_confidence))}</small></strong></div><div className="confidence-ring" style={{ '--progress': `${selected.overall_confidence * 100}%` } as CSSProperties} aria-label={`${formatConfidence(selected.overall_confidence)} harmonization confidence`}><span>{Math.round(selected.overall_confidence * 100)}</span></div></div><div className="inspector-status"><div><strong>{detail ? (selected.conflict_type ? titleCase(selected.conflict_type) : 'No unresolved conflicts') : 'Loading evidence'}</strong><span>{detail?.explanation ?? 'Fetching source evidence and recommendation for this parcel…'}</span></div></div><dl className="inspector-details"><div><dt>Land use</dt><dd>{selected.land_use}</dd></div><div><dt>Area</dt><dd>{formatNumber(selected.area_sq_m)} m²</dd></div><div><dt>Version</dt><dd>v{selected.canonical_version ?? 1}</dd></div></dl><Lifecycle status={selected.review_status} /><button type="button" className="selected-source-link" onClick={() => onSourceSelect(activeSource)}><span>Map highlight</span><b>{sourceOptions.find((source) => source.key === activeSource)?.label}</b></button><button type="button" className="inspector-link" onClick={() => document.getElementById('reconciliation')?.scrollIntoView({ behavior: 'smooth' })}>Open evidence workspace <ArrowDown size={14} aria-hidden="true" /></button></> : <div className="inspector-empty"><MapPinned size={29} aria-hidden="true" /><strong>Click a canonical parcel</strong><p>Evidence, recommendation, and source lineage will appear here.</p></div>}<div className="queue-preview"><div className="queue-preview-head"><span>Next records</span><b>{queue.length} need attention</b></div>{queue.slice(0, 4).map((parcel, index) => <button type="button" className={selected?.canonical_parcel_id === parcel.canonical_parcel_id ? 'selected' : ''} key={parcel.canonical_parcel_id} onClick={() => onSelect(parcel)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{parcel.canonical_parcel_id}</strong><small>{titleCase(parcel.conflict_type)}</small></div><em>{formatConfidence(parcel.overall_confidence)}</em></button>)}</div></aside>;
}

function HarmonizationProgress({ total, job }: { total: number; job: any }) {
  if (!job) return null;
  const pipeline = job.stages?.length ? job.stages as string[] : ['Ingestion', 'CRS normalization', 'Spatial matching', 'Topology QA', 'Change detection', 'Confidence calibration', 'Canonical dataset generated'];
  const currentIndex = Math.max(0, pipeline.findIndex((stage) => stage === job.stage));
  return <section className="harmonization-progress" aria-live="polite"><div><LoaderCircle size={18} className="spin" /><div><span>{job.status === 'COMPLETED' ? 'Harmonization complete' : job.stage || 'Harmonization in progress'}</span><small>{job.id ? `${job.id} · ETL, CRS, matching, topology, change detection, and scoring.` : 'Evidence is being validated before the next review queue refresh.'}</small></div><b>{job.status || 'RUNNING'}</b></div><div className="progress-stages">{pipeline.map((label, index) => <div key={label}><span>{label}</span><strong>{index <= currentIndex ? total || '—' : 'queued'}</strong><progress value={index <= currentIndex ? 1 : 0} max={1} /></div>)}</div></section>;
}

function QueueFilters({ statusFilter, setStatusFilter, issueFilter, setIssueFilter, confidenceFilter, setConfidenceFilter, sourceFilter, setSourceFilter, sortMode, setSortMode, query, setQuery, onSubmit, onClear }: { statusFilter: StatusFilter; setStatusFilter: (value: StatusFilter) => void; issueFilter: IssueFilter; setIssueFilter: (value: IssueFilter) => void; confidenceFilter: ConfidenceFilter; setConfidenceFilter: (value: ConfidenceFilter) => void; sourceFilter: string; setSourceFilter: (value: string) => void; sortMode: SortMode; setSortMode: (value: SortMode) => void; query: string; setQuery: (value: string) => void; onSubmit?: () => void; onClear?: () => void }) {
  const statuses: [StatusFilter, string][] = [['needs-review', 'Needs attention'], ['human', 'Human review'], ['conflicts', 'Conflicts'], ['assisted', 'AI assisted'], ['published', 'Published']];
  const activeFilterCount = [statusFilter !== 'needs-review', issueFilter !== 'all', confidenceFilter !== 'all', sourceFilter !== 'all', Boolean(query.trim())].filter(Boolean).length;
  return <div className="queue-filter-wrap"><label className="global-search queue-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSubmit?.(); }} placeholder="Search parcel ID, survey number, or land use…" aria-label="Search parcel records" /><kbd>/</kbd></label><div className="filter-row"><span className="filter-label">Filter</span>{statuses.map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? 'active' : ''} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}</button>)}<select aria-label="Issue filter" value={issueFilter} onChange={(event) => setIssueFilter(event.target.value as IssueFilter)}><option value="all">All issues</option><option value="boundary">Boundary</option><option value="area">Area</option><option value="duplicate">Duplicate</option><option value="land_use">Land use</option><option value="building">Building</option></select><select aria-label="Confidence filter" value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value as ConfidenceFilter)}><option value="all">All confidence</option><option value="low">Below 70%</option><option value="medium">70–85%</option><option value="high">Above 85%</option></select><select aria-label="Source filter" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All sources</option><option value="cadastral">Cadastral</option><option value="municipal">Municipal</option><option value="imagery">Drone / ORI / buildings</option><option value="revenue">Revenue</option><option value="utility">Utility</option><option value="gnss">GNSS / CORS</option></select><label className="sort-control"><SlidersHorizontal size={14} aria-hidden="true" /><span>Sort by</span><select aria-label="Sort queue" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="priority">Priority</option><option value="severity">Severity</option><option value="confidence-low">Lowest confidence</option><option value="source">Source count</option><option value="conflict">Conflict type</option></select></label>{onClear && <button type="button" className="clear-queue-filters" onClick={onClear} disabled={!activeFilterCount}>Clear filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>}</div></div>;
}

function SourceTab({ sources, onSelect }: { sources: Source[]; onSelect: (source: Source) => void }) {
  return <div className="source-tab-grid">{sources.map((source) => <button type="button" className="source-tab-card" key={source.id} onClick={() => onSelect(source)}><div><span className="source-tab-status"><CircleCheck size={14} aria-hidden="true" /> {statusLabel(source.status)}</span><strong>{source.name}</strong><small>{source.provider_name || source.dataset_type || 'Registered source'} · {source.format} · {source.crs || 'CRS not provided'}</small></div><div><b>{statusLabel(source.validation_status || source.status)}</b><span>{formatNumber(source.feature_count ?? source.records)} records</span></div><ArrowRight size={15} aria-hidden="true" /></button>)}</div>;
}

type CapabilityItem = {
  key: string;
  title: string;
  summary: string;
  detail: string;
  meta: string;
  status: 'Ready' | 'Connected' | 'Configured' | 'Attention';
  icon: any;
  action?: string;
};

function CapabilityStatus({ status }: { status: CapabilityItem['status'] }) {
  const Icon = status === 'Attention' ? CircleAlert : status === 'Configured' ? ShieldCheck : CircleCheck;
  return <span className={`capability-status capability-status-${status.toLowerCase()}`}><Icon size={13} aria-hidden="true" />{status}</span>;
}

export function CapabilityCenter({ sources, jobActive, lastRun, onRun, onOpenSources, notify }: { sources: Source[]; jobActive: boolean; lastRun?: any; onRun: () => void; onOpenSources: () => void; notify: (message: string) => void }) {
  const [tab, setTab] = useState<ControlTab>('Inputs');
  const [selectedKey, setSelectedKey] = useState('imagery');
  const findSource = (...needles: string[]) => sources.find((source) => needles.some((needle) => `${source.id} ${source.name} ${source.dataset_type || ''}`.toLowerCase().includes(needle.toLowerCase())));
  const sourceMeta = (source?: Source, fallback = 'Configured for this workspace') => source ? `${formatNumber(source.feature_count ?? source.records)} ${source.source_type === 'Raster' ? 'raster tile' : 'records'} · ${source.format}` : fallback;
  const inputItems: CapabilityItem[] = [
    { key: 'imagery', title: 'Drone / ORI imagery', summary: 'Raster ingestion and building extraction', detail: 'Upload GeoTIFF, PNG, or JPEG capture. The workspace retains raster metadata and exposes a feature-extraction adapter for building footprints and physical-change review.', meta: sourceMeta(findSource('imagery', 'drone', 'ori'), 'GeoTIFF · PNG · JPEG supported'), status: findSource('imagery', 'drone', 'ori') ? 'Connected' : 'Ready', icon: ScanLine, action: 'Open source registry' },
    { key: 'elevation', title: 'DSM / DTM surfaces', summary: 'Height and terrain context', detail: 'Register digital surface and terrain models alongside imagery so elevation, slope, and structure context can be carried into spatial review.', meta: sourceMeta(findSource('dsm', 'dtm'), 'Raster surface · CRS-aware'), status: findSource('dsm', 'dtm') ? 'Connected' : 'Ready', icon: Layers3, action: 'Inspect elevation feed' },
    { key: 'control', title: 'GNSS / CORS + ground truth', summary: 'Survey control for alignment', detail: 'Use GNSS / CORS control points and field observations as evidence for georeferencing, boundary confidence, and cases that need an officer decision.', meta: sourceMeta(findSource('gnss', 'cors', 'ground truth'), 'Control points · field evidence'), status: findSource('gnss', 'cors', 'ground truth') ? 'Connected' : 'Ready', icon: Target, action: 'Inspect control layer' },
    { key: 'registers', title: 'Utility + revenue registers', summary: 'Tabular context for each parcel', detail: 'Join utility, revenue, khata, and municipal records to a parcel identity, then preserve the original field names and provider lineage.', meta: sourceMeta(findSource('utility', 'revenue', 'khata'), 'CSV · JSON · schema-aware joins'), status: findSource('utility', 'revenue', 'khata') ? 'Connected' : 'Ready', icon: Database, action: 'Inspect registers' },
    { key: 'upload', title: 'Controlled source ingestion', summary: 'Validate before a feed can be used', detail: 'Every upload is checked for integrity, format, schema, geometry, CRS, spatial extent, and attribute completeness before it becomes eligible for harmonization.', meta: 'Immutable upload · validation gate · provenance retained', status: 'Ready', icon: UploadCloud, action: 'Add data source' },
  ];
  const processingItems: CapabilityItem[] = [
    { key: 'crs', title: 'CRS transformation', summary: 'Detect, normalize, and retain the trail', detail: 'Source coordinates are detected and transformed into the working CRS while the original CRS, EPSG, and normalization decision remain visible in source provenance.', meta: 'Original CRS → normalized working CRS · EPSG trail', status: 'Ready', icon: Globe2, action: 'View transformation details' },
    { key: 'geoai', title: 'AI / ML / GeoAI', summary: 'Explainable matching adapters', detail: 'Morphology, position, neighborhood relationships, embeddings, and optional foundation-model adapters contribute evidence without hiding the fallback or model status.', meta: 'Morphology · embeddings · segmentation adapter', status: 'Ready', icon: Sparkles, action: 'Inspect engine evidence' },
    { key: 'topology', title: 'Topology correction', summary: 'Repair geometry before publishing', detail: 'Audit and repair invalid rings, overlaps, gaps, slivers, and duplicate boundaries. Repairs are recorded as a processing step instead of silently changing the source.', meta: 'Validity · overlaps · gaps · slivers · repair log', status: 'Ready', icon: ScanLine, action: 'Open QA controls' },
    { key: 'attributes', title: 'Attribute harmonization', summary: 'Map heterogeneous fields to LADM', detail: 'Schema candidates, aliases, multilingual values, rollups, and drilldowns are resolved into canonical concepts with a field-level evidence trail.', meta: 'LADM / ISO 19152 · field crosswalk · KG validation', status: 'Ready', icon: Table2, action: 'Inspect field crosswalk' },
    { key: 'changes', title: 'Change detection', summary: 'Compare time, geometry, and footprints', detail: 'Temporal checks combine capture dates, geometry deltas, building-footprint differences, and source freshness to separate real change from data error.', meta: 'Temporal delta · footprint delta · freshness rules', status: 'Ready', icon: RefreshCw, action: 'View change signals' },
    { key: 'canonical', title: 'Canonical Urban Land Record', summary: 'Publish one versioned record per parcel', detail: 'The output is constructed from harmonized geometry, canonical attributes, confidence, evidence, review status, and complete source lineage—not just a copied reference layer.', meta: 'CULR · GeoJSON export · versioned lineage', status: 'Ready', icon: FileCheck2, action: 'Open canonical output' },
  ];
  const governanceItems: CapabilityItem[] = [
    { key: 'persistence', title: 'Persistence', summary: 'Durable data, jobs, and decisions', detail: 'Source metadata, uploads, job state, canonical versions, and audit events are kept in the configured spatial store with a deterministic local fallback for development.', meta: 'PostGIS · SQLite fallback · migrations', status: 'Configured', icon: HardDrive, action: 'View storage status' },
    { key: 'jobs', title: 'Async processing jobs', summary: 'Track stages, retries, and outcomes', detail: 'Runs have an ID, queued/running/completed state, stage progress, retry budget, error details, and a result summary that can be polled from the workspace.', meta: jobActive ? 'RUNNING · progress polling active' : `${lastRun?.status || 'READY'} · job history retained`, status: jobActive ? 'Connected' : 'Ready', icon: Workflow, action: jobActive ? 'View live progress' : 'Start a harmonization run' },
    { key: 'security', title: 'Security + access control', summary: 'Roles, tenants, and rate limits', detail: 'Bearer/API-key authentication, role-gated actions, tenant scoping, and bounded request budgets protect source registration, decisions, and exports.', meta: 'Auth · roles · tenant isolation · rate limit', status: 'Configured', icon: KeyRound, action: 'Review access model' },
    { key: 'audit', title: 'Immutable audit + provenance', summary: 'Every decision can be traced', detail: 'Officer decisions, source lineage, canonical versions, and processing events remain available as a reviewable chain with actor and timestamp context.', meta: 'Hash-chained events · actor · timestamp · lineage', status: 'Configured', icon: ShieldCheck, action: 'Open audit history' },
    { key: 'operations', title: 'Production operations', summary: 'Observe, retry, and operate safely', detail: 'Health checks, migrations, object-backed uploads, worker execution, retry handling, and versioned datasets are represented as operating controls.', meta: 'Health · monitoring · retry model · object storage', status: 'Configured', icon: Server, action: 'View operations status' },
    { key: 'review', title: 'Human review gate', summary: 'AI recommends; officers decide', detail: 'Low-confidence, conflicting, or ambiguous records stay in the queue until an authorized officer approves, keeps in review, or requests more evidence.', meta: 'Review queue · evidence · approval gate', status: 'Ready', icon: UsersRound, action: 'Open review queue' },
  ];
  const items = tab === 'Inputs' ? inputItems : tab === 'Processing' ? processingItems : governanceItems;
  const selected = items.find((item) => item.key === selectedKey) || items[0];
  const SelectedIcon = selected.icon;
  const handleAction = (item: CapabilityItem) => {
    if (item.key === 'upload' || item.key === 'imagery' || item.key === 'elevation' || item.key === 'control' || item.key === 'registers') { onOpenSources(); return; }
    if (item.key === 'jobs') { if (!jobActive) onRun(); else notify('The harmonization run is already being tracked in live progress.'); return; }
    if (item.key === 'canonical') { document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }); notify('Canonical output controls are available in the Export workspace.'); return; }
    if (item.key === 'review') { document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (['crs', 'geoai', 'topology', 'attributes', 'changes', 'audit'].includes(item.key)) { document.getElementById('fusion-labs')?.scrollIntoView({ behavior: 'smooth' }); return; }
    notify(`${item.title}: ${item.meta}`);
  };
  return <section className="capability-control-plane" aria-labelledby="capability-plane-title">
    <div className="capability-plane-head"><div><span className="section-label">Platform controls</span><h2 id="capability-plane-title">Every facility is visible before you run.</h2><p>Register inputs, inspect the fusion pipeline, and verify governance controls from one operational surface.</p></div><div className="capability-plane-actions"><span className="capability-health"><i />{inputItems.filter((item) => item.status !== 'Attention').length} input groups ready</span><button type="button" className="button button-secondary" onClick={onOpenSources}>Open source registry <ArrowUpRight size={15} /></button><button type="button" className="button button-primary" onClick={onRun} disabled={jobActive}>{jobActive ? 'Run in progress' : 'Run harmonization'}{jobActive ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}</button></div></div>
    <div className="capability-plane-stats"><div><strong>10</strong><span>input classes</span><small>Imagery, elevation, control, registers</small></div><div><strong>6</strong><span>fusion controls</span><small>CRS, GeoAI, topology, LADM, change, CULR</small></div><div><strong>6</strong><span>guardrails</span><small>Storage, jobs, security, audit, ops, review</small></div><div><strong>{jobActive ? 'RUNNING' : lastRun?.status || 'READY'}</strong><span>current run</span><small>{lastRun?.id || 'No run has been started'}</small></div></div>
    <div className="capability-tabs" role="tablist" aria-label="Platform capability views">{(['Inputs', 'Processing', 'Governance'] as ControlTab[]).map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} key={item} onClick={() => { setTab(item); setSelectedKey(item === 'Inputs' ? 'imagery' : item === 'Processing' ? 'crs' : 'persistence'); }}>{item}<span>{item === 'Inputs' ? inputItems.length : item === 'Processing' ? processingItems.length : governanceItems.length}</span></button>)}</div>
    <div className="capability-control-body"><div className="capability-card-grid">{items.map((item) => { const Icon = item.icon; return <article className={`capability-control-card ${selected.key === item.key ? 'selected' : ''}`} key={item.key} onClick={() => setSelectedKey(item.key)}><div className="capability-control-card-top"><span className="capability-control-icon"><Icon size={17} /></span><CapabilityStatus status={item.status} /></div><h3>{item.title}</h3><p>{item.summary}</p><small>{item.meta}</small><button type="button" className="capability-card-link" onClick={(event) => { event.stopPropagation(); handleAction(item); }}>{item.action}<ArrowRight size={14} /></button></article>; })}</div><aside className="capability-detail-panel" aria-live="polite"><div className="capability-detail-heading"><span className="capability-detail-icon"><SelectedIcon size={19} /></span><div><span className="section-label">Selected capability</span><h3>{selected.title}</h3></div></div><CapabilityStatus status={selected.status} /><p>{selected.detail}</p><div className="capability-detail-facts"><div><span>What the operator gets</span><strong>{selected.summary}</strong></div><div><span>Operational signal</span><strong>{selected.meta}</strong></div></div><button type="button" className="button button-secondary capability-detail-action" onClick={() => handleAction(selected)}>{selected.action}<ArrowRight size={15} /></button></aside></div>
  </section>;
}

export function ModernDemoPage({ dashboard, sources, changes, selectedSourceIds, refresh, notify, runUnlocked, onRunUnlocked }: { dashboard?: Dashboard; sources: Source[]; changes: any[]; selectedSourceIds: string[]; refresh: () => Promise<void>; notify: (message: string) => void; runUnlocked: boolean; onRunUnlocked: () => void }) {
  const [mode, setMode] = useState<DemoMode>('sources');
  const [compare, setCompare] = useState(55);
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [detail, setDetail] = useState<Detail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [tab, setTab] = useState<DemoTab>('Review Queue');
  const [job, setJob] = useState<any>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [basemapVisible, setBasemapVisible] = useState(true);
  const [measureActive, setMeasureActive] = useState(false);
  const [measureMetres, setMeasureMetres] = useState<number | null>(null);
  const [activeSource, setActiveSource] = useState<SourceKey>('canonical');
  const [layerVisibility, setLayerVisibility] = useState<Record<SourceKey, boolean>>({ cadastral: true, municipal: true, buildings: true, gnss: true, ground_truth: false, canonical: true });
  const [allParcels, setAllParcels] = useState<Parcel[]>([]);
  const [hasHarmonizedRun, setHasHarmonizedRun] = useState(runUnlocked);
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
  const detailRequestRef = useRef(0);
  const stagedRecordCount = useMemo(() => {
    const selectedSources = sources.filter((source) => selectedSourceIds.includes(source.id));
    return selectedSources.length ? Math.max(...selectedSources.map((source) => source.feature_count ?? source.records ?? 0)) : 0;
  }, [selectedSourceIds, sources]);
  const total = hasHarmonizedRun ? (dashboard?.summary.total_parcels ?? allParcels.length) : 0;

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
  useEffect(() => { setHasHarmonizedRun(runUnlocked); }, [runUnlocked]);
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
    const requestId = ++detailRequestRef.current;
    setSelected(parcel); setDetail(undefined); setDetailLoading(true);
    try { const response = await fetch(`${API}/parcels/${parcel.canonical_parcel_id}`); if (!response.ok) throw new Error(); const payload = await response.json(); if (requestId === detailRequestRef.current) setDetail(payload); }
    catch { notify('Parcel evidence is temporarily unavailable.'); }
    finally { if (requestId === detailRequestRef.current) setDetailLoading(false); }
  };
  const run = async () => {
    if (job) return;
    setJob({ status: 'PENDING', stage: 'Queued', stages: ['Ingestion', 'Validation', 'CRS normalization', 'Spatial matching', 'Topology QA and repair proposal', 'Change detection', 'Confidence calibration', 'Canonical dataset generated'] });
    notify('Harmonization job started. The review queue will refresh when evidence validation completes.');
    try {
      const request: RequestInit = { method: 'POST' };
      if (selectedSourceIds.length >= 2) { request.headers = { 'Content-Type': 'application/json' }; request.body = JSON.stringify({ source_ids: selectedSourceIds }); }
      const response = await fetch(`${API}/harmonization/jobs`, request); const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'The harmonization job could not start.');
      setJob(result);
      notify(`${result.id} queued. Processing ingestion, CRS, matching, topology, and evidence stages.`);
      let completed = result;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const statusResponse = await fetch(`${API}/harmonization/jobs/${result.id}`);
        completed = await statusResponse.json();
        setJob(completed);
        if (completed.status === 'COMPLETED' || completed.status === 'FAILED') break;
      }
      if (completed.status !== 'COMPLETED') throw new Error(completed.error || 'The harmonization job did not complete.');
      setHasHarmonizedRun(true);
      onRunUnlocked();
      window.dispatchEvent(new CustomEvent('urbanland:harmonized'));
      await refresh();
      notify(`${completed.id} completed: ${completed.result.auto_harmonized} records auto-harmonized, ${completed.result.conflicts} conflicts detected.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'The harmonization API is unavailable.'); }
    finally { setJob(null); }
  };
  const decide = async (action: string) => {
    if (!selected || decisionLoading) return;
    setDecisionLoading(true);
    try {
      const response = await fetch(`${API}/parcels/${selected.canonical_parcel_id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.detail || 'Decision could not be recorded.');
       const next = toParcel(result.parcel.properties); setSelected(next); const detailResponse = await fetch(`${API}/parcels/${next.canonical_parcel_id}`); if (!detailResponse.ok) throw new Error('The updated parcel evidence could not be loaded.'); setDetail(await detailResponse.json()); await refresh(); await loadParcels(); notify(result.event.detail);
    } catch (error) { notify(error instanceof Error ? error.message : 'Decision could not be recorded.'); }
    finally { setDecisionLoading(false); }
  };
  const chooseSource = (source: SourceKey) => { setActiveSource(source); notify(`${sourceOptions.find((item) => item.key === source)?.label} highlighted on the map and in the evidence workspace.`); };
  const activateFocus = () => { if (!hasHarmonizedRun) { notify('Run harmonization before starting focus review.'); return; } if (!selected && reviewQueue[0]) inspect(reviewQueue[0]); setFocusMode(true); };
  const clearFilters = () => { setQuery(''); setStatusFilter('needs-review'); setIssueFilter('all'); setConfidenceFilter('all'); setSourceFilter('all'); setSortMode('priority'); };
  const submitSearch = () => { const normalizedQuery = query.trim().toLowerCase(); if (!normalizedQuery) return; const result = allParcels.find((parcel) => [parcel.canonical_parcel_id, parcel.survey_number, parcel.land_use].join(' ').toLowerCase().includes(normalizedQuery)); if (result) { inspect(result); document.getElementById('map-workspace')?.scrollIntoView({ behavior: 'smooth' }); } else notify('No parcel matched that search. Try a parcel ID or survey number.'); };
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
  const lastRun = hasHarmonizedRun ? dashboard?.latest_job : undefined;
  return <main className={`demo-shell modern-demo-shell ${focusMode ? 'demo-focus' : ''}`}><div className="page-container">
    {!focusMode && <><div className="demo-topline"><div><span className="pill pill-green"><i /> LIVE DEMO · DEMO WARD 14</span><span className="demo-updated"><i className="live-dot" /> {hasHarmonizedRun ? `Synthetic benchmark · ${total} canonical parcels` : `${stagedRecordCount || 'Demo'} source records staged · results locked`}</span></div><div className="demo-top-actions"><ActionButton onClick={activateFocus} variant="secondary" icon={Focus}>Focus review</ActionButton><ActionButton onClick={run} disabled={job} icon={job ? RefreshCwIcon : Play}>{job ? 'Running harmonization…' : 'Run harmonization'}</ActionButton></div></div><div className="demo-heading"><div><span className="section-label">Operational workspace</span><h1>Review the record, <em>not the raw layers.</em></h1><p>Start with what needs attention, then inspect the map, recommendation, and evidence as one review workflow.</p></div><div className="job-status"><span>LAST PIPELINE RUN</span><strong>{job ? 'RUNNING' : lastRun?.status === 'COMPLETED' ? 'COMPLETED' : lastRun ? statusLabel(lastRun.status) : 'READY'}</strong><small>{lastRun ? lastRun.id : 'Awaiting a first run'}</small>{engineOverview?.run_id && <small className="engine-run-label">Engine {engineOverview.run_id}</small>}</div></div><div className="demo-metrics modern-metrics"><MetricButton label="Processed" value={summaryCounts.processed} caption="Records in Ward 14" active={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Auto-approved" value={summaryCounts.autoApproved} caption="Published canonical records" active={statusFilter === 'published'} onClick={() => { setStatusFilter('published'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Needs review" value={summaryCounts.needsReview} caption="Officer decision needed" active={statusFilter === 'needs-review'} onClick={() => { setStatusFilter('needs-review'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Conflicts" value={summaryCounts.conflicts} caption="Prioritized inconsistencies" active={statusFilter === 'conflicts'} onClick={() => { setStatusFilter('conflicts'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} tone="alert" /><MetricButton label="Changed" value={summaryCounts.changes} caption="Audit events" active={tab === 'Changes'} onClick={() => { setTab('Changes'); document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }); }} /></div><HarmonizationProgress total={total} job={job} /><section id="review-queue" className="queue-overview" aria-labelledby="review-queue-title"><div className="queue-overview-head"><div><span className="section-label">Review queue</span><h2 id="review-queue-title">What needs my attention?</h2><p>{statusText}. Every KPI above filters this queue.</p></div><div className="queue-head-meta"><span><CircleAlert size={15} aria-hidden="true" /> {summaryCounts.conflicts} open conflicts</span><span><Clock3 size={15} aria-hidden="true" /> Updated after each run</span></div></div><QueueFilters statusFilter={statusFilter} setStatusFilter={setStatusFilter} issueFilter={issueFilter} setIssueFilter={setIssueFilter} confidenceFilter={confidenceFilter} setConfidenceFilter={setConfidenceFilter} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} sortMode={sortMode} setSortMode={setSortMode} query={query} setQuery={setQuery} onSubmit={submitSearch} onClear={clearFilters} />{dataError && <div className="workspace-alert" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{dataError} Refresh the page after the API is available.</span></div>}{parcelsLoading ? <QueueSkeleton /> : <QueueTable rows={rows} onSelect={inspect} emptyLabel={statusFilter === 'conflicts' ? 'No unresolved conflicts' : statusFilter === 'human' ? 'No records require human review' : statusFilter === 'published' ? 'No published records match these filters' : 'No records need your attention'} />}</section><section className="engine-snapshot" aria-label="Active fusion engine"><div><span>Fusion run</span><strong>{engineOverview?.run_id || 'Not available'}</strong></div><div><span>Spatial matcher</span><strong>{engineOverview?.spatial_engine?.name || 'Not reported'}</strong></div><div><span>Semantic backend</span><strong>{engineOverview?.semantic_engine?.semantic_backend?.semantic_backend || 'Not reported'}</strong></div><div><span>Confidence calibration</span><strong>{engineOverview?.confidence_engine?.coverage ? `${Math.round(engineOverview.confidence_engine.coverage * 100)}% coverage` : 'Not reported'}</strong></div></section>
    <CapabilityCenter sources={sources} jobActive={Boolean(job)} lastRun={lastRun} onRun={run} onOpenSources={() => { setTab('Data Sources'); document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }); }} notify={notify} />
    <FusionLabs ready={hasHarmonizedRun} notify={notify} onSelectParcel={(parcelId) => { const parcel = allParcels.find((item) => item.canonical_parcel_id === parcelId); if (parcel) inspect(parcel); else notify(`${parcelId} is not in the current canonical set.`); document.getElementById('map-workspace')?.scrollIntoView({ behavior: 'smooth' }); }} /></>}
    {focusMode && <div className="focus-header"><div><span className="section-label">Focus review</span><strong>{selected?.canonical_parcel_id || 'Select a parcel'}</strong><span>Investigation workspace</span></div><ActionButton onClick={() => setFocusMode(false)} variant="secondary" icon={Minimize2}>Exit focus</ActionButton></div>}
    <section id="map-workspace" className="investigation-workspace" aria-labelledby="map-workspace-title"><div className="map-workspace modern-map-toolbar"><div className="map-toolbar-title"><span className="section-label">Map workspace</span><strong id="map-workspace-title">Spatial context for {selected?.canonical_parcel_id || 'the review queue'}</strong></div><div className="map-modes" role="group" aria-label="Map view"><button type="button" className={mode === 'sources' ? 'active' : ''} aria-pressed={mode === 'sources'} onClick={() => setMode('sources')}>Sources</button><button type="button" className={mode === 'harmonized' ? 'active' : ''} aria-pressed={mode === 'harmonized'} onClick={() => setMode('harmonized')}>AI harmonized</button><button type="button" className={mode === 'compare' ? 'active' : ''} aria-pressed={mode === 'compare'} onClick={() => setMode('compare')}>Before / after</button></div><div className="map-toolbar-actions"><button type="button" className="toolbar-button" onClick={() => { searchRef.current?.focus(); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }}><Search size={15} aria-hidden="true" /> Search parcel</button><button type="button" className={`toolbar-button ${layersOpen ? 'active' : ''}`} aria-pressed={layersOpen} onClick={() => setLayersOpen(!layersOpen)}><Layers3 size={15} aria-hidden="true" /> Layers</button><button type="button" className="toolbar-button" onClick={() => setMode('compare')}><SlidersHorizontal size={15} aria-hidden="true" /> Compare</button><button type="button" className={`toolbar-button ${measureActive ? 'active' : ''}`} aria-pressed={measureActive} onClick={() => setMeasureActive((current) => !current)}><Ruler size={15} aria-hidden="true" /> {measureActive ? (measureMetres != null ? `${measureMetres} m` : 'Click two points') : 'Measure'}</button><button type="button" className="toolbar-button" onClick={() => setBasemapVisible(!basemapVisible)} aria-pressed={!basemapVisible}><MapPinned size={15} aria-hidden="true" /> {basemapVisible ? 'Satellite' : 'Dark base'}</button></div>{mode === 'compare' && <label className="compare-slider"><span>Source</span><input type="range" min="10" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="Compare source and canonical layers" /><span>Canonical</span></label>}{layersOpen && <div className="map-layer-popover"><div><span className="section-label">Map layers</span><button type="button" onClick={() => setLayersOpen(false)} aria-label="Close map layers"><X size={15} aria-hidden="true" /></button></div><p>Source layers</p>{sourceOptions.filter((source) => source.key !== 'canonical').map((source) => <label key={source.key}><input type="checkbox" checked={layerVisibility[source.key]} onChange={() => setLayerVisibility((current) => ({ ...current, [source.key]: !current[source.key] }))} /><span className={`comparison-swatch swatch-${source.color}`} />{source.label}</label>)}<p>Canonical</p><label><input type="checkbox" checked={layerVisibility.canonical} onChange={() => setLayerVisibility((current) => ({ ...current, canonical: !current.canonical }))} /><span className="comparison-swatch swatch-green" />Harmonized boundary</label><p>Context</p><label><input type="checkbox" checked={basemapVisible} onChange={() => setBasemapVisible(!basemapVisible)} /><span className="layer-dot satellite-dot" />Satellite imagery</label><small>Blue = selection · green = validated · amber = warning · red = blocking conflict</small></div>}</div><div className="demo-map-grid"><div className="map-panel"><div className="map-panel-head"><div><span className="section-label">DEMO WARD 14 / BENGALURU</span><strong>Canonical parcel map</strong></div><span className="map-selected-label">{activeSource === 'canonical' ? 'Harmonized boundary' : `${sourceOptions.find((source) => source.key === activeSource)?.label} highlighted`}</span></div><MapView mode={mode} compare={compare} layerVisibility={layerVisibility} selected={selected} activeSource={activeSource} basemapVisible={basemapVisible} harmonizationReady={hasHarmonizedRun} measureActive={measureActive} onSelect={inspect} onSourceSelect={chooseSource} onMeasure={setMeasureMetres} /><div className="map-legend"><span><i className="status-dot success" /> Trusted</span><span><i className="status-dot warning" /> AI assisted</span><span><i className="status-dot danger" /> Conflict</span></div><div className="map-note"><MapPinned size={13} aria-hidden="true" /> Click a parcel or source layer to inspect evidence</div></div><Inspector selected={selected} detail={detail} queue={reviewQueue} activeSource={activeSource} onSelect={inspect} onSourceSelect={chooseSource} /></div>{selected && detailLoading && <div className="detail-loading" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true" /> Loading parcel evidence…</div>}{selected && detail && <ReconciliationWorkspace selected={selected} detail={detail} changes={changes} activeSource={activeSource} onSourceSelect={chooseSource} decisionLoading={decisionLoading} onDecision={decide} />}</section>
    {!focusMode && <section id="operations" className="demo-operations modern-operations"><div className="operation-tabs" role="tablist" aria-label="Operational records"><div><span className="section-label">Operational records</span><strong>Audit and source workspace</strong></div>{(['Review Queue', 'Data Sources', 'Changes', 'Export'] as DemoTab[]).map((item) => <button type="button" role="tab" aria-selected={tab === item} key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Review Queue' && <span>{reviewQueue.length}</span>}</button>)}</div>{tab === 'Review Queue' ? <div className="queue-handoff"><BadgeCheck size={19} aria-hidden="true" /><div><strong>The review queue is at the top of this workspace.</strong><span>Use the filters to prioritize work, then open a record to connect its map, evidence, and recommendation.</span></div><button type="button" className="text-action" onClick={() => document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' })}>Return to queue <ArrowDown size={14} aria-hidden="true" /></button></div> : tab === 'Data Sources' ? <SourceTab sources={sources} onSelect={(source) => { chooseSource(sourceKeyFromName(source.dataset_type || source.name)); document.getElementById('reconciliation')?.scrollIntoView({ behavior: 'smooth' }); }} /> : tab === 'Changes' ? <div className="change-table">{changes.length ? changes.map((change) => <div key={change.id}><span>{change.parcel_id}</span><span>{change.old_value} <ArrowRight size={13} /> {change.new_value}</span><span>{change.officer}</span><code>v{change.version}</code></div>) : <div className="empty-table"><Clock3 size={18} aria-hidden="true" /><div><strong>No changes recorded</strong><span>Decisions will appear here after an officer reviews a record.</span></div></div>}</div> : <div className="export-panel export-panel-multi"><div><span className="icon-box"><Download size={20} aria-hidden="true" /></span><div><h3>Canonical Urban Land Record</h3><p>Geometry, confidence, review status, and source lineage for inter-departmental exchange.</p></div></div><div className="export-actions"><a className="button button-primary" href={`${API}/export/canonical.geojson`}><Download size={16} aria-hidden="true" /> GeoJSON</a><a className="button button-secondary" href={`${API}/export/reconciliation.csv`}><Download size={16} aria-hidden="true" /> Reconciliation CSV</a><a className="button button-secondary" href={`${API}/export/audit.json`}><Download size={16} aria-hidden="true" /> Audit JSON</a></div></div>}</section>}
    {!focusMode && <details className="keyboard-help"><summary><Keyboard size={15} /> Keyboard shortcuts <ChevronDown size={14} /></summary><div><span><b>J / K</b> Next or previous record</span><span><b>A</b> Approve</span><span><b>R</b> Keep in review</span><span><b>E</b> Evidence</span><span><b>M</b> Focus map</span><span><b>/</b> Search</span></div></details>}
  </div></main>;
}

function MetricButton({ label, value, caption, active, onClick, tone = 'neutral' }: { label: string; value: number; caption: string; active: boolean; onClick: () => void; tone?: string }) {
  return <button type="button" className={`metric-button metric-${tone} ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{caption}</small></button>;
}

function RefreshCwIcon(props: any) {
  return <LoaderCircle {...props} className="spin" />;
}
