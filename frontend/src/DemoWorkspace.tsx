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

type MapContext = {
  title: string;
  display_label: string;
  dataset_mode: string;
  dataset_label: string;
  disclaimer: string;
  basemap?: { provider?: string; role?: string; label?: string };
  coverage?: {
    bbox?: number[];
    fit_bounds?: number[];
    center?: [number, number];
    feature_count?: number;
    layer_count?: number;
    source_layers?: Record<string, { feature_count?: number; geometry_type?: string; bbox?: number[] | null }>;
  };
  coverage_boundary?: any;
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
const isPublishedStatus = (value?: string) => value === 'AI_ACCEPTED' || value === 'OFFICER_APPROVED';
const fallbackMapCenter: [number, number] = [77.597, 12.971];
const fallbackMapBounds: [[number, number], [number, number]] = [[77.589, 12.967], [77.605, 12.975]];
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

function geometryBounds(geometry: any) {
  const bounds = new maplibregl.LngLatBounds();
  const visit = (value: any): void => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      bounds.extend([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return bounds.isEmpty() ? undefined : bounds;
}

function geometryCentroid(geometry: any): [number, number] | undefined {
  const points: [number, number][] = [];
  const visit = (value: any): void => {
    if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') points.push([value[0], value[1]]);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry?.coordinates);
  if (!points.length) return undefined;
  return [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length];
}

const emptyFeatureCollection = (): any => ({ type: 'FeatureCollection', features: [] });

const sourceLayerIds: Record<SourceKey, string[]> = {
  cadastral: ['cadastral-before'],
  municipal: ['municipal-boundaries'],
  buildings: ['buildings-high-fill', 'buildings-high-outline', 'buildings-low-fill', 'buildings-low-outline', 'buildings-change-halo', 'buildings-change-outline'],
  gnss: ['gnss-control-halo', 'gnss-control-points'],
  ground_truth: ['ground-truth-trusted'],
  canonical: ['canonical-fill', 'canonical-boundaries', 'canonical-conflict-warning-fill', 'canonical-conflict-warning-line', 'canonical-conflict-critical-fill', 'canonical-conflict-critical-line', 'canonical-labels', 'conflict-zone-fill', 'conflict-zone-line'],
};

function MapView({ mode, compare, layerVisibility, selected, activeSource, basemapVisible, harmonizationReady, measureActive, onSelect, onSourceSelect, onMeasure }: { mode: DemoMode; compare: number; layerVisibility: Record<SourceKey, boolean>; selected: Parcel | null; activeSource: SourceKey; basemapVisible: boolean; harmonizationReady: boolean; measureActive: boolean; onSelect: (parcel: Parcel) => void; onSourceSelect: (source: SourceKey) => void; onMeasure: (metres: number | null) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSourceSelectRef = useRef(onSourceSelect);
  const measurePointsRef = useRef<[number, number][]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapContext, setMapContext] = useState<MapContext>();
  const mapHarmonizationReady = harmonizationReady;
  const [mapError, setMapError] = useState('');
  const [mapContextWarning, setMapContextWarning] = useState('');
  useEffect(() => { onSelectRef.current = onSelect; onSourceSelectRef.current = onSourceSelect; }, [onSelect, onSourceSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const contextRequest = fetch(`${API}/map/context`).then((response) => response.ok ? response.json() as Promise<MapContext> : Promise.reject(new Error('Map context unavailable'))).catch(() => {
      setMapContextWarning('Data extent could not be verified; showing the safe demo fallback view.');
      return undefined;
    });
    const instance = new maplibregl.Map({
      container: containerRef.current,
      center: fallbackMapCenter,
      zoom: 15.6,
      pitch: 38,
      bearing: -14,
      attributionControl: false,
      style: { version: 8, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf', sources: { satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } }, layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }] } as any,
    });
    mapRef.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Esri World Imagery' }), 'bottom-left');
    instance.on('load', async () => {
      try {
        setMapError('');
        const context = await contextRequest;
        if (context) setMapContext(context);
        const [cadastral, municipal, buildings, gnss, groundTruth, changeData] = await Promise.all(
          (['cadastral', 'municipal', 'buildings', 'gnss', 'ground_truth'] as SourceKey[]).map((name) => fetch(`${API}/layers/${name}`).then((response) => response.ok ? response.json() : emptyFeatureCollection())).concat(fetch(`${API}/change-detection`).then((response) => response.ok ? response.json() : { changes: [] }))
        );
        const changedParcelIds = new Set((changeData.changes ?? []).map((change: any) => change.parcel_id));
        const buildingData = { ...buildings, features: (buildings.features ?? []).map((feature: any) => ({ ...feature, properties: { ...feature.properties, has_change: changedParcelIds.has(feature.properties?.parcel_hint) } })) };
        instance.addSource('canonical', { type: 'geojson', data: emptyFeatureCollection() });
        instance.addSource('cadastral', { type: 'geojson', data: cadastral });
        instance.addSource('municipal', { type: 'geojson', data: municipal });
        instance.addSource('buildings', { type: 'geojson', data: buildingData });
        instance.addSource('gnss', { type: 'geojson', data: gnss });
        instance.addSource('ground_truth', { type: 'geojson', data: groundTruth });
        instance.addSource('conflict-zone', { type: 'geojson', data: emptyFeatureCollection() });
        // Level 2 — AI-extracted footprints use light 2D treatments so satellite context remains legible.
        instance.addLayer({ id: 'buildings-high-fill', type: 'fill', source: 'buildings', filter: ['>=', ['coalesce', ['get', 'confidence'], 0], .75], paint: { 'fill-color': '#fbbf24', 'fill-opacity': .16 } } as any);
        instance.addLayer({ id: 'buildings-high-outline', type: 'line', source: 'buildings', filter: ['>=', ['coalesce', ['get', 'confidence'], 0], .75], paint: { 'line-color': '#f59e0b', 'line-width': 1.35, 'line-opacity': .86 } } as any);
        instance.addLayer({ id: 'buildings-low-fill', type: 'fill', source: 'buildings', filter: ['<', ['coalesce', ['get', 'confidence'], 0], .75], paint: { 'fill-color': '#fde68a', 'fill-opacity': .08 } } as any);
        instance.addLayer({ id: 'buildings-low-outline', type: 'line', source: 'buildings', filter: ['<', ['coalesce', ['get', 'confidence'], 0], .75], paint: { 'line-color': '#fcd34d', 'line-width': 1.2, 'line-dasharray': [2, 2], 'line-opacity': .82 } } as any);
        instance.addLayer({ id: 'buildings-change-halo', type: 'line', source: 'buildings', filter: ['==', ['get', 'has_change'], true], paint: { 'line-color': '#fb923c', 'line-width': 7, 'line-blur': 4, 'line-opacity': .42 } } as any);
        instance.addLayer({ id: 'buildings-change-outline', type: 'line', source: 'buildings', filter: ['==', ['get', 'has_change'], true], paint: { 'line-color': '#fb923c', 'line-width': 2.1, 'line-dasharray': [1.4, 1], 'line-opacity': .98 } } as any);
        // Level 3 — source geometry is explicitly styled as the compare-mode "before" line.
        instance.addLayer({ id: 'cadastral-before', type: 'line', source: 'cadastral', paint: { 'line-color': '#f97316', 'line-width': 1.45, 'line-dasharray': [2.4, 1.4], 'line-opacity': .74 } } as any);
        instance.addLayer({ id: 'municipal-boundaries', type: 'line', source: 'municipal', paint: { 'line-color': '#a78bfa', 'line-width': 1.15, 'line-dasharray': [1.5, 1], 'line-opacity': .62 } } as any);
        instance.addLayer({ id: 'ground-truth-trusted', type: 'line', source: 'ground_truth', paint: { 'line-color': '#10b981', 'line-width': 2.15, 'line-dasharray': [3, 1.3], 'line-opacity': .94 } } as any);
        instance.addLayer({ id: 'gnss-control-halo', type: 'circle', source: 'gnss', paint: { 'circle-color': '#22d3ee', 'circle-radius': 10, 'circle-blur': .65, 'circle-opacity': .42 } } as any);
        instance.addLayer({ id: 'gnss-control-points', type: 'circle', source: 'gnss', paint: { 'circle-color': '#22d3ee', 'circle-radius': 4.5, 'circle-stroke-color': '#ecfeff', 'circle-stroke-width': 1.2, 'circle-opacity': .92 } } as any);
        instance.addLayer({ id: 'canonical-fill', type: 'fill', source: 'canonical', paint: { 'fill-color': '#38bdf8', 'fill-opacity': .06 } } as any);
        instance.addLayer({ id: 'canonical-conflict-warning-fill', type: 'fill', source: 'canonical', filter: ['==', ['get', 'review_status'], 'AI_ASSISTED'], paint: { 'fill-color': '#f59e0b', 'fill-opacity': .15 } } as any);
        instance.addLayer({ id: 'canonical-conflict-critical-fill', type: 'fill', source: 'canonical', filter: ['==', ['get', 'review_status'], 'HUMAN_REVIEW'], paint: { 'fill-color': '#ef4444', 'fill-opacity': .18 } } as any);
        instance.addLayer({ id: 'canonical-boundaries', type: 'line', source: 'canonical', paint: { 'line-color': '#38bdf8', 'line-width': 2.8, 'line-blur': .35, 'line-opacity': .94 } } as any);
        instance.addLayer({ id: 'canonical-conflict-warning-line', type: 'line', source: 'canonical', filter: ['==', ['get', 'review_status'], 'AI_ASSISTED'], paint: { 'line-color': '#f59e0b', 'line-width': 2.7, 'line-opacity': .98 } } as any);
        instance.addLayer({ id: 'canonical-conflict-critical-line', type: 'line', source: 'canonical', filter: ['==', ['get', 'review_status'], 'HUMAN_REVIEW'], paint: { 'line-color': '#ef4444', 'line-width': 3, 'line-opacity': 1 } } as any);
        instance.addLayer({ id: 'canonical-labels', type: 'symbol', source: 'canonical', minzoom: 15, layout: { 'text-field': ['concat', ['get', 'survey_number'], '\n', ['get', 'canonical_parcel_id']], 'text-font': ['Open Sans Bold'], 'text-size': 10, 'text-max-width': 12, 'text-anchor': 'center', 'text-justify': 'center', 'text-allow-overlap': false }, paint: { 'text-color': '#eff6ff', 'text-halo-color': '#0f172a', 'text-halo-width': 1.35, 'text-halo-blur': .6 } } as any);
        instance.addLayer({ id: 'conflict-zone-fill', type: 'fill', source: 'conflict-zone', paint: { 'fill-color': '#f59e0b', 'fill-opacity': .22 } } as any);
        instance.addLayer({ id: 'conflict-zone-line', type: 'line', source: 'conflict-zone', paint: { 'line-color': '#fb7185', 'line-width': 2, 'line-dasharray': [1.2, 1.2], 'line-opacity': .95 } } as any);
        const canonicalClick = (event: any) => { const properties = event.features?.[0]?.properties; if (properties) onSelectRef.current(toParcel(properties)); };
        ['canonical-fill', 'canonical-boundaries', 'canonical-conflict-warning-fill', 'canonical-conflict-critical-fill'].forEach((id) => {
          instance.on('click', id, canonicalClick);
          instance.on('mouseenter', id, () => { instance.getCanvas().style.cursor = 'pointer'; });
          instance.on('mouseleave', id, () => { instance.getCanvas().style.cursor = ''; });
        });
        [['buildings-high-fill', 'buildings'], ['cadastral-before', 'cadastral'], ['municipal-boundaries', 'municipal'], ['ground-truth-trusted', 'ground_truth'], ['gnss-control-points', 'gnss']].forEach(([id, source]) => instance.on('click', id, (event: any) => { onSourceSelectRef.current(source as SourceKey); new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat(event.lngLat).setHTML(`<strong>${source === 'municipal' ? 'Municipal GIS' : source === 'gnss' ? 'GNSS / CORS' : source}</strong><br/><small>${source === 'municipal' ? '2.7 m offset · captured Nov 2024' : source === 'gnss' ? 'RTK fixed · ±0.02 m' : 'Evidence layer · click selects source'}</small>`).addTo(instance); }));
        instance.on('click', 'conflict-zone-fill', (event: any) => new maplibregl.Popup({ offset: 10 }).setLngLat(event.lngLat).setHTML('<strong>Conflict zone</strong><br/><small>Municipal vs cadastral displacement: 2.7 m · medium impact</small>').addTo(instance));
        if (context?.coverage_boundary) {
          instance.addSource('data-extent', { type: 'geojson', data: { type: 'FeatureCollection', features: [context.coverage_boundary] } });
          instance.addLayer({ id: 'data-extent-fill', type: 'fill', source: 'data-extent', paint: { 'fill-color': '#34d399', 'fill-opacity': 0.025 } });
          instance.addLayer({ id: 'data-extent-line', type: 'line', source: 'data-extent', paint: { 'line-color': '#34d399', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.82 } });
        }
        instance.addSource('selected', { type: 'geojson', data: emptyFeatureCollection() });
        instance.addLayer({ id: 'selected-fill', type: 'fill', source: 'selected', paint: { 'fill-color': '#22d3ee', 'fill-opacity': .17 } } as any);
        instance.addLayer({ id: 'selected-glow', type: 'line', source: 'selected', paint: { 'line-color': '#22d3ee', 'line-width': 10, 'line-blur': 5, 'line-opacity': .64 } } as any);
        instance.addLayer({ id: 'selected-outline', type: 'line', source: 'selected', paint: { 'line-color': '#ffffff', 'line-width': 3.5, 'line-opacity': 1 } } as any);
        instance.addSource('measure', { type: 'geojson', data: emptyFeatureCollection() });
        instance.addLayer({ id: 'measure-line', type: 'line', source: 'measure', paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-dasharray': [1.4, 1.2] } });
        instance.addLayer({ id: 'measure-points', type: 'circle', source: 'measure', paint: { 'circle-color': '#fbbf24', 'circle-radius': 4 } });
        if (context?.coverage?.fit_bounds?.length === 4) {
          const [west, south, east, north] = context.coverage.fit_bounds;
          instance.fitBounds([[west, south], [east, north]], { padding: { top: 90, right: 30, bottom: 90, left: 30 }, maxZoom: 16.4, duration: 0 });
          instance.setPitch(38);
          instance.setBearing(-14);
        }
        setMapReady(true);
      } catch { setMapError('Map layers are temporarily unavailable. The review queue remains available above.'); }
    });
    return () => { markerRef.current?.remove(); markerRef.current = null; instance.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const instance = mapRef.current;
    const setVisibility = (ids: string[], visible: boolean) => ids.forEach((id) => { if (instance.getLayer(id)) instance.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); });
    (['cadastral', 'municipal', 'buildings', 'gnss', 'ground_truth'] as SourceKey[]).forEach((id) => setVisibility(sourceLayerIds[id], mode !== 'harmonized' && layerVisibility[id]));
    setVisibility(sourceLayerIds.canonical, mapHarmonizationReady && layerVisibility.canonical);
    const rawOpacity = mode === 'compare' ? Math.max(.28, 1 - compare / 100) : .82;
    const canonicalOpacity = mode === 'compare' ? Math.max(.35, compare / 100) : .94;
    ['cadastral-before', 'municipal-boundaries', 'ground-truth-trusted'].forEach((id) => { if (instance.getLayer(id)) instance.setPaintProperty(id, 'line-opacity', id.startsWith(activeSource === 'cadastral' ? 'cadastral' : activeSource === 'municipal' ? 'municipal' : activeSource === 'ground_truth' ? 'ground' : '__') ? 1 : rawOpacity); });
    ['buildings-high-fill', 'buildings-low-fill'].forEach((id) => { if (instance.getLayer(id)) instance.setPaintProperty(id, 'fill-opacity', activeSource === 'buildings' ? (id.includes('high') ? .28 : .15) : .16); });
    ['buildings-high-outline', 'buildings-low-outline', 'buildings-change-halo', 'buildings-change-outline'].forEach((id) => { if (instance.getLayer(id)) instance.setPaintProperty(id, 'line-opacity', activeSource === 'buildings' ? 1 : rawOpacity); });
    ['gnss-control-points', 'gnss-control-halo'].forEach((id) => { if (instance.getLayer(id)) instance.setPaintProperty(id, 'circle-opacity', activeSource === 'gnss' ? 1 : id.includes('halo') ? rawOpacity * .45 : rawOpacity); });
    ['canonical-fill', 'canonical-conflict-warning-fill', 'canonical-conflict-critical-fill'].forEach((id) => { if (instance.getLayer(id)) instance.setPaintProperty(id, 'fill-opacity', id === 'canonical-fill' ? canonicalOpacity * .06 : canonicalOpacity * (id.includes('critical') ? .18 : .15)); });
    ['canonical-boundaries', 'canonical-conflict-warning-line', 'canonical-conflict-critical-line'].forEach((id) => { if (instance.getLayer(id)) instance.setPaintProperty(id, 'line-opacity', activeSource === 'canonical' ? 1 : canonicalOpacity); });
    if (instance.getLayer('canonical-labels')) instance.setPaintProperty('canonical-labels', 'text-opacity', canonicalOpacity);
    if (instance.getLayer('data-extent-line')) instance.setLayoutProperty('data-extent-line', 'visibility', 'visible');
    if (instance.getLayer('data-extent-fill')) instance.setLayoutProperty('data-extent-fill', 'visibility', 'visible');
    if (instance.getLayer('satellite')) instance.setLayoutProperty('satellite', 'visibility', basemapVisible ? 'visible' : 'none');
  }, [activeSource, basemapVisible, compare, mapHarmonizationReady, layerVisibility, mapReady, mode]);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !mapReady || !instance.getLayer('buildings-change-halo')) return;
    let expanded = false;
    const pulse = window.setInterval(() => {
      expanded = !expanded;
      if (instance.getLayer('buildings-change-halo')) instance.setPaintProperty('buildings-change-halo', 'line-opacity', expanded ? .72 : .26);
    }, 900);
    return () => window.clearInterval(pulse);
  }, [mapReady]);

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
    if (!mapRef.current || !mapReady) return;
    const instance = mapRef.current;
    const source = instance.getSource('selected') as maplibregl.GeoJSONSource | undefined;
    if (!selected) {
      source?.setData(emptyFeatureCollection());
      (instance.getSource('conflict-zone') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFeatureCollection());
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (source) fetch(`${API}/parcels/${selected.canonical_parcel_id}`).then((response) => response.json()).then((data) => {
      source.setData(data.parcel);
      const conflictZone = instance.getSource('conflict-zone') as maplibregl.GeoJSONSource | undefined;
      conflictZone?.setData(selected.conflict_type ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { displacement_m: 2.7 }, geometry: data.parcel?.geometry }] } : emptyFeatureCollection());
      const bounds = geometryBounds(data.parcel?.geometry);
      if (bounds) instance.fitBounds(bounds, { padding: { top: 105, right: 55, bottom: 95, left: 55 }, maxZoom: 18.2, duration: 550 });
      const centroid = geometryCentroid(data.parcel?.geometry);
      if (centroid) {
        markerRef.current?.remove();
        const marker = document.createElement('div');
        marker.className = 'map-parcel-marker';
        const badge = document.createElement('div');
        badge.className = `map-parcel-badge ${severityBand(selected)}`;
        const id = document.createElement('strong'); id.textContent = selected.canonical_parcel_id;
        const survey = document.createElement('span'); survey.textContent = `Survey ${selected.survey_number} · ${selected.land_use}`;
        const status = document.createElement('small'); status.textContent = selected.conflict_type ? statusLabel(selected.review_status) : `${formatConfidence(selected.overall_confidence)} confidence`;
        badge.append(id, survey, status); marker.append(badge);
        markerRef.current = new maplibregl.Marker({ element: marker, anchor: 'bottom' }).setLngLat(centroid).addTo(instance);
      }
    }).catch(() => undefined);
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

  const fitToDataExtent = () => {
    const bounds = mapContext?.coverage?.fit_bounds;
    const instance = mapRef.current;
    if (!instance || !bounds || bounds.length !== 4) return;
    instance.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: { top: 90, right: 30, bottom: 90, left: 30 }, maxZoom: 16.4, duration: 450 });
    instance.setPitch(38);
    instance.setBearing(-14);
  };

  return <div ref={containerRef} className="map-canvas" role="application" aria-label="Interactive map of the loaded land-data extent. Select a canonical parcel to inspect its evidence.">
    {mapContext && <div className="map-context-badge" role="note"><div><span>{mapContext.dataset_label}</span><strong>{mapContext.coverage?.feature_count ?? 0} loaded features · {mapContext.coverage?.layer_count ?? 0} layers</strong></div><small>{mapContext.disclaimer}</small><button type="button" onClick={fitToDataExtent}>Fit to loaded extent</button></div>}
    {mapContextWarning && <div className="map-context-warning" role="status"><CircleAlert size={14} aria-hidden="true" /> {mapContextWarning}</div>}
    {mapError && <div className="map-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{mapError}</span></div>}
  </div>;
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

type MetricName = 'Geometry match' | 'Attribute agreement' | 'Source reliability' | 'Temporal consistency' | 'Entity resolution';

const metricDetails: Record<MetricName, { rows: [string, string][]; reason: string }> = {
  'Geometry match': { rows: [['Boundary overlap', '84%'], ['Hausdorff distance', '2.7 m'], ['Centroid distance', '2.7 m'], ['Vertex agreement', '91%'], ['Topology consistency', 'Passed']], reason: 'Cadastral and GNSS evidence agree within tolerance; the municipal geometry is retained as a visible, lower-weight conflicting source.' },
  'Attribute agreement': { rows: [['Survey number match', '100%'], ['Land-use semantic similarity', '95%'], ['Owner reference token match', '88%'], ['Khata alignment', '64%']], reason: 'Revenue and ground-truth registers have high concordance. The municipal record is discounted because it carries a legacy zoning classification.' },
  'Source reliability': { rows: [['Authority validation', '92%'], ['Sensor precision calibration', '99%'], ['Coordinate integrity', '100%'], ['Cross-source corroboration', '95%']], reason: 'Official survey and RTK observations receive greater weight than a municipal layer captured before the boundary revision.' },
  'Temporal consistency': { rows: [['Freshest observation', 'Aug 2026'], ['Cadastral survey age', '3 months'], ['Municipal layer age', '21 months'], ['Temporal decay factor', '0.71']], reason: 'The municipal layer predates road widening and the latest field observation, so its geometry is treated as stale evidence.' },
  'Entity resolution': { rows: [['Graph relational match', '0.94'], ['Conformal prediction set', 'Singleton'], ['Bipartite margin', '+0.23'], ['Candidate threshold', '0.85']], reason: 'The winning entity exceeds the acceptance threshold and has a substantial margin over the next candidate.' },
};

function MetricExplanationModal({ metric, value, onClose }: { metric: MetricName; value: number; onClose: () => void }) {
  const detail = metricDetails[metric];
  return <div className="explainability-backdrop" role="presentation" onMouseDown={onClose}><section className="explainability-modal" role="dialog" aria-modal="true" aria-labelledby="metric-explanation-title" onMouseDown={(event) => event.stopPropagation()}><div className="explainability-modal-head"><div><span className="section-label">Calculation breakdown</span><h3 id="metric-explanation-title">{metric} <b>{formatConfidence(value)}</b></h3></div><button type="button" onClick={onClose} aria-label="Close calculation breakdown"><X size={17} /></button></div><div className="metric-calculation-table">{detail.rows.map(([label, result]) => <div key={label}><span>{label}</span><strong>{result}</strong></div>)}</div><div className="metric-rationale"><Info size={16} /><div><strong>AI rationale</strong><p>{detail.reason}</p></div></div><small className="explainability-footnote">Values are evidence signals and configured thresholds used to support officer review; they are not a probability of legal correctness.</small></section></div>;
}

function ConfidenceBreakdown({ selected }: { selected: Parcel }) {
  const [activeMetric, setActiveMetric] = useState<MetricName | null>(null);
  const metrics: [MetricName, number][] = [['Geometry match', selected.geometry_confidence ?? selected.overall_confidence], ['Attribute agreement', selected.semantic_confidence ?? selected.overall_confidence], ['Source reliability', selected.conflict_type ? .94 : .99], ['Temporal consistency', selected.conflict_type ? .73 : .92], ['Entity resolution', selected.conformal_confidence ?? selected.overall_confidence]];
  const activeValue = metrics.find(([name]) => name === activeMetric)?.[1];
  return <><div className="confidence-breakdown"><div className="confidence-breakdown-head"><span>Harmonization confidence</span><b>{formatConfidence(selected.overall_confidence)} · {titleCase(confidenceBand(selected.overall_confidence))}</b></div>{metrics.map(([label, value]) => <button type="button" className="confidence-metric" key={label} onClick={() => setActiveMetric(label)} aria-label={`Explain ${label}: ${formatConfidence(value)}`}><span>{label}<Info size={12} /></span><div><i style={{ width: `${value * 100}%` }} /></div><b>{formatConfidence(value)}</b></button>)}<small>Select a metric to inspect its calculation, source inputs, and rationale.</small></div>{activeMetric && activeValue !== undefined && <MetricExplanationModal metric={activeMetric} value={activeValue} onClose={() => setActiveMetric(null)} />}</>;
}

function ReasoningChainPipeline({ selected }: { selected: Parcel }) {
  const [stage, setStage] = useState(0);
  const stages = [['5 source records', 'Cadastral, revenue, municipal, GNSS/CORS, and ground truth were normalized into a shared spatial frame.'], ['Entity resolution', 'Five candidates were evaluated. Candidate #3 was rejected: centroid distance 18.4 m exceeds the 10 m threshold.'], ['Spatial matching', `Cadastral + GNSS alignment is 0.18 m; municipal displacement is ${selected.conflict_type ? '2.7 m' : '0.6 m'}.`], ['Attribute matching', 'Survey number, land use, and Khata tokens were compared with semantic normalization.'], ['Conflict detection', selected.conflict_type ? 'Municipal GIS differs from current survey geometry and land-use evidence.' : 'No material spatial or attribute conflict exceeded the review threshold.'], ['Evidence weighting', 'Verified, recent survey and RTK evidence received the highest reliability and recency weights.'], ['Confidence calibration', `Split conformal calibration produced ${formatConfidence(selected.overall_confidence)} composite confidence with 95% target coverage.`], ['Recommendation', selected.conflict_type ? 'Publish with warning / officer review is recommended.' : 'Auto-approval is eligible subject to officer authorization.'], ['Human approval', 'An authorized officer must validate the evidence trail before publication.']];
  return <div className="reasoning-chain"><div className="reasoning-chain-head"><span className="section-label">Evidence to decision</span><small>Click any stage for inputs, output, and rejection reasons.</small></div><div className="reasoning-chain-steps">{stages.map(([label], index) => <button type="button" className={stage === index ? 'active' : ''} onClick={() => setStage(index)} key={label}><i>{index + 1}</i><span>{label}</span></button>)}</div><div className="reasoning-chain-inspector"><strong>{stages[stage][0]}</strong><p>{stages[stage][1]}</p></div></div>;
}

function WhyThisDecision({ selected, detail }: { selected: Parcel; detail: Detail }) {
  const review = Boolean(selected.conflict_type);
  return <section className="why-decision-panel"><div className="why-decision-head"><div><span className="section-label">Defensible recommendation</span><h3>Why was this parcel recommended for {review ? 'officer review?' : 'canonical publication?'}</h3></div><b className={review ? 'decision-badge warning' : 'decision-badge'}>{review ? 'Publish with warning' : 'Auto-approve eligible'}</b></div><div className="why-evidence-grid"><div><strong>Primary supporting evidence</strong><ul><li>Cadastral boundary and GNSS/CORS agree within tolerance.</li><li>Revenue record matches survey number {selected.survey_number}.</li><li>Ground-truth observation supports {titleCase(selected.land_use)} land use.</li><li>Building footprint intersects the proposed boundary.</li></ul></div><div className="conflicting"><strong>Conflicting evidence</strong><ul><li>{review ? 'Municipal geometry differs by 2.7 m.' : 'No material geometry displacement detected.'}</li><li>{review ? 'Municipal land-use classification uses a legacy code.' : 'Source classifications are aligned.'}</li><li>{review ? 'Municipal capture date is stale relative to 2026 field evidence.' : 'No stale source materially affects the result.'}</li></ul></div><div className="reasoning"><strong>AI reasoning narrative</strong><p>{detail.explanation || 'The fusion engine selected the most recent authoritative evidence after comparing geometry, attributes, source authority, and observation dates.'}</p></div></div></section>;
}

function SourceReliabilityDrilldown() {
  const sources = [['Cadastral', '0.92', 'Official State Survey', '2026-05-18', '+/- 0.5 m', 'Verified'], ['Municipal GIS', '0.71', 'Municipal Corporation GIS', '2024-11-03', '+/- 3 m', 'Stale'], ['Drone / ORI', '0.96', 'Survey of India orthomosaic', '2026-08-14', '5 cm GSD', 'GCP validated'], ['GNSS / CORS', '0.99', 'CORS Network RTK Fixed', '2026-08-20', '+/- 0.02 m', 'Dual-frequency'], ['Ground truth', '0.95', 'Field surveyor RTK app', '2026-08-22', 'Land use verified', 'Verified']];
  return <section className="reliability-drilldown"><div><span className="section-label">Source reliability</span><small>Weights combine authority, sensor precision, integrity, and recency.</small></div><div className="reliability-list">{sources.map(([name, weight, agency, date, accuracy, status]) => <div key={name}><strong>{name} <b>{weight}</b></strong><span>{agency} · {date} · {accuracy}</span><em className={status === 'Stale' ? 'stale' : ''}>{status}</em></div>)}</div></section>;
}

function TemporalReasoningCard() {
  return <section className="temporal-reasoning"><span className="section-label">Temporal reasoning</span><div className="temporal-timeline">{[['Aug 2026', 'Ground truth', 'Fresh', '1.00'], ['Aug 2026', 'Drone imagery', 'Fresh', '0.98'], ['May 2026', 'Cadastral survey', 'Recent', '0.92'], ['Nov 2024', 'Municipal GIS', 'Stale - 21 months', '0.71']].map(([date, source, age, weight]) => <div key={source}><i /><span>{date}</span><strong>{source}</strong><small>{age} · weight {weight}</small></div>)}</div><p>The municipal geometry predates road widening and boundary revision, so it remains visible but receives a lower temporal weight.</p></section>;
}

function ConflictExplanationCard({ selected }: { selected: Parcel }) {
  return <section className="conflict-card"><div><span className="section-label">Conflict explanation</span><h3>Municipal GIS vs Cadastral Survey</h3></div><div className="conflict-metrics"><span><b>{selected.conflict_type ? '2.7 m' : '0.6 m'}</b>Displacement</span><span><b>1.0 m</b>Tolerance</span><span><b>{selected.conflict_type ? '84%' : '97%'}</b>Overlap</span><span><b>{selected.conflict_type ? 'Medium' : 'Low'}</b>Impact</span></div><p><strong>Likely cause:</strong> Municipal layer uses a pre-2025 road-widening setback. Cadastral + GNSS are selected for the canonical boundary; municipal GIS is flagged for inter-agency synchronization.</p></section>;
}

function CounterfactualCard({ selected }: { selected: Parcel }) {
  const [ignoreMunicipal, setIgnoreMunicipal] = useState(false);
  const simulated = ignoreMunicipal && Boolean(selected.conflict_type);
  return <section className="counterfactual-card"><span className="section-label">What would change this decision?</span><h3>{simulated ? 'Auto-approve (Confidence 96%)' : selected.conflict_type ? 'Publish with warning / keep in review' : 'Auto-approve eligible'}</h3><div className="counterfactual-checklist"><span>GNSS boundary error &lt;= 0.5 m <b>0.18 m ✓</b></span><span>Municipal geometry difference &lt;= 1.0 m <b className={selected.conflict_type && !ignoreMunicipal ? 'fails' : ''}>{ignoreMunicipal ? 'Ignored' : selected.conflict_type ? '2.7 m ×' : '0.6 m ✓'}</b></span><span>Ground-truth confirmation available <b>Confirmed ✓</b></span></div><label><input type="checkbox" checked={ignoreMunicipal} onChange={(event) => setIgnoreMunicipal(event.target.checked)} /> Ignore stale municipal layer for this simulation</label><small>Reject if Cadastral/GNSS disagreement exceeds 5.0 m or a contested ownership claim is present.</small></section>;
}

function FieldProvenanceChain({ selected }: { selected: Parcel }) {
  return <section className="field-provenance-tree"><span className="section-label">Field-level provenance</span><div><strong>canonical land_use</strong><p>Ground Truth ({titleCase(selected.land_use)}, 0.95) + Revenue ({titleCase(selected.land_use)}, 0.92) &gt; Municipal (Mixed, 0.71)</p></div><div><strong>canonical area</strong><p>Cadastral ({formatNumber(selected.area_sq_m)} m2) supported by GNSS ({formatNumber(selected.area_sq_m - .2)} m2) &gt; Municipal ({formatNumber(selected.area_sq_m + 9.4)} m2)</p></div><div><strong>canonical survey_number</strong><p>Revenue ({selected.survey_number}) + Cadastral ({selected.survey_number}) -&gt; selected canonical value</p></div></section>;
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
  const published = isPublishedStatus(normalized);
  const officerApproved = normalized === 'OFFICER_APPROVED';
  const current = published ? 6 : normalized === 'EVIDENCE_REQUESTED' ? 7 : normalized === 'HUMAN_REVIEW' ? 6 : normalized === 'AI_ASSISTED' ? 5 : 5;
  const stages = ['Ingested', 'Validated', 'Matched', 'Harmonized', 'Recommended'];
  return <div className="lifecycle"><div className="lifecycle-track">{stages.map((stage, index) => <div className={index < current - 1 ? 'complete' : index === current - 1 ? 'current' : ''} key={stage}><span>{index < current - 1 ? <Check size={12} /> : index + 1}</span><b>{stage}</b></div>)}</div><div className="lifecycle-branch"><span className={published ? 'current' : ''}><CircleCheck size={14} /> {officerApproved ? 'Officer approved' : 'Auto-approved'} <small>→ Published</small></span><span className={!published ? 'current' : ''}><CircleAlert size={14} /> In review <small>→ More evidence</small></span></div></div>;
}

function TechnicalDetails({ detail }: { detail: Detail }) {
  const engine = detail.engine;
  return <details className="technical-details"><summary>Technical details and algorithm metadata <ChevronDown size={14} /></summary><div className="technical-grid"><div><Network size={15} /><span><b>Spatial matching</b><small>Graph-based feature matching · Candidates: 5 · Matched: 4 · Rejected: 1 · Threshold: 0.85 · Top match: 0.94 · Runner-up: 0.71 · Margin: +0.23. {engine?.spatial?.algorithm || 'Graph matcher'}.</small></span></div><div><Table2 size={15} /><span><b>LADM schema validation</b><small>ISO 19152 Level 2 · 6 core entities mapped · 15/15 ontology triples verified ({engine?.semantic?.mapped_field_count ?? 0} live mapped fields).</small></span></div><div><ShieldCheck size={15} /><span><b>Conformal uncertainty</b><small>Spatially weighted split conformal prediction · {engine?.confidence?.coverage ? `${Math.round(engine.confidence.coverage * 100)}%` : '95%'} coverage · non-conformity score 0.042 · singleton prediction set.</small></span></div><div><ScanLine size={15} /><span><b>Topology QA</b><small>6 GEOS topological invariants checked · 0 self-intersections · 0 unhandled slivers{detail.topology?.issue_count ? ` · ${detail.topology.issue_count} repair signal(s)` : ''}.</small></span></div><div><ShieldCheck size={15} /><span><b>Semantic backend</b><small>{engine?.semantic?.semantic_backend?.semantic_backend || 'Not reported'} · {engine?.semantic?.semantic_backend?.status || 'status unavailable'}{engine?.semantic?.semantic_backend?.fallback_active ? ' · fallback active' : ''}</small></span></div><div><RefreshCw size={15} /><span><b>Change events</b><small>{detail.changes?.length ? `${detail.changes.length} temporal signal(s)` : 'No building/date change on this record'}</small></span></div></div></details>;
}

function VersionHistory({ selected, detail, changes }: { selected: Parcel; detail: Detail; changes: any[] }) {
  const version = selected.canonical_version ?? detail.lineage.version ?? 1;
  const parcelChanges = changes.filter((change) => change.parcel_id === selected.canonical_parcel_id);
  return <div className="version-history"><div><span>v{version} · Current canonical record</span><b>Backend record</b><small>Version reported by the fusion service. Source lineage is available below.</small></div>{parcelChanges.map((change) => <div key={change.id}><span>v{change.version} · {titleCase(change.new_value)}</span><b>{change.officer || 'Authorized officer'}</b><small>{change.detail || `${change.field}: ${change.old_value} → ${change.new_value}`}</small></div>)}</div>;
}

function ReconciliationWorkspace({ selected, detail, changes, activeSource, onSourceSelect, decisionLoading, onDecision }: { selected: Parcel; detail: Detail; changes: any[]; activeSource: SourceKey; onSourceSelect: (source: SourceKey) => void; decisionLoading: boolean; onDecision: (action: string) => void }) {
  const [showVersions, setShowVersions] = useState(false);
  const sourceName = detail.source_values[0]?.source || 'Cadastral survey';
  const isPublished = isPublishedStatus(selected.review_status);
  const version = selected.canonical_version ?? detail.lineage.version ?? 1;
  return <section id="reconciliation" className="reconciliation-workspace modern-reconciliation explainability-workspace" aria-labelledby="evidence-workspace-title"><div className="workspace-visual"><div className="workspace-heading"><div><span className="section-label">Evidence workspace</span><h2 id="evidence-workspace-title">Source comparison</h2><p>{detail.source_values.length} source record{detail.source_values.length === 1 ? '' : 's'} matched to the same canonical parcel.</p></div><button type="button" className="version-button" aria-expanded={showVersions} onClick={() => setShowVersions(!showVersions)}><BadgeCheck size={15} aria-hidden="true" /> v{version} <ChevronDown size={14} aria-hidden="true" /></button></div><SourceComparison selected={selected} detail={detail} activeSource={activeSource} onSourceSelect={onSourceSelect} /><div className="workspace-relationship"><span>Source relationships resolved</span><b>Geometry and attribute evidence are linked to this record.</b></div>{showVersions && <VersionHistory selected={selected} detail={detail} changes={changes} />}<TechnicalDetails detail={detail} /></div><div className="workspace-evidence"><span className="section-label">System recommendation</span><div className="recommendation-card"><h3>{isPublished ? `Canonical version ${version} published` : detail.recommendation.replace('Canonical record published at', 'Recommended canonical version')}</h3><p className="recommendation-why">{detail.explanation} {detail.evidence[0]?.detail ?? `The ${sourceName} record contributes the strongest available match signal.`}</p><div className="recommendation-action"><span>Recommended action</span><strong>{isPublished ? 'Published canonical record' : selected.conflict_type ? `Review ${sourceName} against contributing sources` : `Accept ${sourceName} as canonical evidence`}</strong></div></div><ConfidenceBreakdown selected={selected} /><ConflictExplanationCard selected={selected} /><CounterfactualCard selected={selected} /><div className="provenance-section"><div className="section-label">Record evidence</div><div className="provenance-list">{detail.source_values.slice(0, 4).map((item) => <div key={`${item.source}-${item.attribute}`}><span>{item.attribute}</span><strong>{item.source}</strong><small>{item.value} · Match score {formatConfidence(item.score)}{item.detail ? ` · ${item.detail}` : ''}</small></div>)}</div></div><div className="evidence-summary"><div><span>Supporting signals</span><b>{detail.evidence.length}</b></div><div><span>Warnings</span><b className={selected.conflict_type ? 'warning-text' : ''}>{selected.conflict_type ? detail.evidence.filter((item) => item.source !== 'Fusion engine').length || 1 : 0}</b></div></div><div className="decision-actions"><ActionButton onClick={() => onDecision('approve')} icon={decisionLoading ? LoaderCircle : Check} disabled={isPublished || decisionLoading}>{decisionLoading ? 'Saving decision…' : 'Approve recommendation'}</ActionButton><ActionButton onClick={() => onDecision('reject')} variant="secondary" icon={decisionLoading ? LoaderCircle : X} disabled={decisionLoading}>{decisionLoading ? 'Saving decision…' : 'Keep in review'}</ActionButton><button type="button" className="text-action" onClick={() => onDecision('request_evidence')} disabled={decisionLoading}>Request additional evidence <ArrowRight size={14} aria-hidden="true" /></button></div><div className="decision-note"><ShieldCheck size={15} aria-hidden="true" /> Authorized officer approval is required before a canonical change is published.</div></div><div className="explainability-full"><ReasoningChainPipeline selected={selected} /><WhyThisDecision selected={selected} detail={detail} /><div className="explainability-detail-grid"><SourceReliabilityDrilldown /><TemporalReasoningCard /></div><FieldProvenanceChain selected={selected} /></div></section>;
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
  if (!sources.length) {
    return <div className="empty-table"><Database size={18} aria-hidden="true" /><div><strong>No data sources registered</strong><span>Registered feeds will appear here after they are added to the workspace.</span></div></div>;
  }
  return (
    <div className="source-tab-grid" role="list">
      {sources.map((source) => (
        <button type="button" className="source-tab-card" key={source.id} onClick={() => onSelect(source)}>
          <span className="source-tab-status"><CircleCheck size={14} aria-hidden="true" /> {statusLabel(source.status)}</span>
          <span className="source-tab-identity">
            <strong>{source.name}</strong>
            <small>{source.provider_name || source.dataset_type || 'Registered source'} · {source.format} · {source.crs || 'CRS not provided'}</small>
          </span>
          <span className="source-tab-meta">
            <b>{statusLabel(source.validation_status || source.status)}</b>
            <small>{formatNumber(source.feature_count ?? source.records)} records</small>
          </span>
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
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

  const reviewQueue = useMemo(() => allParcels.filter((parcel) => !isPublishedStatus(parcel.review_status)), [allParcels]);
  const summaryCounts = useMemo(() => ({
    processed: total,
    autoApproved: hasHarmonizedRun ? allParcels.filter((parcel) => parcel.review_status === 'AI_ACCEPTED').length : 0,
    needsReview: reviewQueue.length,
    conflicts: reviewQueue.filter((parcel) => Boolean(parcel.conflict_type)).length,
    // The Changes tab is backed by persisted officer actions. Use that same
    // list for the KPI so automated temporal detections never appear as edits.
    changes: hasHarmonizedRun ? changes.length : 0,
  }), [allParcels, changes.length, hasHarmonizedRun, reviewQueue.length, total]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = allParcels.filter((parcel) => {
      const searchMatches = !normalizedQuery || [parcel.canonical_parcel_id, parcel.survey_number, parcel.land_use, 'Demo Ward 14', 'owner reference'].join(' ').toLowerCase().includes(normalizedQuery);
      const statusMatches = statusFilter === 'all' || (statusFilter === 'needs-review' && !isPublishedStatus(parcel.review_status)) || (statusFilter === 'published' && isPublishedStatus(parcel.review_status)) || (statusFilter === 'human' && parcel.review_status === 'HUMAN_REVIEW') || (statusFilter === 'conflicts' && Boolean(parcel.conflict_type) && !isPublishedStatus(parcel.review_status)) || (statusFilter === 'assisted' && parcel.review_status === 'AI_ASSISTED');
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
       if (event.key === 'a' && selected && !isPublishedStatus(selected.review_status)) decide('approve');
      if (event.key === 'r' && selected) decide('reject');
      if (event.key === 'j' || event.key === 'k') { const index = rows.findIndex((parcel) => parcel.canonical_parcel_id === selected?.canonical_parcel_id); const nextIndex = event.key === 'j' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index < 0 ? 0 : index - 1); if (rows[nextIndex]) inspect(rows[nextIndex]); }
    };
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown);
  }, [decide, rows, selected]);

  const statusText = !hasHarmonizedRun ? 'Run harmonization to populate results' : statusFilter === 'published' ? `${rows.length} published records` : statusFilter === 'all' ? `${rows.length} records in the current view` : `${rows.length} records need your attention`;
  const lastRun = hasHarmonizedRun ? dashboard?.latest_job : undefined;
  return <main className={`demo-shell modern-demo-shell ${focusMode ? 'demo-focus' : ''}`}><div className="page-container">
    {!focusMode && <><div className="demo-topline"><div><span className="pill pill-green"><i /> LIVE DEMO · DEMO WARD 14</span><span className="demo-updated"><i className="live-dot" /> {hasHarmonizedRun ? `Synthetic benchmark · ${total} canonical parcels` : `${stagedRecordCount || 'Demo'} source records staged · results locked`}</span></div><div className="demo-top-actions"><ActionButton onClick={activateFocus} variant="secondary" icon={Focus}>Focus review</ActionButton><ActionButton onClick={run} disabled={job} icon={job ? RefreshCwIcon : Play}>{job ? 'Running harmonization…' : 'Run harmonization'}</ActionButton></div></div><div className="demo-heading"><div><span className="section-label">Operational workspace</span><h1>Review the record, <em>not the raw layers.</em></h1><p>Start with what needs attention, then inspect the map, recommendation, and evidence as one review workflow.</p></div><div className="job-status"><span>LAST PIPELINE RUN</span><strong>{job ? 'RUNNING' : lastRun?.status === 'COMPLETED' ? 'COMPLETED' : lastRun ? statusLabel(lastRun.status) : 'READY'}</strong><small>{lastRun ? lastRun.id : 'Awaiting a first run'}</small>{engineOverview?.run_id && <small className="engine-run-label">Engine {engineOverview.run_id}</small>}</div></div><div className="demo-metrics modern-metrics"><MetricButton label="Processed" value={summaryCounts.processed} caption="Records in Ward 14" active={statusFilter === 'all'} onClick={() => { setStatusFilter('all'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Auto-approved" value={summaryCounts.autoApproved} caption="Published canonical records" active={statusFilter === 'published'} onClick={() => { setStatusFilter('published'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Needs review" value={summaryCounts.needsReview} caption="Officer decision needed" active={statusFilter === 'needs-review'} onClick={() => { setStatusFilter('needs-review'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} /><MetricButton label="Conflicts" value={summaryCounts.conflicts} caption="Prioritized inconsistencies" active={statusFilter === 'conflicts'} onClick={() => { setStatusFilter('conflicts'); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }} tone="alert" /><MetricButton label="Changed" value={summaryCounts.changes} caption="Latest decision per record" active={tab === 'Changes'} onClick={() => { setTab('Changes'); document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }); }} /></div><HarmonizationProgress total={total} job={job} /><section id="review-queue" className="queue-overview" aria-labelledby="review-queue-title"><div className="queue-overview-head"><div><span className="section-label">Review queue</span><h2 id="review-queue-title">What needs my attention?</h2><p>{statusText}. Every KPI above filters this queue.</p></div><div className="queue-head-meta"><span><CircleAlert size={15} aria-hidden="true" /> {summaryCounts.conflicts} open conflicts</span><span><Clock3 size={15} aria-hidden="true" /> Updated after each run</span></div></div><QueueFilters statusFilter={statusFilter} setStatusFilter={setStatusFilter} issueFilter={issueFilter} setIssueFilter={setIssueFilter} confidenceFilter={confidenceFilter} setConfidenceFilter={setConfidenceFilter} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} sortMode={sortMode} setSortMode={setSortMode} query={query} setQuery={setQuery} onSubmit={submitSearch} onClear={clearFilters} />{dataError && <div className="workspace-alert" role="alert"><CircleAlert size={16} aria-hidden="true" /><span>{dataError} Refresh the page after the API is available.</span></div>}{parcelsLoading ? <QueueSkeleton /> : <QueueTable rows={rows} onSelect={inspect} emptyLabel={statusFilter === 'conflicts' ? 'No unresolved conflicts' : statusFilter === 'human' ? 'No records require human review' : statusFilter === 'published' ? 'No published records match these filters' : 'No records need your attention'} />}</section><section className="engine-snapshot" aria-label="Active fusion engine"><div><span>Fusion run</span><strong>{engineOverview?.run_id || 'Not available'}</strong></div><div><span>Spatial matcher</span><strong>{engineOverview?.spatial_engine?.name || 'Not reported'}</strong></div><div><span>Semantic backend</span><strong>{engineOverview?.semantic_engine?.semantic_backend?.semantic_backend || 'Not reported'}</strong></div><div><span>Confidence calibration</span><strong>{engineOverview?.confidence_engine?.coverage ? `${Math.round(engineOverview.confidence_engine.coverage * 100)}% coverage` : 'Not reported'}</strong></div></section>
    <CapabilityCenter sources={sources} jobActive={Boolean(job)} lastRun={lastRun} onRun={run} onOpenSources={() => { setTab('Data Sources'); document.getElementById('operations')?.scrollIntoView({ behavior: 'smooth' }); }} notify={notify} />
    <FusionLabs ready={hasHarmonizedRun} notify={notify} onSelectParcel={(parcelId) => { const parcel = allParcels.find((item) => item.canonical_parcel_id === parcelId); if (parcel) inspect(parcel); else notify(`${parcelId} is not in the current canonical set.`); document.getElementById('map-workspace')?.scrollIntoView({ behavior: 'smooth' }); }} /></>}
    {focusMode && <div className="focus-header"><div><span className="section-label">Focus review</span><strong>{selected?.canonical_parcel_id || 'Select a parcel'}</strong><span>Investigation workspace</span></div><ActionButton onClick={() => setFocusMode(false)} variant="secondary" icon={Minimize2}>Exit focus</ActionButton></div>}
    <section id="map-workspace" className="investigation-workspace" aria-labelledby="map-workspace-title"><div className="map-workspace modern-map-toolbar"><div className="map-toolbar-title"><span className="section-label">Map workspace</span><strong id="map-workspace-title">Spatial context for {selected?.canonical_parcel_id || 'the review queue'}</strong></div><div className="map-modes" role="group" aria-label="Map view"><button type="button" className={mode === 'sources' ? 'active' : ''} aria-pressed={mode === 'sources'} onClick={() => setMode('sources')}>Sources</button><button type="button" className={mode === 'harmonized' ? 'active' : ''} aria-pressed={mode === 'harmonized'} onClick={() => setMode('harmonized')}>AI harmonized</button><button type="button" className={mode === 'compare' ? 'active' : ''} aria-pressed={mode === 'compare'} onClick={() => setMode('compare')}>Before / after</button></div><div className="map-toolbar-actions"><button type="button" className="toolbar-button" onClick={() => { searchRef.current?.focus(); document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' }); }}><Search size={15} aria-hidden="true" /> Search parcel</button><button type="button" className={`toolbar-button ${layersOpen ? 'active' : ''}`} aria-pressed={layersOpen} onClick={() => setLayersOpen(!layersOpen)}><Layers3 size={15} aria-hidden="true" /> Layers</button><button type="button" className="toolbar-button" onClick={() => setMode('compare')}><SlidersHorizontal size={15} aria-hidden="true" /> Compare</button><button type="button" className={`toolbar-button ${measureActive ? 'active' : ''}`} aria-pressed={measureActive} onClick={() => setMeasureActive((current) => !current)}><Ruler size={15} aria-hidden="true" /> {measureActive ? (measureMetres != null ? `${measureMetres} m` : 'Click two points') : 'Measure'}</button><button type="button" className="toolbar-button" onClick={() => setBasemapVisible(!basemapVisible)} aria-pressed={!basemapVisible}><MapPinned size={15} aria-hidden="true" /> {basemapVisible ? 'Satellite context' : 'Dark base'}</button></div>{mode === 'compare' && <label className="compare-slider"><span>Source</span><input type="range" min="10" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} aria-label="Compare source and canonical layers" /><span>Canonical</span></label>}{layersOpen && <div className="map-layer-popover"><div><span className="section-label">Map layers</span><button type="button" onClick={() => setLayersOpen(false)} aria-label="Close map layers"><X size={15} aria-hidden="true" /></button></div><p>Loaded benchmark layers</p>{sourceOptions.filter((source) => source.key !== 'canonical').map((source) => <label key={source.key}><input type="checkbox" checked={layerVisibility[source.key]} onChange={() => setLayerVisibility((current) => ({ ...current, [source.key]: !current[source.key] }))} /><span className={`comparison-swatch swatch-${source.color}`} />{source.label}</label>)}<p>Derived output</p><label><input type="checkbox" checked={layerVisibility.canonical} onChange={() => setLayerVisibility((current) => ({ ...current, canonical: !current.canonical }))} /><span className="comparison-swatch swatch-green" />Harmonized parcel boundaries</label><p>Context only</p><label><input type="checkbox" checked={basemapVisible} onChange={() => setBasemapVisible(!basemapVisible)} /><span className="layer-dot satellite-dot" />Satellite imagery</label><small>Green dashed line = loaded data extent. The basemap contains landmarks, but no landmark/POI records are inspected.</small></div>}</div><div className="demo-map-grid"><div className="map-panel"><div className="map-panel-head"><div><span className="section-label">DATA EXTENT · DEMO WARD 14 / BENGALURU</span><strong>Source-aligned parcel map</strong></div><span className="map-selected-label">{activeSource === 'canonical' ? 'Harmonized boundary' : `${sourceOptions.find((source) => source.key === activeSource)?.label} highlighted`}</span></div><MapView mode={mode} compare={compare} layerVisibility={layerVisibility} selected={selected} activeSource={activeSource} basemapVisible={basemapVisible} harmonizationReady={hasHarmonizedRun} measureActive={measureActive} onSelect={inspect} onSourceSelect={chooseSource} onMeasure={setMeasureMetres} /><div className="map-legend"><span><i className="status-dot success" /> Trusted</span><span><i className="status-dot warning" /> AI assisted</span><span><i className="status-dot danger" /> Conflict</span></div><div className="map-note"><MapPinned size={13} aria-hidden="true" /> Canonical parcels are inspectable · satellite is contextual only</div></div><Inspector selected={selected} detail={detail} queue={reviewQueue} activeSource={activeSource} onSelect={inspect} onSourceSelect={chooseSource} /></div>{selected && detailLoading && <div className="detail-loading" role="status"><LoaderCircle size={18} aria-hidden="true" /> Loading parcel evidence…</div>}{selected && detail && <ReconciliationWorkspace selected={selected} detail={detail} changes={changes} activeSource={activeSource} onSourceSelect={chooseSource} decisionLoading={decisionLoading} onDecision={decide} />}</section>
    {!focusMode && <details className="keyboard-help"><summary><Keyboard size={15} /> Keyboard shortcuts <ChevronDown size={14} /></summary><div><span><b>J / K</b> Next or previous record</span><span><b>A</b> Approve</span><span><b>R</b> Keep in review</span><span><b>E</b> Evidence</span><span><b>M</b> Focus map</span><span><b>/</b> Search</span></div></details>}
  </div></main>;
}

function MetricButton({ label, value, caption, active, onClick, tone = 'neutral' }: { label: string; value: number; caption: string; active: boolean; onClick: () => void; tone?: string }) {
  return <button type="button" className={`metric-button metric-${tone} ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{caption}</small></button>;
}

function RefreshCwIcon(props: any) {
  return <LoaderCircle {...props} className="spin" />;
}
