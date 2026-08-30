import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  CloudUpload,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileUp,
  FileText,
  Focus,
  Globe2,
  Info,
  Layers3,
  LoaderCircle,
  MapPinned,
  Menu,
  Network,
  PanelRightClose,
  PlugZap,
  Play,
  Radar,
  RefreshCw,
  ScanLine,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { ModernDemoPage } from './DemoWorkspace';

const API = '/api/v1';

type Route = 'home' | 'features' | 'architecture' | 'data-sources' | 'docs' | 'demo';
type DemoMode = 'sources' | 'harmonized' | 'compare';
type DemoTab = 'Review Queue' | 'Data Sources' | 'Changes' | 'Export';

type Parcel = {
  canonical_parcel_id: string;
  survey_number: string;
  land_use: string;
  area_sq_m: number;
  overall_confidence: number;
  review_status: string;
  conflict_type?: string;
  priority: number;
  conflict_types?: string[];
  conflict_severity?: string;
  confidence_set_size?: number;
  confidence_decision?: string;
  confidence_region?: string;
};

type Dashboard = {
  ward: string;
  started: boolean;
  summary: {
    total_parcels: number;
    harmonized: number;
    conflicts: number;
    human_review: number;
    changes: number;
  };
  review_queue: Parcel[];
  latest_job?: any;
};

type Source = {
  id: string;
  name: string;
  file: string;
  file_reference?: string;
  format: string;
  crs: string | null;
  records: number;
  status: string;
  issues: string[];
  provider_name?: string;
  dataset_type?: string;
  source_type?: string;
  feature_count?: number;
  geometry_type?: string;
  bbox?: number[] | null;
  coverage?: string;
  spatial_extent?: string;
  attribute_fields?: string[];
  schema?: { name: string; type: string }[];
  acquisition_date?: string;
  created_at?: string;
  updated_at?: string;
  version?: number;
  validation_status?: string;
  processing_status?: string;
  validation_checks?: { label: string; status: string; detail: string }[];
  eligible_for_harmonization?: boolean;
  readiness_reason?: string;
  last_harmonization_job?: string | null;
  provenance?: { organization?: string; imported_by?: string; source_reference?: string; contact_reference?: string };
  is_demo?: boolean;
  preview_url?: string | null;
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
    semantic?: { algorithm?: string; ontology?: { standard?: string; node_count?: number; triple_count?: number }; semantic_backend?: { semantic_backend?: string; status?: string; model?: string | null; embedding_dimension?: number | null; fallback_active?: boolean; error?: string | null }; mapped_field_count?: number; review_field_count?: number };
    confidence?: { coverage?: number; decision?: string; prediction_set?: any[]; region?: string; quantile?: number; threshold?: number; method?: string };
    joint?: { geometry?: number; semantic?: number; raw?: number; calibrated?: number; decision?: string; region?: string };
  };
};

type SemanticBackend = {
  semantic_backend?: string;
  status?: string;
  model?: string | null;
  embedding_dimension?: number | null;
  cache_entries?: number;
  fallback_active?: boolean;
  error?: string | null;
};

type SemanticCandidate = {
  concept: string;
  label: string;
  rollup?: string;
  semantic_similarity?: number | null;
  deterministic_similarity?: number | null;
  rerank_score?: number;
  datatype_compatible?: boolean;
  sample_value_compatible?: boolean;
};

type SemanticMapping = {
  field: string;
  field_type?: string;
  language?: string;
  target_concept?: string | null;
  target_label?: string;
  confidence?: number;
  confidence_label?: string;
  semantic_similarity?: number | null;
  semantic_margin?: number | null;
  evidence?: string[];
  retrieved_candidates?: SemanticCandidate[];
  knowledge_graph_validation?: { valid?: boolean; reason?: string };
  semantic_backend?: string;
  semantic_backend_status?: string;
};

type SemanticMatchResponse = {
  algorithm?: string;
  semantic_backend?: SemanticBackend;
  mappings: SemanticMapping[];
};

const navItems: { label: string; route: Route }[] = [
  { label: 'Product', route: 'home' },
  { label: 'Features', route: 'features' },
  { label: 'Architecture', route: 'architecture' },
  { label: 'Data Sources', route: 'data-sources' },
  { label: 'Docs', route: 'docs' },
];

const sourceTypes: { name: string; descriptor: string; icon: LucideIcon }[] = [
  { name: 'Drone imagery', descriptor: 'Recent high-resolution capture for physical change.', icon: ScanLine },
  { name: 'Orthorectified imagery', descriptor: 'Geometrically corrected imagery for alignment.', icon: Radar },
  { name: 'DSM / DTM', descriptor: 'Surface and terrain models for height context.', icon: Layers3 },
  { name: 'Cadastral maps', descriptor: 'Survey-oriented boundaries and identifiers.', icon: MapPinned },
  { name: 'Revenue records', descriptor: 'Authoritative parcel identifiers and ownership context.', icon: FileText },
  { name: 'Municipal GIS', descriptor: 'Current land use, roads, and civic layers.', icon: Building2 },
  { name: 'Utility networks', descriptor: 'Infrastructure relationships around each parcel.', icon: Network },
  { name: 'Ground truthing', descriptor: 'Field observations that resolve ambiguity.', icon: Focus },
  { name: 'GNSS / CORS', descriptor: 'Survey control for precise georeferencing.', icon: Target },
  { name: 'AI building footprints', descriptor: 'Machine-extracted structures from imagery.', icon: ScanLine },
];

const capabilities: { number: string; name: string; description: string; icon: LucideIcon; metric: string }[] = [
  { number: '01', name: 'Graph spatial matching', description: 'Links imperfect representations through morphology, absolute position, neighbourhood relationships, and globally optimal many-to-many assignment.', icon: Network, metric: 'Graph · GNN · Hungarian' },
  { number: '02', name: 'Topology correction', description: 'Surfaces gaps, overlaps, slivers, duplicates, and invalid rings before they become part of a canonical record.', icon: ScanLine, metric: 'Validity · overlap · repair' },
  { number: '03', name: 'LADM attribute mapping', description: 'Maps multilingual land-record fields to ISO 19152 concepts with retrieval, rollup/drilldown reranking, and graph validation.', icon: Table2, metric: 'LADM · KG · confidence' },
  { number: '04', name: 'CRS normalization', description: 'Brings mixed spatial reference systems into a common working frame with an explicit transformation trail.', icon: Globe2, metric: 'EPSG:4326 · transform' },
  { number: '05', name: 'Change detection', description: 'Separates genuine physical change from surveying and GIS error so teams can prioritize the records that moved.', icon: RefreshCw, metric: 'Temporal · footprint · delta' },
  { number: '06', name: 'Conflict resolution', description: 'Turns disagreement into a reviewable decision: conflicting sources, preferred evidence, and recommended action.', icon: CircleAlert, metric: 'Severity · impact · action' },
  { number: '07', name: 'Conformal confidence', description: 'Wraps spatial matching and semantic evidence in a locally weighted 95% confidence set that can return null or route to review.', icon: BarChart3, metric: '95% set · spatial calibration' },
];

const pipelineStages = [
  { label: 'Ingest', detail: '10 source classes' },
  { label: 'Extract', detail: 'Features + attributes' },
  { label: 'Match', detail: 'Entity resolution' },
  { label: 'Repair', detail: 'Topology + CRS' },
  { label: 'Resolve', detail: 'Evidence ranking' },
  { label: 'Score', detail: 'Confidence + impact' },
  { label: 'Publish', detail: 'Canonical record' },
];

const techStack = [
  ['AI / ML', 'PyTorch Geometric · foundation adapters'],
  ['GeoAI', 'GeoPandas · Shapely'],
  ['Web GIS', 'React · MapLibre'],
  ['Spatial DB', 'PostgreSQL · PostGIS'],
  ['Schema AI', 'Multilingual embeddings · LADM / RDF'],
  ['ETL', 'GDAL · Rasterio'],
  ['Computer vision', 'OpenCV · segmentation'],
  ['API', 'FastAPI · REST'],
  ['Uncertainty', 'Spatial conformal prediction'],
  ['Runtime', 'Docker · cloud-ready'],
];

const docs = [
  { slug: 'overview', label: 'Platform overview', kicker: 'FOUNDATION', title: 'A canonical record over imperfect sources', summary: 'UrbanLand Fusion AI preserves source identity while creating a reconciled, confidence-aware view for every parcel.' },
  { slug: 'schemas', label: 'Data schema reference', kicker: 'DATA MODEL', title: 'The Canonical Urban Land Record', summary: 'Every record carries its geometry, attributes, evidence, confidence set, review status, and source lineage.' },
  { slug: 'api', label: 'API overview', kicker: 'INTEGRATION', title: 'Simple endpoints for operational workflows', summary: 'The prototype exposes graph runs, LADM schema matching, dashboard layers, parcel evidence, decisions, jobs, and export endpoints.' },
  { slug: 'integration', label: 'Integration guide', kicker: 'DEPLOYMENT', title: 'From ward pilot to city-scale service', summary: 'Asynchronous processing and PostGIS provide a straightforward path from a controlled demo to production operations.' },
  { slug: 'confidence', label: 'Confidence methodology', kicker: 'EXPLAINABILITY', title: 'Calibrated decisions with a safe review fork', summary: 'A spatially weighted conformal predictor turns evidence into a calibrated set, an automatic merge, or an explicit human-review case.' },
];

const routeFromPath = (): Route => {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '/features') return 'features';
  if (path === '/architecture') return 'architecture';
  if (path === '/data-sources') return 'data-sources';
  if (path === '/docs') return 'docs';
  if (path === '/demo') return 'demo';
  return 'home';
};

const formatNumber = (value?: number) => value === undefined ? '—' : new Intl.NumberFormat('en-IN').format(value);
const formatConfidence = (value?: number) => value === undefined ? '—' : `${Math.round(value * 100)}%`;
const titleCase = (value?: string) => value ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Cross-source agreement';
const toParcel = (properties: any): Parcel => ({
  canonical_parcel_id: String(properties.canonical_parcel_id ?? properties.id),
  survey_number: String(properties.survey_number ?? 'Not available'),
  land_use: String(properties.land_use ?? 'Unclassified'),
  area_sq_m: Number(properties.area_sq_m ?? 0),
  overall_confidence: Number(properties.overall_confidence ?? 0),
  review_status: String(properties.review_status ?? 'HUMAN_REVIEW'),
  conflict_type: properties.conflict_type || undefined,
  priority: Number(properties.priority ?? 0),
  conflict_types: properties.conflict_types ?? (properties.conflict_type ? [properties.conflict_type] : []),
  conflict_severity: properties.conflict_severity || undefined,
  confidence_set_size: Number(properties.confidence_set_size ?? 0),
  confidence_decision: properties.confidence_decision || undefined,
  confidence_region: properties.confidence_region || undefined,
});

const sourceApi = {
  list: async () => (await fetch(`${API}/sources`)).json() as Promise<{ sources: Source[] }>,
  detail: async (sourceId: string) => (await fetch(`${API}/sources/${sourceId}`)).json() as Promise<Source>,
  upload: async (form: FormData) => {
    const response = await fetch(`${API}/sources/upload`, { method: 'POST', body: form });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.detail || 'The source could not be processed.'); }
    return response.json() as Promise<Source>;
  },
  sample: async () => {
    const response = await fetch(`${API}/sources/sample`, { method: 'POST' });
    if (!response.ok) throw new Error('The demo source bundle could not be loaded.');
    const result = await response.json() as { sources: Source[]; source_ids: string[]; dataset_name: string };
    return { ...result, source_ids: result.source_ids.filter((id) => result.sources.some((source) => source.id === id && sourceIsEligible(source))) };
  },
  archive: async (sourceId: string) => {
    const response = await fetch(`${API}/sources/${sourceId}/archive`, { method: 'POST' });
    if (!response.ok) throw new Error('The source could not be archived.');
    return response.json() as Promise<Source>;
  },
};

const sourceTypeLabel = (source: Source) => source.dataset_type || source.source_type || 'Unclassified source';
const sourceProviderLabel = (source: Source) => source.provider_name || 'Authorized provider';
const sourceStatusLabel = (status?: string) => status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown';
const sourceIsEligible = (source: Source) => source.eligible_for_harmonization !== false && source.status !== 'ARCHIVED';
const sourceUpdatedLabel = (source: Source) => source.updated_at ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(source.updated_at)) : 'Not available';

function navigateTo(route: Route) {
  const path = route === 'home' ? '/' : `/${route}`;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <button className={`brand ${compact ? 'brand-compact' : ''}`} onClick={() => navigateTo('home')} aria-label="UrbanLand Fusion AI home">
    <span className="brand-mark"><span>UL</span><i /></span>
    <span className="brand-copy"><strong>UrbanLand</strong><span>Fusion AI</span></span>
  </button>;
}

function Button({ children, onClick, variant = 'primary', icon: Icon, href, type = 'button', disabled = false }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'text'; icon?: LucideIcon; href?: string; type?: 'button' | 'submit'; disabled?: boolean }) {
  const content = <>{children}{Icon && <Icon size={16} strokeWidth={1.7} />}</>;
  if (href) return <a className={`button button-${variant}`} href={href} onClick={(event) => { if (href.startsWith('/')) { event.preventDefault(); navigateTo(href === '/' ? 'home' : href.slice(1) as Route); } }}>{content}</a>;
  return <button type={type} className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{content}</button>;
}

function Pill({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'green' | 'amber' }) {
  return <span className={`pill pill-${tone}`}><i />{children}</span>;
}

function SectionHeader({ eyebrow, title, description, align = 'left' }: { eyebrow: string; title: string; description?: string; align?: 'left' | 'center' }) {
  return <div className={`section-header section-header-${align}`}>
    <span className="eyebrow">{eyebrow}</span>
    <h2>{title}</h2>
    {description && <p>{description}</p>}
  </div>;
}

function SiteNav({ route }: { route: Route }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <header className={`site-nav ${scrolled ? 'site-nav-scrolled' : ''}`}>
    <div className="nav-inner">
      <Brand />
      <nav className="nav-links" aria-label="Main navigation">
        {navItems.map((item) => <button key={item.label} className={route === item.route ? 'active' : ''} onClick={() => navigateTo(item.route)}>{item.label}</button>)}
      </nav>
      <div className="nav-actions"><Button href="/demo" variant="secondary" icon={ArrowUpRight}>Request a demo</Button><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">{mobileOpen ? <X size={19} /> : <Menu size={19} />}</button></div>
    </div>
    {mobileOpen && <nav className="mobile-nav">{navItems.map((item) => <button key={item.label} onClick={() => { navigateTo(item.route); setMobileOpen(false); }}>{item.label}<ArrowRight size={15} /></button>)}<Button href="/demo" variant="primary">Request a demo</Button></nav>}
  </header>;
}

function Footer() {
  return <footer className="site-footer"><div className="footer-top"><div><Brand compact /><p>Evidence-backed land records for<br />interoperable urban administration.</p></div><div className="footer-links"><div><span>Explore</span><button onClick={() => navigateTo('features')}>Features</button><button onClick={() => navigateTo('architecture')}>Architecture</button><button onClick={() => navigateTo('demo')}>Live demo</button></div><div><span>Resources</span><button onClick={() => navigateTo('docs')}>Documentation</button><a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">API reference</a><a href="/api/v1/export/canonical.geojson">Sample export</a></div></div></div><div className="footer-bottom"><span>URBANLAND FUSION AI · DEMO WARD 14</span><span>Built for accountable automation</span></div></footer>;
}

function HeroArtifact() {
  const lanes = [
    { label: 'CADASTRAL', color: 'blue', d: 'M20 88 L110 67 L190 87 L170 142 L76 151 Z', opacity: 0.7 },
    { label: 'MUNICIPAL', color: 'violet', d: 'M36 104 L119 74 L205 96 L180 155 L84 161 Z', opacity: 0.7 },
    { label: 'DRONE / ORI', color: 'amber', d: 'M45 75 L130 61 L213 82 L185 132 L76 145 Z', opacity: 0.65 },
  ];
  return <div className="hero-artifact" aria-label="Illustration of source boundaries resolving into a canonical parcel">
    <div className="artifact-head"><span><i className="live-dot" /> RESOLUTION TRACE</span><code>WARD-14 / 2026.07</code></div>
    <div className="artifact-canvas">
      <div className="artifact-side artifact-before"><span className="artifact-label">source layers</span><svg viewBox="0 0 240 190" role="img" aria-hidden="true">{lanes.map((lane) => <path key={lane.label} className={`parcel-line ${lane.color}`} d={lane.d} opacity={lane.opacity} />)}<path className="parcel-line red" d="M28 116 L125 92 L181 109 L158 171 L63 158 Z" /><line className="guide-line" x1="25" y1="49" x2="219" y2="164" /><line className="guide-line" x1="54" y1="173" x2="215" y2="58" /></svg><div className="artifact-legend"><span><i className="legend-blue" />Cadastral</span><span><i className="legend-violet" />Municipal</span><span><i className="legend-amber" />Drone</span></div></div>
      <div className="artifact-connector"><span>RECONCILE</span><ArrowRight size={18} /></div>
      <div className="artifact-side artifact-after"><span className="artifact-label">canonical output</span><svg viewBox="0 0 240 190" role="img" aria-hidden="true"><path className="parcel-fill" d="M27 116 L57 52 L158 40 L214 91 L181 160 L74 164 Z" /><path className="parcel-outline" d="M27 116 L57 52 L158 40 L214 91 L181 160 L74 164 Z" /><path className="parcel-inner" d="M57 52 L74 164 M158 40 L181 160 M27 116 L214 91" /><circle className="point" cx="57" cy="52" r="4" /><circle className="point" cx="214" cy="91" r="4" /></svg><div className="confidence-badge"><BadgeCheck size={15} /><span><b>98.2%</b><small>match confidence</small></span></div></div>
    </div>
    <div className="artifact-foot"><span><i className="status-dot success" /> 4 sources aligned</span><span><i className="status-dot warning" /> 1 review signal</span><span className="artifact-id">CULR-56000064</span></div>
  </div>;
}

function PipelineDiagram({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState(5);
  return <div className={`pipeline-diagram ${compact ? 'pipeline-compact' : ''}`}>
    <div className="pipeline-track" />
    {pipelineStages.map((stage, index) => <button key={stage.label} className={`pipeline-stage ${index === active ? 'active' : ''} ${index < active ? 'passed' : ''}`} onClick={() => setActive(index)}><span className="pipeline-number">{String(index + 1).padStart(2, '0')}</span><span className="pipeline-node"><i /></span><strong>{stage.label}</strong><small>{stage.detail}</small>{index < pipelineStages.length - 1 && <ArrowRight className="pipeline-arrow" size={15} />}</button>)}
    {!compact && <div className="pipeline-caption"><span><i className="status-dot success" /> Completed stage</span><span><i className="status-dot blue" /> Evidence is carried forward at every step</span></div>}
  </div>;
}

function DataSourceGrid() {
  return <div className="source-grid">{sourceTypes.map(({ name, descriptor, icon: Icon }) => <article className="source-card" key={name}><span className="icon-box"><Icon size={19} strokeWidth={1.5} /></span><div><h3>{name}</h3><p>{descriptor}</p></div></article>)}</div>;
}

function CapabilityGrid({ detailed = false }: { detailed?: boolean }) {
  return <div className={`capability-grid ${detailed ? 'capability-grid-detailed' : ''}`}>{capabilities.map(({ number, name, description, icon: Icon, metric }) => <article className="capability-card" key={name}><div className="capability-top"><span className="capability-number">{number}</span><Icon size={21} strokeWidth={1.5} /></div><h3>{name}</h3><p>{description}</p><code>{metric}</code>{detailed && <div className="capability-footer"><span>Explainable by design</span><ArrowUpRight size={14} /></div>}</article>)}</div>;
}

function MetricsBand({ dashboard }: { dashboard?: Dashboard }) {
  const total = dashboard?.summary.total_parcels ?? 72;
  return <section className="metrics-band"><div className="metrics-inner"><div className="metric"><strong>{total}</strong><span>demo parcels reconciled</span><small>Deterministic ward benchmark</small></div><div className="metric"><strong>10</strong><span>source classes unified</span><small>Raster · vector · tabular</small></div><div className="metric"><strong>8</strong><span>conflict types injected</span><small>Known cases for evaluation</small></div><div className="metric"><strong>90<span>%</span></strong><span>benchmark F1 target</span><small>Target, not a production claim</small></div></div></section>;
}

function TechStackBand() {
  return <section className="tech-band"><div className="page-container"><div className="tech-intro"><span className="eyebrow">THE BUILD</span><p>A focused stack for spatial data that needs to be inspected, explained, and trusted.</p></div><div className="tech-list">{techStack.map(([name, value]) => <div key={name}><code>{name}</code><span>{value}</span></div>)}</div></div></section>;
}

function HomePage({ dashboard }: { dashboard?: Dashboard }) {
  return <><main>
    <section className="hero-section"><div className="page-container hero-grid"><div className="hero-copy"><Pill>NAKSHA PROGRAMME · GEOSPATIAL AI</Pill><h1>One trusted parcel record, <em>backed by evidence.</em></h1><p className="hero-lede">Reconcile cadastral, municipal, revenue, survey, and imagery data into a canonical urban land record—without losing the source trail.</p><div className="hero-actions"><Button href="/demo" icon={ArrowUpRight}>Explore the live demo</Button><Button href="/architecture" variant="secondary" icon={ArrowRight}>View architecture</Button></div><div className="hero-proof"><span><ShieldCheck size={15} /> Human approval stays in control</span><span><FileCheck2 size={15} /> Every decision keeps its provenance</span></div></div><HeroArtifact /></div><div className="hero-grid-lines" /></section>
    <section className="problem-section section-padding"><div className="page-container problem-grid"><div><span className="eyebrow">THE PROBLEM</span><h2>Fragmented records create uncertainty exactly where decisions need confidence.</h2></div><div className="problem-copy"><p>Urban land information lives across departments, formats, coordinate systems, and capture dates. Aligning it by hand slows cadastral finalization and makes corrections hard to audit.</p><p>UrbanLand Fusion AI creates a shared spatial truth layer that shows what matched, what conflicted, why a decision was recommended, and when a person should review it.</p><a className="inline-link" href="/features" onClick={(event) => { event.preventDefault(); navigateTo('features'); }}>See how the platform resolves disagreement <ArrowUpRight size={15} /></a></div></div></section>
    <section className="section-padding"><div className="page-container"><SectionHeader eyebrow="01 / INPUTS" title="One workspace for every land record source" description="The system is designed around the real shape of urban land information: mixed, imperfect, and owned by different departments." /><DataSourceGrid /></div></section>
    <section className="section-padding section-dark"><div className="page-container"><SectionHeader eyebrow="02 / PIPELINE" title="From source layers to a canonical record" description="A traceable pipeline carries geometry, attribute, temporal, and survey evidence forward into every decision." /><PipelineDiagram /></div></section>
    <section className="section-padding"><div className="page-container"><SectionHeader eyebrow="03 / CAPABILITIES" title="Automation with a clear handoff to human judgment" description="Each capability produces an inspectable signal—not a black-box answer." /><CapabilityGrid /></div></section>
    <MetricsBand dashboard={dashboard} />
    <TechStackBand />
    <section className="cta-section section-padding"><div className="page-container cta-card"><div><span className="eyebrow">READY FOR INSPECTION</span><h2>See one imperfect ward become a trusted working layer.</h2><p>Walk through the live map, open a conflict, and inspect the evidence behind the recommendation.</p></div><Button href="/demo" icon={ArrowUpRight}>Open the ward demo</Button></div></section>
  </main><Footer /></>;
}

function PageHero({ eyebrow, title, description }: { eyebrow: string; title: ReactNode; description: string }) {
  return <section className="page-hero"><div className="page-container page-hero-inner"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div></section>;
}

function FeaturesPage() {
  return <><main><PageHero eyebrow="FEATURES / 7 CORE CAPABILITIES" title={<>A system that can say <em>why.</em></>} description="UrbanLand Fusion AI turns spatial disagreement into an explainable workflow: match the entities, weigh the evidence, surface the conflict, and keep an officer in control." />
    <section className="section-padding"><div className="page-container"><CapabilityGrid detailed /></div></section>
    <section className="section-padding section-dark"><div className="page-container feature-split"><div><SectionHeader eyebrow="MATCHING SIGNALS" title="Evidence is a stack, not a single winner." description="A parcel match combines spatial similarity with source reliability, freshness, survey accuracy, and cross-source agreement." /><div className="signal-list"><div><span>01</span><div><strong>Spatial similarity</strong><p>IoU, centroid distance, boundary distance, and shape.</p></div><b>0.96</b></div><div><span>02</span><div><strong>Source reliability</strong><p>Attribute-specific evidence weights instead of a global hierarchy.</p></div><b>0.93</b></div><div><span>03</span><div><strong>Temporal consistency</strong><p>Recent capture is considered when a physical change is plausible.</p></div><b>0.89</b></div></div></div><MatchingVisual /></div></section>
    <section className="section-padding"><div className="page-container impact-grid"><div><span className="eyebrow">IMPACT-AWARE REVIEW</span><h2>Let officials spend time where the decision matters.</h2><p>Priority is more than low confidence. It combines uncertainty, conflict severity, change magnitude, and spatial impact—so a high-consequence case reaches the top of the queue.</p></div><div className="priority-card"><div className="priority-card-head"><span>REVIEW PRIORITY</span><strong>98</strong></div><div className="priority-row"><span>Boundary conflict</span><b>high</b></div><div className="priority-row"><span>Area discrepancy</span><b>+8.4%</b></div><div className="priority-row"><span>Recent building change</span><b>detected</b></div><div className="priority-bar"><i /></div><small>CULR-56000064 · human review recommended</small></div></div></section>
  </main><Footer /></>;
}

function MatchingVisual() {
  return <div className="matching-visual"><div className="matching-graph"><div className="match-node node-revenue"><FileText size={16} /><span>Revenue<br /><b>125/4</b></span></div><div className="match-node node-canonical"><BadgeCheck size={18} /><span>Canonical<br /><b>CULR-56000064</b></span></div><div className="match-node node-drone"><ScanLine size={16} /><span>Drone / ORI<br /><b>footprint</b></span></div><div className="match-node node-gnss"><Target size={16} /><span>GNSS / CORS<br /><b>survey</b></span></div><svg viewBox="0 0 440 300" aria-hidden="true"><path d="M97 99 C147 111 157 135 192 148" /><path d="M345 91 C298 105 288 135 250 148" /><path d="M109 236 C154 222 174 196 197 171" /><circle cx="155" cy="125" r="3" /><circle cx="294" cy="117" r="3" /><circle cx="161" cy="210" r="3" /></svg></div><div className="matching-result"><span>ENTITY RESOLUTION</span><strong>0.96</strong><small>same real-world feature</small><div><i /><i /><i /><i /><i /></div></div></div>;
}

function ArchitectureDiagram() {
  const bands = [
    { label: 'DATA INGESTION', sub: 'formats · quality · CRS', items: ['GeoJSON', 'CSV', 'Raster / imagery'], tone: 'band-one' },
    { label: 'PROCESSING + AI', sub: 'feature extraction · matching · resolution', items: ['Spatial matching', 'Topology repair', 'Conflict resolution', 'Confidence scoring'], tone: 'band-two' },
    { label: 'SPATIAL DATABASE', sub: 'canonical records · provenance · versions', items: ['PostgreSQL', 'PostGIS', 'Entity graph'], tone: 'band-three' },
    { label: 'API + INTEGRATION', sub: 'jobs · review · exports', items: ['FastAPI', 'Async jobs', 'Audit events'], tone: 'band-four' },
    { label: 'CONSUMPTION', sub: 'operators · departments · services', items: ['Web GIS', 'Review queue', 'GeoJSON / CSV'], tone: 'band-five' },
  ];
  return <div className="architecture-diagram">{bands.map((band, index) => <div className={`architecture-band ${band.tone}`} key={band.label}><div className="architecture-label"><span>{String(index + 1).padStart(2, '0')}</span><strong>{band.label}</strong><small>{band.sub}</small></div><div className="architecture-items">{band.items.map((item) => <span key={item}>{item}</span>)}</div>{index < bands.length - 1 && <ArrowDown className="architecture-arrow" size={16} />}</div>)}</div>;
}

function ArchitecturePage() {
  return <><main><PageHero eyebrow="ARCHITECTURE / SYSTEM DESIGN" title={<>A layered system for <em>spatial truth.</em></>} description="The interface is only the visible edge. Underneath it, a production path keeps source records, processing jobs, canonical outputs, and human decisions connected." />
    <section className="section-padding"><div className="page-container"><ArchitectureDiagram /></div></section>
    <section className="section-padding section-dark"><div className="page-container architecture-copy"><div><SectionHeader eyebrow="COORDINATE TRANSFORMATION" title="Normalize first. Compare second." description="Every spatial layer enters through a controlled ingestion boundary. CRS is detected, normalized, and recorded before matching begins, so a disagreement in geometry cannot be confused with a projection mismatch." /></div><div className="code-card"><div className="code-card-head"><span><i /> transform.pipeline</span><code>EPSG / 4326</code></div><pre>{`source.geometry\n  → detect_crs()\n  → normalize_to(EPSG:4326)\n  → validate_geometry()\n  → match_candidates()\n  → persist_provenance()`}</pre><div className="code-card-foot"><Check size={14} /> Transformation trail retained with the record</div></div></div></section>
    <section className="section-padding"><div className="page-container architecture-principles"><div><span className="eyebrow">DESIGN PRINCIPLES</span><h2>Built for accountability at the point of uncertainty.</h2></div><div className="principle-grid"><article><ShieldCheck size={20} /><h3>Human approval</h3><p>AI recommends. Authorized officers publish legally significant changes.</p></article><article><Network size={20} /><h3>Source lineage</h3><p>Canonical values never erase the records and evidence that produced them.</p></article><article><Server size={20} /><h3>Async by default</h3><p>Raster work and large harmonization jobs stay separate from transactional API calls.</p></article></div></div></section>
  </main><Footer /></>;
}

function DocsPage() {
  const [slug, setSlug] = useState('overview');
  const doc = docs.find((item) => item.slug === slug) ?? docs[0];
  const currentIndex = docs.findIndex((item) => item.slug === slug);
  const nextDoc = docs[(currentIndex + 1) % docs.length];
  return <><main className="docs-page"><div className="page-container docs-layout"><aside className="docs-sidebar"><span className="eyebrow">DOCUMENTATION</span><h1>UrbanLand docs</h1><p>Understand the data model, decisions, and integration surface.</p><div className="docs-nav">{docs.map((item) => <button key={item.slug} className={item.slug === slug ? 'active' : ''} onClick={() => setSlug(item.slug)}><span>{item.kicker}</span>{item.label}<ArrowRight size={14} /></button>)}</div><div className="docs-version"><span>DEMO API</span><code>v0.2.0</code></div></aside><article className="docs-content"><div className="docs-breadcrumb">Docs <span>/</span> {doc.label}</div><span className="eyebrow">{doc.kicker}</span><h2>{doc.title}</h2><p className="docs-lede">{doc.summary}</p><DocsBody slug={doc.slug} /><div className="docs-next"><button onClick={() => setSlug(nextDoc.slug)}>Next: {nextDoc.label}<ArrowRight size={15} /></button></div></article><aside className="docs-toc"><span>ON THIS PAGE</span><a href="#model">Core model</a><a href="#signals">Decision signals</a><a href="#next">What comes next</a></aside></div></main><Footer /></>;
}

function DocsBody({ slug }: { slug: string }) {
  if (slug === 'confidence') return <div className="docs-body"><h3 id="model">Spatial conformal calibration</h3><p>Confidence combines graph agreement, LADM-validated attribute evidence, temporal freshness, survey accuracy, and cross-source consistency before a locally weighted split-conformal wrapper is applied.</p><div className="score-equation"><span>graph agreement</span><b>+</b><span>LADM evidence</span><b>+</b><span>spatial calibration</span><strong>-&gt;</strong><em>95% confidence set</em></div><h3 id="signals">Safe thresholds</h3><p>A singleton set can be auto-resolved when its calibrated confidence clears the merge threshold. Ambiguous, high-impact, or null predictions are routed to human review.</p></div>;
  if (slug === 'schemas') return <div className="docs-body"><h3 id="model">Core model</h3><p>The canonical record is a durable view over source entities, not a destructive merge. It keeps the geometry and attributes that are currently trusted, alongside the provenance needed to explain each field.</p><div className="schema-card"><code>canonical_parcels</code><div><span>canonical_parcel_id</span><b>CULR-56000064</b></div><div><span>geometry_confidence</span><b>0.94</b></div><div><span>conformal_confidence</span><b>0.95 coverage</b></div><div><span>review_status</span><b>HUMAN_REVIEW</b></div></div><h3 id="signals">LADM relationships</h3><p>Spatial Unit, Party, Administrative Unit, and RRR concepts validate field mappings before they enter the canonical record.</p></div>;
  if (slug === 'api') return <div className="docs-body"><h3 id="model">Operational surface</h3><p>The prototype exposes the workflow in small, composable endpoints that can be replaced by a job queue and PostGIS-backed persistence as the system scales.</p><div className="endpoint-list"><div><span className="method get">GET</span><code>/api/v1/engines/overview</code><small>Engine configuration and benchmark metrics</small></div><div><span className="method post">POST</span><code>/api/v1/engines/schema-match</code><small>Run LADM rollup/drilldown mapping</small></div><div><span className="method get">GET</span><code>/api/v1/layers/:name</code><small>GeoJSON source and canonical layers</small></div><div><span className="method post">POST</span><code>/api/v1/harmonization/jobs</code><small>Execute the explainable fusion pipeline</small></div></div><h3 id="signals">Response shape</h3><p>Parcel responses contain graph matches, source evidence, LADM validation, conformal decision sets, recommendation text, and lineage.</p></div>;
  if (slug === 'integration') return <div className="docs-body"><h3 id="model">Deployment path</h3><p>The demo runs as a small Docker Compose stack: a React/MapLibre web client, a FastAPI service, and a PostgreSQL/PostGIS foundation.</p><div className="integration-steps"><div><b>01</b><span>Upload</span><small>GeoJSON · CSV · raster</small></div><div><b>02</b><span>Audit</span><small>Quality + CRS checks</small></div><div><b>03</b><span>Harmonize</span><small>Async processing job</small></div><div><b>04</b><span>Review</span><small>Evidence-led decisions</small></div></div><h3 id="signals">Production increments</h3><p>Persist datasets and audit history in PostGIS, add role-based access, move processing to a queue, and train the matching model on labeled source pairs.</p></div>;
  return <div className="docs-body"><h3 id="model">One source of spatial truth</h3><p>Traditional GIS integration stops at aligning layers. UrbanLand Fusion AI goes further: it creates a persistent canonical record and preserves the relationship between each source entity, the evidence it contributes, and the decision made.</p><div className="quote-card"><Sparkles size={17} /><p>“Which representation is most reliable for this parcel—and how confident are we?”</p></div><h3 id="signals">The review loop</h3><p>Ingest, normalize, match, reconcile, score, and route. Every low-confidence or high-impact case stays visible to an authorized officer.</p><div className="docs-flow"><span>sources</span><ArrowRight size={15} /><span>evidence</span><ArrowRight size={15} /><span>canonical record</span><ArrowRight size={15} /><span>human review</span></div></div>;
}

function StatusBadge({ source }: { source: Source }) {
  const status = source.status || source.validation_status || 'UNKNOWN';
  const tone = status === 'READY' || status === 'CONNECTED' ? 'ready' : status === 'ARCHIVED' ? 'archived' : status.includes('WARNING') || status === 'NEEDS_METADATA' ? 'warning' : status.includes('PROCESS') || status === 'VALIDATING' ? 'processing' : status.includes('FAILED') ? 'failed' : 'ready';
  const Icon = tone === 'ready' ? CircleCheck : tone === 'warning' || tone === 'failed' ? CircleAlert : tone === 'processing' ? LoaderCircle : Archive;
  return <span className={`source-status-badge status-${tone}`}><Icon size={14} strokeWidth={1.8} />{sourceStatusLabel(status)}</span>;
}

function SourcePreviewMap({ source }: { source: Source }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  useEffect(() => {
    if (!containerRef.current || source.source_type !== 'Vector') return;
    const instance = new maplibregl.Map({ container: containerRef.current, center: [77.597, 12.971], zoom: 14, attributionControl: false, style: { version: 8, sources: { satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } }, layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }] } as any });
    instance.on('load', async () => {
      try {
        const response = await fetch(`${API}/sources/${source.id}/preview`);
        if (!response.ok) { setState('empty'); return; }
        const data = await response.json();
        if (!data.features?.length) { setState('empty'); return; }
        instance.addSource('source-preview', { type: 'geojson', data });
        instance.addLayer({ id: 'source-preview-fill', type: 'fill', source: 'source-preview', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#3b82f6', 'fill-opacity': .18 } });
        instance.addLayer({ id: 'source-preview-line', type: 'line', source: 'source-preview', paint: { 'line-color': '#93c5fd', 'line-width': 1.7, 'line-opacity': .9 } });
        instance.addLayer({ id: 'source-preview-points', type: 'circle', source: 'source-preview', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#3b82f6', 'circle-radius': 4, 'circle-stroke-color': '#dbeafe', 'circle-stroke-width': 1 } });
        if (source.bbox?.length === 4) instance.fitBounds([[source.bbox[0], source.bbox[1]], [source.bbox[2], source.bbox[3]]] as any, { padding: 35, maxZoom: 16, duration: 0 });
        setState('ready');
      } catch { setState('error'); }
    });
    return () => instance.remove();
  }, [source.id, source.source_type, source.bbox]);
  if (source.source_type !== 'Vector') return <div className="preview-empty"><Database size={20} /><strong>Tabular source</strong><span>This dataset has no geometry preview.</span></div>;
  return <div className="source-preview"><div ref={containerRef} className="source-preview-map" />{state === 'loading' && <div className="preview-overlay"><LoaderCircle size={17} className="spin" /> Loading spatial preview…</div>}{state === 'empty' && <div className="preview-overlay"><Info size={17} /> No preview geometry is available.</div>}{state === 'error' && <div className="preview-overlay"><CircleAlert size={17} /> Preview unavailable. The source remains inspectable.</div>}<div className="preview-caption"><MapPinned size={13} /> Dataset extent · {source.coverage || 'Not specified'}</div></div>;
}

function SourceDetailsDrawer({ source, onClose }: { source: Source; onClose: () => void }) {
  const [detail, setDetail] = useState<Source>(source);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    setLoading(true);
    sourceApi.detail(source.id).then(setDetail).catch(() => setDetail(source)).finally(() => setLoading(false));
    return () => { document.body.style.overflow = ''; };
  }, [source]);
  const checks = detail.validation_checks ?? [];
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="source-drawer" role="dialog" aria-modal="true" aria-labelledby="source-drawer-title"><div className="drawer-head"><div><span className="eyebrow">SOURCE INSPECTION</span><h2 id="source-drawer-title">{detail.name}</h2><p>{detail.file_reference || detail.file}</p></div><button className="drawer-close" onClick={onClose} aria-label="Close source details"><PanelRightClose size={18} /></button></div>{loading && <div className="drawer-loading"><LoaderCircle size={16} className="spin" /> Refreshing source metadata…</div>}<div className="drawer-scroll"><div className="drawer-status-row"><StatusBadge source={detail} /><span className={sourceIsEligible(detail) ? 'ready-copy' : 'attention-copy'}>{sourceIsEligible(detail) ? 'Ready for Harmonization' : 'Not Ready'}</span></div><div className="drawer-section"><span className="drawer-section-label">OVERVIEW</span><div className="drawer-facts"><div><span>Provider</span><b>{sourceProviderLabel(detail)}</b></div><div><span>Dataset type</span><b>{sourceTypeLabel(detail)}</b></div><div><span>Source format</span><b>{detail.format}</b></div><div><span>Version</span><b>v{detail.version ?? 1}</b></div><div><span>Acquisition date</span><b>{detail.acquisition_date || 'Not provided'}</b></div><div><span>Updated</span><b>{sourceUpdatedLabel(detail)}</b></div></div></div><div className="drawer-section"><span className="drawer-section-label">SPATIAL PREVIEW</span><SourcePreviewMap source={detail} /></div><div className="drawer-section"><span className="drawer-section-label">SPATIAL INFORMATION</span><div className="drawer-facts"><div><span>CRS</span><b>{detail.crs || 'Missing'}</b></div><div><span>Feature count</span><b>{formatNumber(detail.feature_count ?? detail.records)}</b></div><div><span>Geometry type</span><b>{detail.geometry_type || 'Not detected'}</b></div><div><span>Coverage</span><b>{detail.coverage || 'Not specified'}</b></div><div><span>Extent</span><b>{detail.spatial_extent || 'Not available'}</b></div></div></div><div className="drawer-section"><span className="drawer-section-label">SCHEMA</span><div className="schema-fields">{(detail.schema?.length ? detail.schema : (detail.attribute_fields ?? []).map((name) => ({ name, type: 'string' }))).map((field) => <div key={field.name}><code>{field.name}</code><span>{field.type}</span></div>)}{!detail.schema?.length && !detail.attribute_fields?.length && <span className="muted-inline">No attribute fields were detected.</span>}</div></div><div className="drawer-section"><span className="drawer-section-label">VALIDATION</span><div className="validation-checks">{checks.map((check) => <div key={check.label} className={`check-${check.status}`}><span>{check.status === 'passed' ? <Check size={14} /> : check.status === 'warning' ? <CircleAlert size={14} /> : <Info size={14} />}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div><b>{sourceStatusLabel(check.status)}</b></div>)}</div></div><div className="drawer-section"><span className="drawer-section-label">SOURCE PROVENANCE</span><div className="provenance-card"><div><span>Organization</span><b>{detail.provenance?.organization || sourceProviderLabel(detail)}</b></div><div><span>Imported by</span><b>{detail.provenance?.imported_by || 'Authorized source operator'}</b></div><div><span>Submitted</span><b>{detail.created_at ? new Date(detail.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'}</b></div><div><span>Harmonization job</span><b>{detail.last_harmonization_job || 'Not used yet'}</b></div></div></div><div className={`readiness-callout ${sourceIsEligible(detail) ? 'ready' : 'blocked'}`}><span className="drawer-section-label">HARMONIZATION READINESS</span><strong>{sourceIsEligible(detail) ? 'Ready for Harmonization' : 'Not Ready'}</strong><p>{detail.readiness_reason || 'Readiness status is supplied by the source service.'}</p></div></div></aside></div>;
}

type AddDraft = { providerType: string; providerName: string; reference: string; method: 'upload' | 'connect' | 'sample' | null; file: File | null; datasetName: string; datasetType: string; acquisitionDate: string; epsgCode: string; coverage: string; description: string };
const initialAddDraft: AddDraft = { providerType: 'Survey Agency', providerName: '', reference: '', method: null, file: null, datasetName: '', datasetType: 'Cadastral Parcel Data', acquisitionDate: '', epsgCode: '', coverage: '', description: '' };
const addSteps = ['Source', 'Dataset', 'Metadata', 'Validation', 'Review'];
const addDatasetTypes = ['Cadastral Parcel Data', 'Revenue Records', 'Drone Orthomosaic', 'DSM', 'DTM', 'GNSS / CORS Survey', 'Ground Truth Data', 'Municipal GIS', 'Building Footprints', 'Road Network', 'Utility Network', 'Historical Land Records', 'Other'];

function AddDataSourceModal({ open, onClose, refresh, notify, setSelectedSourceIds }: { open: boolean; onClose: () => void; refresh: () => Promise<void>; notify: (message: string) => void; setSelectedSourceIds: (ids: string[]) => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AddDraft>(initialAddDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resultSource, setResultSource] = useState<Source>();
  const [sampleResult, setSampleResult] = useState<{ sources: Source[]; source_ids: string[]; dataset_name: string }>();
  useEffect(() => { if (open) { setStep(0); setDraft(initialAddDraft); setBusy(false); setError(''); setResultSource(undefined); setSampleResult(undefined); } }, [open]);
  if (!open) return null;
  const updateDraft = (patch: Partial<AddDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const chooseFile = (file: File | null) => { if (!file) return; const extension = file.name.split('.').pop()?.toUpperCase() || 'FILE'; updateDraft({ file, datasetName: draft.datasetName || file.name.replace(/\.[^/.]+$/, '') }); setError(''); notify(`${extension} selected. Confirm its dataset type and metadata before validation.`); };
  const runValidation = async () => {
    setBusy(true); setError('');
    try {
      if (draft.method === 'sample') { const result = await sourceApi.sample(); setSampleResult(result); setResultSource(result.sources.find((source) => source.id === 'cadastral') || result.sources[0]); }
      else if (draft.method === 'upload' && draft.file) { const form = new FormData(); form.append('file', draft.file); form.append('provider_type', draft.providerType); form.append('provider_name', draft.providerName || draft.providerType); form.append('dataset_name', draft.datasetName || draft.file.name); form.append('dataset_type', draft.datasetType); form.append('acquisition_date', draft.acquisitionDate); form.append('description', draft.description || draft.reference); form.append('epsg_code', draft.epsgCode); form.append('coverage', draft.coverage); setResultSource(await sourceApi.upload(form)); }
    } catch (validationError) { setError(validationError instanceof Error ? validationError.message : 'The source could not be validated.'); }
    finally { setBusy(false); }
  };
  const advance = async () => {
    if (step === 0 && !draft.providerName.trim()) { setError('Enter the organization name so the source can be audited.'); return; }
    if (step === 1 && (!draft.method || draft.method === 'connect' || (draft.method === 'upload' && !draft.file))) { setError(draft.method === 'connect' ? 'This connector is not available in the current backend.' : 'Choose a supported file or the demo source bundle to continue.'); return; }
    if (step === 2) { if (!draft.datasetName.trim()) { setError('Give this dataset a recognizable name.'); return; } setStep(3); await runValidation(); return; }
    if (step === 3 && (!resultSource || busy || error)) { return; }
    if (step < 4) { setError(''); setStep((current) => current + 1); }
  };
  const finalize = async () => { setBusy(true); try { await refresh(); if (sampleResult) { setSelectedSourceIds(sampleResult.source_ids); notify('Demo Ward 14 source bundle loaded. Four labeled sample feeds are ready for selection.'); } else if (resultSource) { setSelectedSourceIds([resultSource.id]); notify(`${resultSource.name} added successfully. It is available for selection in the source table.`); } onClose(); } catch { setError('The source was processed, but the workspace could not refresh. Try Refresh.'); } finally { setBusy(false); } };
  const canAdvance = step === 0 ? Boolean(draft.providerName.trim()) : step === 1 ? Boolean(draft.method && (draft.method === 'sample' || draft.file)) : step === 2 ? Boolean(draft.datasetName.trim() && draft.datasetType) : step === 3 ? Boolean(resultSource && !busy && !error) : true;
  const checks = resultSource?.validation_checks ?? [];
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-source-title"><div className="modal-head"><div><span className="eyebrow">CONTROLLED INGESTION</span><h2 id="add-source-title">Add data source</h2><p>Identify the source, inspect its metadata, and validate it before harmonization.</p></div><button className="drawer-close" onClick={onClose} disabled={busy} aria-label="Close add data source workflow"><X size={18} /></button></div><div className="add-stepper">{addSteps.map((label, index) => <div className={`${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`} key={label}><span>{index < step ? <Check size={13} /> : index + 1}</span><b>{label}</b></div>)}</div>{error && <div className="workflow-error"><CircleAlert size={16} /><div><strong>Action required</strong><span>{error}</span></div></div>}<div className="modal-body">{step === 0 && <div className="workflow-panel"><div className="workflow-intro"><h3>Who is providing this data?</h3><p>Use the responsible organization, not an individual account name. It becomes part of the source provenance trail.</p></div><div className="form-grid"><label><span>Provider type</span><select value={draft.providerType} onChange={(event) => updateDraft({ providerType: event.target.value })}><option>Survey Agency</option><option>Revenue Department</option><option>Municipal GIS</option><option>Field Survey Team</option><option>Utility Agency</option><option>Other Authorized Source</option></select></label><label><span>Organization name</span><input value={draft.providerName} onChange={(event) => updateDraft({ providerName: event.target.value })} placeholder="e.g. Bengaluru Survey Office" /></label><label className="form-span-2"><span>Contact / reference <em>optional</em></span><input value={draft.reference} onChange={(event) => updateDraft({ reference: event.target.value })} placeholder="Procurement reference, team, or contact" /></label></div><div className="auth-note"><ShieldCheck size={17} /><span>This workspace is designed for authorized data providers. Authentication and organization permissions are enforced by the backend when enabled.</span></div></div>}{step === 1 && <div className="workflow-panel"><div className="workflow-intro"><h3>How should this source enter the workspace?</h3><p>Choose a supported ingestion path. Connectors that are not backed by the current service stay clearly unavailable.</p></div><div className="ingestion-options"><button className={`ingestion-option ${draft.method === 'upload' ? 'selected' : ''}`} onClick={() => updateDraft({ method: 'upload' })}><span className="icon-box"><CloudUpload size={20} /></span><div><strong>Upload file</strong><p>GeoJSON and CSV are currently validated by the FastAPI ingestion service.</p><code>GEOJSON · JSON · CSV · 50 MB DEMO LIMIT</code></div><ChevronRight size={16} /></button><button className="ingestion-option disabled" disabled><span className="icon-box"><PlugZap size={20} /></span><div><strong>Connect existing source <small>COMING SOON</small></strong><p>REST, WFS, PostGIS, and government service connectors are not enabled in this build.</p><code>CONNECTOR SERVICE REQUIRED</code></div><ChevronRight size={16} /></button><button className={`ingestion-option ${draft.method === 'sample' ? 'selected' : ''}`} onClick={() => { updateDraft({ method: 'sample', datasetName: 'Demo Ward 14 benchmark', providerName: 'UrbanLand Fusion AI benchmark' }); }}><span className="icon-box"><Database size={20} /></span><div><strong>Use sample dataset <small>DEMO / SAMPLE</small></strong><p>Load the same four labeled source feeds used by the live ward benchmark.</p><code>72 PARCELS · 8 KNOWN CONFLICT TYPES</code></div><ChevronRight size={16} /></button></div>{draft.method === 'upload' && <label className="file-drop"><FileUp size={19} /><span><strong>{draft.file ? draft.file.name : 'Choose a GeoJSON or CSV file'}</strong><small>{draft.file ? `${(draft.file.size / 1024).toFixed(1)} KB · ready for metadata review` : 'The file is sent to the backend only after you confirm metadata.'}</small></span><input type="file" accept=".geojson,.json,.csv,application/geo+json,text/csv" onChange={(event) => chooseFile(event.target.files?.[0] || null)} /></label>}</div>}{step === 2 && <div className="workflow-panel"><div className="workflow-intro"><h3>Confirm dataset metadata</h3><p>Detected metadata is shown separately from what you enter. The backend re-checks the file during validation.</p></div><div className="form-grid"><label><span>Dataset name</span><input value={draft.datasetName} onChange={(event) => updateDraft({ datasetName: event.target.value })} placeholder="Ward_17_Cadastral_2026" /></label><label><span>Dataset type</span><select value={draft.datasetType} onChange={(event) => updateDraft({ datasetType: event.target.value })}>{addDatasetTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label><span>Acquisition / survey date <em>optional</em></span><input type="date" value={draft.acquisitionDate} onChange={(event) => updateDraft({ acquisitionDate: event.target.value })} /></label><label><span>EPSG code <em>optional for GeoJSON; required for spatial CSV</em></span><input value={draft.epsgCode} onChange={(event) => updateDraft({ epsgCode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="4326" /></label><label><span>Geographic coverage <em>optional</em></span><input value={draft.coverage} onChange={(event) => updateDraft({ coverage: event.target.value })} placeholder="Ward 17 / area of interest" /></label><label><span>Dataset description <em>optional</em></span><input value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Purpose and capture context" /></label></div>{draft.method === 'sample' ? <div className="detected-panel"><span className="detected-tag"><Check size={13} /> backend sample bundle</span><strong>Demo Ward 14 benchmark</strong><p>Four sample source feeds · clearly labeled · same pipeline as real uploads.</p></div> : <div className="detected-panel"><span className="detected-tag"><Info size={13} /> detected from selection</span><strong>{draft.file?.name || 'No file selected'}</strong><p>{draft.file ? `${draft.file.name.split('.').pop()?.toUpperCase()} format · ${formatNumber(draft.file.size)} bytes · server validation pending` : 'Choose a file in the Dataset step to extract metadata.'}</p></div>}</div>}{step === 3 && <div className="workflow-panel validation-panel"><div className="workflow-intro"><h3>{busy ? 'Validating source…' : error ? 'Validation needs attention' : 'Validation complete'}</h3><p>{busy ? 'The ingestion service is checking the source before it can be registered.' : error ? 'Review the actionable error above, correct the source, and retry validation.' : 'These checks come from the source service and determine harmonization readiness.'}</p></div><div className="validation-timeline">{(checks.length ? checks : addSteps.slice(0, 1).map((label) => ({ label: `${label} validation`, status: 'processing', detail: 'Validation in progress…' }))).map((check) => <div className={`validation-stage stage-${check.status}`} key={check.label}><span>{busy ? <LoaderCircle size={15} className="spin" /> : check.status === 'passed' ? <Check size={15} /> : check.status === 'warning' ? <CircleAlert size={15} /> : <Info size={15} />}</span><div><strong>{check.label}</strong><small>{busy ? 'Validation in progress…' : check.detail}</small></div><b>{busy ? 'RUNNING' : sourceStatusLabel(check.status)}</b></div>)}</div>{!busy && !error && resultSource && <div className={`validation-result ${sourceIsEligible(resultSource) ? 'ready' : 'blocked'}`}><span>{sourceIsEligible(resultSource) ? <Check size={16} /> : <CircleAlert size={16} />}</span><div><strong>{sourceIsEligible(resultSource) ? 'Ready for Harmonization' : 'Not Ready'}</strong><p>{resultSource.readiness_reason}</p></div></div>}{error && <button className="retry-button" onClick={runValidation}><RefreshCw size={15} /> Retry validation</button>}</div>}{step === 4 && <div className="workflow-panel review-panel"><div className="workflow-intro"><h3>Review before registration</h3><p>Confirm the source identity and readiness. The dataset will return to the table after registration.</p></div><div className="review-summary"><div><span>Dataset</span><strong>{sampleResult ? sampleResult.dataset_name : resultSource?.name || draft.datasetName}</strong></div><div><span>Provider</span><strong>{sampleResult ? 'UrbanLand Fusion AI benchmark' : sourceProviderLabel(resultSource || ({ provider_name: draft.providerName } as Source))}</strong></div><div><span>Type</span><strong>{sampleResult ? 'Demo source bundle · 4 feeds' : sourceTypeLabel(resultSource || ({ dataset_type: draft.datasetType } as Source))}</strong></div><div><span>Format</span><strong>{sampleResult ? 'GeoJSON · CSV' : resultSource?.format}</strong></div><div><span>Features</span><strong>{sampleResult ? '72 canonical parcels' : formatNumber(resultSource?.feature_count)}</strong></div><div><span>CRS</span><strong>{sampleResult ? 'EPSG:4326' : resultSource?.crs || 'Missing'}</strong></div><div><span>Coverage</span><strong>{sampleResult ? 'Demo Ward 14' : resultSource?.coverage || draft.coverage || 'Not specified'}</strong></div><div><span>Validation</span><strong>{sampleResult ? 'Passed · sample benchmark' : resultSource?.validation_status === 'WARNING' ? `Passed with ${resultSource.issues.length} warning${resultSource.issues.length === 1 ? '' : 's'}` : 'Passed'}</strong></div></div><div className="review-note"><Info size={15} /><span>Registration preserves provenance and makes the source available for multi-source selection. Harmonization remains a separate downstream action.</span></div></div>}</div><div className="modal-foot"><button className="button button-secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || busy}>Back</button><div><span className="modal-step-count">Step {step + 1} of {addSteps.length}</span>{step < 4 ? <button className="button button-primary" onClick={advance} disabled={!canAdvance || busy}>{step === 2 ? 'Run validation' : 'Continue'}<ArrowRight size={16} /></button> : <button className="button button-primary" onClick={finalize} disabled={busy}>{busy ? 'Registering…' : sampleResult ? 'Load demo sources' : 'Add data source'}<Check size={16} /></button>}</div></div></section></div>;
}

function DataSourcesPage({ sources, selectedSourceIds, setSelectedSourceIds, refresh, notify }: { sources: Source[]; selectedSourceIds: string[]; setSelectedSourceIds: (ids: string[]) => void; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('All providers');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [formatFilter, setFormatFilter] = useState('All formats');
  const [sortField, setSortField] = useState<'name' | 'provider' | 'updated'>('updated');
  const [sortDirection, setSortDirection] = useState<1 | -1>(-1);
  const [drawerSource, setDrawerSource] = useState<Source>();
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sourceProviders = [...new Set(sources.map(sourceProviderLabel))].sort();
  const sourceTypes = [...new Set(sources.map(sourceTypeLabel))].sort();
  const sourceStatuses = [...new Set(sources.map((source) => source.status || 'UNKNOWN'))].sort();
  const sourceFormats = [...new Set(sources.map((source) => source.format))].sort();
  const filtered = sources.filter((source) => { const query = search.toLowerCase().trim(); const matchesSearch = !query || [source.name, source.file, sourceProviderLabel(source), sourceTypeLabel(source), source.coverage].some((value) => value?.toLowerCase().includes(query)); return matchesSearch && (providerFilter === 'All providers' || sourceProviderLabel(source) === providerFilter) && (typeFilter === 'All types' || sourceTypeLabel(source) === typeFilter) && (statusFilter === 'All statuses' || source.status === statusFilter) && (formatFilter === 'All formats' || source.format === formatFilter); }).sort((left, right) => { const leftValue = sortField === 'name' ? left.name : sortField === 'provider' ? sourceProviderLabel(left) : left.updated_at || ''; const rightValue = sortField === 'name' ? right.name : sortField === 'provider' ? sourceProviderLabel(right) : right.updated_at || ''; return leftValue.localeCompare(rightValue) * sortDirection; });
  const selectedSources = sources.filter((source) => selectedSourceIds.includes(source.id));
  const readyCount = sources.filter(sourceIsEligible).length;
  const processingCount = sources.filter((source) => ['PROCESSING', 'VALIDATING', 'INDEXING'].includes(source.processing_status || source.status)).length;
  const attentionCount = sources.filter((source) => source.validation_status === 'WARNING' || source.validation_status === 'FAILED' || !sourceIsEligible(source)).length;
  useEffect(() => {
    const validIds = selectedSourceIds.filter((id) => sources.some((source) => source.id === id && sourceIsEligible(source)));
    if (validIds.length !== selectedSourceIds.length) setSelectedSourceIds(validIds);
  }, [selectedSourceIds, setSelectedSourceIds, sources]);
  const coverageCompatible = selectedSources.length > 1 && selectedSources.every((source) => source.coverage && source.coverage === selectedSources[0].coverage);
  const crsCompatible = selectedSources.length > 1 && selectedSources.every((source) => Boolean(source.crs) && source.crs === selectedSources[0].crs);
  const geometrySupported = selectedSources.length > 1 && selectedSources.every((source) => Boolean(source.source_type));
  const schemaMismatch = selectedSources.length > 1 && new Set(selectedSources.map((source) => (source.attribute_fields || []).join('|'))).size > 1;
  const clearFilters = () => { setSearch(''); setProviderFilter('All providers'); setTypeFilter('All types'); setStatusFilter('All statuses'); setFormatFilter('All formats'); };
  const toggleSelected = (source: Source) => { if (!sourceIsEligible(source)) { notify(source.readiness_reason || 'This source is not ready for harmonization.'); return; } setSelectedSourceIds(selectedSourceIds.includes(source.id) ? selectedSourceIds.filter((id) => id !== source.id) : [...selectedSourceIds, source.id]); };
  const archive = async (source: Source) => { if (!window.confirm(`Archive “${source.name}”? It will remain in the audit trail and be excluded from harmonization.`)) return; try { await sourceApi.archive(source.id); await refresh(); setSelectedSourceIds(selectedSourceIds.filter((id) => id !== source.id)); notify('Data source archived and retained in the audit trail.'); } catch (error) { notify(error instanceof Error ? error.message : 'The source could not be archived.'); } };
  const doRefresh = async () => { setRefreshing(true); try { await refresh(); notify('Data Sources refreshed from the source service.'); } finally { setRefreshing(false); } };
  return <><main className="data-sources-shell"><div className="page-container"><div className="data-sources-header"><div><span className="eyebrow">CONTROLLED INGESTION / SOURCE REGISTRY</span><h1>Data Sources</h1><p>Manage, validate, and prepare geospatial datasets for harmonization.</p></div><div className="data-sources-actions"><Button onClick={() => setModalOpen(true)} icon={CloudUpload}>Add Data Source</Button><button className="icon-button refresh-button" onClick={doRefresh} disabled={refreshing} title="Refresh data sources" aria-label="Refresh data sources"><RefreshCw size={16} className={refreshing ? 'spin' : ''} /></button></div></div><div className="source-metric-grid"><div><span className="metric-icon"><Database size={17} /></span><div><strong>{sources.length}</strong><span>Total sources</span><small>Registered source feeds</small></div></div><div><span className="metric-icon metric-icon-success"><CircleCheck size={17} /></span><div><strong>{readyCount}</strong><span>Ready for harmonization</span><small>Passed readiness checks</small></div></div><div><span className="metric-icon metric-icon-blue"><LoaderCircle size={17} /></span><div><strong>{processingCount}</strong><span>Processing</span><small>Ingestion or validation jobs</small></div></div><div><span className="metric-icon metric-icon-warning"><CircleAlert size={17} /></span><div><strong>{attentionCount}</strong><span>Attention required</span><small>Warnings or missing metadata</small></div></div></div>{sources.length === 0 ? <div className="sources-empty"><span className="empty-icon"><Database size={26} /></span><span className="eyebrow">SOURCE REGISTRY</span><h2>No data sources yet</h2><p>Add geospatial datasets from authorized survey, revenue, municipal, or field sources to begin harmonization.</p><div><Button onClick={() => setModalOpen(true)} icon={CloudUpload}>Add Data Source</Button><button className="text-action" onClick={() => setModalOpen(true)}>Load Demo Dataset <ArrowRight size={14} /></button></div></div> : <><div className="source-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search datasets, providers, or files" aria-label="Search datasets" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</label><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} aria-label="Filter by provider"><option>All providers</option>{sourceProviders.map((value) => <option key={value}>{value}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by dataset type"><option>All types</option>{sourceTypes.map((value) => <option key={value}>{value}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option>All statuses</option>{sourceStatuses.map((value) => <option key={value}>{sourceStatusLabel(value)}</option>)}</select><select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)} aria-label="Filter by format"><option>All formats</option>{sourceFormats.map((value) => <option key={value}>{value}</option>)}</select>{(search || providerFilter !== 'All providers' || typeFilter !== 'All types' || statusFilter !== 'All statuses' || formatFilter !== 'All formats') && <button className="clear-filters" onClick={clearFilters}>Clear filters</button>}</div><div className="sources-toolbar-meta"><span>{filtered.length} of {sources.length} registered sources</span><span>All records are scoped to this authorized workspace</span></div><div className="source-table-shell"><table className="sources-table"><caption className="sr-only">Registered geospatial and tabular data sources</caption><thead><tr><th className="select-column"><span className="sr-only">Select</span></th><th><button onClick={() => { setSortField('name'); setSortDirection(sortField === 'name' ? sortDirection * -1 as 1 | -1 : 1); }}>Dataset <ChevronDown size={13} /></button></th><th><button onClick={() => { setSortField('provider'); setSortDirection(sortField === 'provider' ? sortDirection * -1 as 1 | -1 : 1); }}>Provider <ChevronDown size={13} /></button></th><th>Type</th><th>Format</th><th>Coverage</th><th>Status</th><th><button onClick={() => { setSortField('updated'); setSortDirection(sortField === 'updated' ? sortDirection * -1 as 1 | -1 : -1); }}>Updated <ChevronDown size={13} /></button></th><th>Actions</th></tr></thead><tbody>{filtered.map((source) => <tr key={source.id} className={selectedSourceIds.includes(source.id) ? 'row-selected' : ''}><td className="select-column"><input type="checkbox" checked={selectedSourceIds.includes(source.id)} disabled={!sourceIsEligible(source)} onChange={() => toggleSelected(source)} aria-label={`Select ${source.name} for harmonization`} /></td><td><button className="dataset-identity" onClick={() => setDrawerSource(source)}><strong>{source.name}</strong><code>{source.file}</code></button>{source.is_demo && <span className="demo-label">DEMO / SAMPLE</span>}</td><td><span className="provider-name">{sourceProviderLabel(source)}</span><small className="provider-meta">{source.provenance?.imported_by || 'Authorized source'}</small></td><td><span className="type-label">{sourceTypeLabel(source)}</span><small className="type-meta">{source.source_type || 'Source'}</small></td><td><code className="format-label">{source.format}</code></td><td><span className="coverage-label">{source.coverage || 'Not specified'}</span><small className="coverage-meta">{source.geometry_type || 'No geometry'}</small></td><td><StatusBadge source={source} /><small className={sourceIsEligible(source) ? 'ready-copy' : 'attention-copy'}>{sourceIsEligible(source) ? 'Ready for harmonization' : source.readiness_reason || 'Not ready'}</small></td><td><span className="updated-label">{sourceUpdatedLabel(source)}</span><small className="updated-meta">v{source.version ?? 1} · {source.last_harmonization_job || 'not used'}</small></td><td><div className="source-row-actions"><button className="icon-button" title="Inspect source" aria-label={`Inspect ${source.name}`} onClick={() => setDrawerSource(source)}><Eye size={15} /></button><button className="icon-button" title="Archive source" aria-label={`Archive ${source.name}`} onClick={() => archive(source)} disabled={source.status === 'ARCHIVED'}><Archive size={15} /></button></div></td></tr>)}{!filtered.length && <tr><td colSpan={9}><div className="empty-table"><Search size={18} /> No sources match the current filters. <button className="text-action" onClick={clearFilters}>Clear filters</button></div></td></tr>}</tbody></table></div><div className={`selection-dock ${selectedSources.length ? 'has-selection' : ''}`}><div className="selection-intro"><span className="selection-count"><Check size={15} /> {selectedSources.length} source{selectedSources.length === 1 ? '' : 's'} selected</span><strong>{selectedSources.length < 2 ? 'Select at least 2 validated datasets' : 'Inputs ready for compatibility check'}</strong><small>{selectedSources.length < 2 ? 'Harmonization operates on multiple heterogeneous sources.' : 'The next step will use only the selected, eligible source records.'}</small></div>{selectedSources.length > 0 && <div className="compatibility-summary"><span className="selection-summary-label">COMPATIBILITY</span><div className={coverageCompatible ? 'compat-good' : 'compat-warn'}>{coverageCompatible ? <Check size={14} /> : <CircleAlert size={14} />}<span>Spatial coverage {coverageCompatible ? 'overlaps' : 'needs review'}</span></div><div className={crsCompatible ? 'compat-good' : 'compat-warn'}>{crsCompatible ? <Check size={14} /> : <CircleAlert size={14} />}<span>CRS {crsCompatible ? 'compatible' : 'needs review'}</span></div><div className={geometrySupported ? 'compat-good' : 'compat-warn'}>{geometrySupported ? <Check size={14} /> : <CircleAlert size={14} />}<span>Source types supported</span></div>{schemaMismatch && <div className="compat-warn"><CircleAlert size={14} /><span>Attribute schema mismatch detected</span></div>}</div>}<Button variant="primary" onClick={() => { notify(`${selectedSources.length} validated sources are ready for the harmonization workspace.`); navigateTo('demo'); }} disabled={selectedSources.length < 2 || selectedSources.some((source) => !sourceIsEligible(source))} icon={ArrowRight}>Continue to Harmonization</Button></div></>}</div></main><Footer />{drawerSource && <SourceDetailsDrawer source={drawerSource} onClose={() => setDrawerSource(undefined)} />}<AddDataSourceModal open={modalOpen} onClose={() => setModalOpen(false)} refresh={refresh} notify={notify} setSelectedSourceIds={setSelectedSourceIds} /></>;
}

function MapView({ mode, compare, layerVisibility, selected, onSelect }: { mode: DemoMode; compare: number; layerVisibility: Record<string, boolean>; selected: Parcel | null; onSelect: (parcel: Parcel) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const [mapReady, setMapReady] = useState(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new maplibregl.Map({ container: containerRef.current, center: [77.597, 12.971], zoom: 15.6, attributionControl: false, style: { version: 8, sources: { satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256 } }, layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }] } as any });
    mapRef.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', async () => {
      try {
        for (const name of ['canonical', 'cadastral', 'municipal', 'buildings']) {
          const data = await fetch(`${API}/layers/${name}`).then((response) => response.json());
          instance.addSource(name, { type: 'geojson', data });
          instance.addLayer({ id: name, type: name === 'buildings' ? 'fill' : 'line', source: name, paint: name === 'canonical' ? { 'line-color': ['case', ['==', ['get', 'review_status'], 'HUMAN_REVIEW'], '#ef4444', ['==', ['get', 'review_status'], 'AI_ASSISTED'], '#f59e0b', '#3b82f6'], 'line-width': 2.5, 'line-opacity': 0.95 } : name === 'buildings' ? { 'fill-color': '#3b82f6', 'fill-opacity': 0.24, 'fill-outline-color': '#93c5fd' } : { 'line-color': name === 'cadastral' ? '#60a5fa' : '#c4b5fd', 'line-width': 1.4, 'line-opacity': 0.72 } } as any);
        }
        instance.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        instance.addLayer({ id: 'selected', type: 'line', source: 'selected', paint: { 'line-color': '#f5f5f7', 'line-width': 4, 'line-opacity': 0.95 } });
        instance.on('click', 'canonical', (event) => { const properties = event.features?.[0]?.properties; if (properties) onSelectRef.current(toParcel(properties)); });
        instance.on('mouseenter', 'canonical', () => { instance.getCanvas().style.cursor = 'pointer'; });
        instance.on('mouseleave', 'canonical', () => { instance.getCanvas().style.cursor = ''; });
        setMapReady(true);
      } catch (error) { console.error('Map layers could not be loaded', error); }
    });
    return () => { instance.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const instance = mapRef.current;
    ['cadastral', 'municipal', 'buildings'].forEach((id) => { if (instance.getLayer(id)) instance.setLayoutProperty(id, 'visibility', mode === 'harmonized' ? 'none' : layerVisibility[id] ? 'visible' : 'none'); });
    if (instance.getLayer('canonical')) { instance.setLayoutProperty('canonical', 'visibility', 'visible'); instance.setPaintProperty('canonical', 'line-opacity', mode === 'compare' ? compare / 100 : 0.95); }
  }, [mode, compare, layerVisibility, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !mapReady || !selected) return;
    const source = mapRef.current.getSource('selected') as maplibregl.GeoJSONSource | undefined;
    if (source) fetch(`${API}/parcels/${selected.canonical_parcel_id}`).then((response) => response.json()).then((data) => source.setData(data.parcel)).catch(() => undefined);
  }, [selected, mapReady]);

  return <div ref={containerRef} className="map-canvas" aria-label="Interactive satellite map of demo ward 14" />;
}

function Inspector({ selected, detail, queue, onSelect }: { selected: Parcel | null; detail?: Detail; queue: Parcel[]; onSelect: (parcel: Parcel) => void }) {
  return <aside className="inspector-panel"><div className="inspector-head"><div><span className="eyebrow">PARCEL INSPECTOR</span><h2>{selected ? selected.canonical_parcel_id : 'Select a parcel'}</h2></div><Pill tone={selected?.review_status === 'AI_ACCEPTED' ? 'green' : 'amber'}>{selected ? 'ACTIVE' : 'AWAITING INPUT'}</Pill></div>{selected ? <><div className="inspector-confidence"><div><span>OVERALL CONFIDENCE</span><strong>{formatConfidence(selected.overall_confidence)}</strong></div><div className="confidence-ring" style={{ '--progress': `${selected.overall_confidence * 100}%` } as React.CSSProperties}><span>{Math.round(selected.overall_confidence * 100)}</span></div></div><div className={`inspector-status ${selected.conflict_type ? 'has-conflict' : 'is-clear'}`}><CircleAlert size={15} /><div><strong>{titleCase(selected.conflict_type)}</strong><span>{detail?.explanation ?? 'Cross-source agreement is ready for review.'}</span></div></div><dl className="inspector-details"><div><dt>Survey number</dt><dd>{selected.survey_number}</dd></div><div><dt>Land use</dt><dd>{selected.land_use}</dd></div><div><dt>Canonical area</dt><dd>{formatNumber(selected.area_sq_m)} m²</dd></div><div><dt>Review status</dt><dd>{titleCase(selected.review_status)}</dd></div></dl><button className="inspector-link" onClick={() => document.getElementById('reconciliation')?.scrollIntoView({ behavior: 'smooth' })}>Open evidence workspace <ArrowDown size={14} /></button></> : <div className="inspector-empty"><MapPinned size={29} /><strong>Click a canonical parcel</strong><p>Evidence, recommendation, and source lineage will appear here.</p></div>}<div className="queue-preview"><div className="queue-preview-head"><span>PRIORITY QUEUE</span><b>{queue.length} open</b></div>{queue.slice(0, 4).map((parcel, index) => <button className={selected?.canonical_parcel_id === parcel.canonical_parcel_id ? 'selected' : ''} key={parcel.canonical_parcel_id} onClick={() => onSelect(parcel)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{parcel.canonical_parcel_id}</strong><small>{titleCase(parcel.conflict_type)}</small></div><em>{formatConfidence(parcel.overall_confidence)}</em></button>)}</div></aside>;
}

const semanticDemoFields = [
  { name: 'Khata Number', description: 'Land-record account or parcel identifier', type: 'string', sample_values: ['142/2'], source_context: 'Revenue Department' },
  { name: 'खाता संख्या', description: 'Land-record account or parcel identifier', type: 'string', sample_values: ['142/2'], source_context: 'Revenue Department' },
  { name: 'ಖಾತಾ ಸಂಖ್ಯೆ', description: 'Land-record account or parcel identifier', type: 'string', sample_values: ['142/2'], source_context: 'Revenue Department' },
  { name: 'கணக்கு எண்', description: 'Land-record account or parcel identifier', type: 'string', sample_values: ['142/2'], source_context: 'Revenue Department' },
  { name: 'ఖాతా నంబర్', description: 'Land-record account or parcel identifier', type: 'string', sample_values: ['142/2'], source_context: 'Revenue Department' },
  { name: 'Owner Name', description: 'Person or organization who owns the parcel', type: 'string', sample_values: ['Asha Rao'], source_context: 'Revenue Department' },
  { name: 'Parcel Area', description: 'Measured plot area in square metres', type: 'number', sample_values: [120.5], source_context: 'Municipal GIS' },
  { name: 'Ward Number', description: 'Administrative ward identifier', type: 'number', sample_values: [14], source_context: 'Municipal GIS' },
];

const formatSimilarity = (value?: number | null) => value === undefined || value === null ? '—' : value.toFixed(2);

function SemanticSchemaPanel({ notify }: { notify: (message: string) => void }) {
  const [result, setResult] = useState<SemanticMatchResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string>();
  const [open, setOpen] = useState(false);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/engines/schema-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: semanticDemoFields }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || 'The semantic matching service is unavailable.');
      setResult(payload as SemanticMatchResponse);
       notify(`Semantic check complete: ${payload.mappings.filter((mapping: SemanticMapping) => mapping.target_concept).length} fields mapped.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The semantic matching service is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const backend = result?.semantic_backend;
  const backendStatus = backend?.status;
  const backendLabel = backend?.semantic_backend === 'multilingual_embedding' ? 'Multilingual embedding' : backend?.semantic_backend === 'deterministic_fallback' ? 'Deterministic fallback' : 'Not detected';
  const backendTone = backendStatus === 'active' && !backend?.fallback_active ? 'green' : 'amber';
  const mappedCount = result?.mappings.filter((mapping) => mapping.target_concept).length ?? 0;
  const togglePanel = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !result && !loading) void run();
  };

  return <div className="semantic-panel-shell">
    <button className={`semantic-disclosure ${open ? 'is-open' : ''}`} type="button" aria-expanded={open} aria-controls="semantic-schema-panel" onClick={togglePanel}>
      <span className="semantic-disclosure-main">
        <span className="semantic-disclosure-icon"><Layers3 size={15} /></span>
        <span className="semantic-disclosure-text">
          <span className="semantic-disclosure-kicker">OPTIONAL MODEL INSPECTION</span>
          <strong>View field meaning layer</strong>
          <small>Inspect multilingual schema mappings and LADM evidence</small>
        </span>
      </span>
      <span className="semantic-disclosure-action"><span>{open ? 'Hide details' : 'Show details'}</span><ChevronDown size={15} /></span>
    </button>
    {open && <section id="semantic-schema-panel" className="semantic-schema-panel" aria-labelledby="semantic-schema-title">
    <div className="semantic-panel-head">
      <div>
        <span className="eyebrow">MULTILINGUAL SEMANTIC MATCHING</span>
        <h2 id="semantic-schema-title">See the field meaning layer</h2>
        <p>These examples run through the same LADM schema-matching endpoint used by the backend. Names, descriptions, types, samples, and department context are compared together.</p>
      </div>
      <div className="semantic-panel-actions">
        <Pill tone={backendTone}>{backendLabel}</Pill>
        <Button onClick={run} disabled={loading} variant="secondary" icon={loading ? LoaderCircle : RefreshCw}>{loading ? 'Checking model' : 'Run semantic check'}</Button>
      </div>
    </div>
    {backendStatus === 'unavailable' && <div className="semantic-alert"><CircleAlert size={16} /><div><strong>Multilingual model is not active</strong><span>The API reported an unavailable embedding backend. Results are not being silently replaced with alias matching. Install the backend requirements and make the model weights available, or explicitly configure the deterministic fallback.</span></div></div>}
    {error && <div className="semantic-alert"><CircleAlert size={16} /><div><strong>Semantic check could not be completed</strong><span>{error}</span></div></div>}
    {loading && !result ? <div className="semantic-loading"><LoaderCircle size={17} className="spin" /> Loading the configured semantic backend…</div> : <>
      <div className="semantic-metrics">
        <div><span>BACKEND</span><strong>{backendLabel}</strong><small>{backendStatus || 'Waiting for API'}</small></div>
        <div><span>MODEL</span><strong>{backend?.model || 'Offline evidence matcher'}</strong><small>{backend?.embedding_dimension ? `${backend.embedding_dimension}-dimension vectors` : 'No embedding vector active'}</small></div>
        <div><span>MAPPED FIELDS</span><strong>{mappedCount} / {result?.mappings.length ?? 0}</strong><small>Validated against LADM</small></div>
        <div><span>CACHE</span><strong>{backend?.cache_entries ?? '—'}</strong><small>Reusable embeddings</small></div>
      </div>
      <div className="semantic-map-table">
        <div className="semantic-table-head"><span>Source field</span><span>Selected LADM concept</span><span>Similarity</span><span>Evidence</span></div>
        {(result?.mappings ?? []).map((mapping, index) => {
          const key = `${mapping.field}-${index}`;
          const candidates = mapping.retrieved_candidates ?? [];
          const isOpen = expanded === key;
          return <div className={`semantic-map-row ${mapping.target_concept ? '' : 'semantic-map-unmapped'}`} key={key}>
            <div className="semantic-field"><code>{mapping.field}</code><small>{mapping.language || mapping.field_type || 'Unknown language'}</small></div>
            <div className="semantic-target"><ArrowRight size={14} /><div><strong>{mapping.target_concept ? mapping.target_label : 'Needs review'}</strong><small>{mapping.target_concept || 'No candidate passed the configured threshold'}</small></div></div>
            <div className="semantic-score"><strong>{formatSimilarity(mapping.semantic_similarity)}</strong><small>{mapping.semantic_similarity === null || mapping.semantic_similarity === undefined ? 'not an embedding score' : 'cosine similarity'}</small></div>
            <div className="semantic-evidence"><div>{(mapping.evidence ?? []).slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div><button className="semantic-candidate-toggle" onClick={() => setExpanded(isOpen ? undefined : key)}>{isOpen ? 'Hide candidates' : `${candidates.length} candidates`} <ChevronDown size={13} className={isOpen ? 'rotate' : ''} /></button></div>
            {isOpen && <div className="semantic-candidates"><span className="semantic-candidates-label">TOP-K RETRIEVAL</span>{candidates.slice(0, 5).map((candidate) => <div key={candidate.concept}><code>{candidate.concept}</code><span>{candidate.label}</span><b>{formatSimilarity(candidate.semantic_similarity ?? candidate.deterministic_similarity)}</b><small>{candidate.datatype_compatible ? 'type ✓' : 'type mismatch'} · {candidate.sample_value_compatible ? 'samples ✓' : 'sample mismatch'}</small></div>)}</div>}
          </div>;
        })}
        {!result?.mappings.length && <div className="semantic-loading">No mapping data returned.</div>}
      </div>
      <div className="semantic-panel-foot"><span><Globe2 size={14} /> English · Hindi · Kannada · Tamil · Telugu test fields</span><span><ShieldCheck size={14} /> Similarity is a score, not a probability</span></div>
    </>}</section>}
  </div>;
}

function ReconciliationWorkspace({ selected, detail, onDecision }: { selected: Parcel; detail: Detail; onDecision: (action: string) => void }) {
  return <section id="reconciliation" className="reconciliation-workspace"><div className="workspace-visual"><div className="workspace-heading"><div><span className="eyebrow">AI RECONCILIATION WORKSPACE</span><h2>Evidence-backed source comparison</h2></div><Pill tone="green">{formatConfidence(selected.overall_confidence)} confidence</Pill></div><div className="boundary-stage"><div className="boundary-grid" /><div className="source-shape shape-a"><span>revenue</span></div><div className="source-shape shape-b"><span>municipal</span></div><div className="source-shape shape-c"><span>drone / ORI</span></div><div className="source-shape shape-canonical"><BadgeCheck size={14} /><span>canonical output</span></div><div className="boundary-callout"><span>alignment delta</span><b>graph resolved</b></div></div><div className="workspace-legend"><span><i className="legend-blue" /> Cadastral</span><span><i className="legend-violet" /> Municipal</span><span><i className="legend-amber" /> Imagery</span><span><i className="legend-green" /> Canonical</span></div></div><div className="workspace-evidence"><span className="eyebrow">RECOMMENDATION</span><h3>{detail.recommendation}</h3><div className="evidence-score"><div><span>DECISION CONFIDENCE</span><strong>{formatConfidence(selected.overall_confidence)}</strong></div><div className="score-bar"><i style={{ width: `${selected.overall_confidence * 100}%` }} /></div><small>Joint score is wrapped by a locally weighted 95% conformal predictor.</small></div><EngineTrace engine={detail.engine} /><div className="source-values">{detail.source_values.map((item) => <div key={`${item.source}-${item.attribute}`}><span>{item.source}</span><b>{item.value}</b><em>{formatConfidence(item.score)}</em></div>)}</div><div className="evidence-list"><span className="eyebrow">WHY THIS DECISION</span>{detail.evidence.map((item, index) => <div key={`${item.source}-${index}`}><Check size={14} /><span>{item.detail}</span><b>{formatConfidence(item.score)}</b></div>)}</div><div className="decision-actions"><Button onClick={() => onDecision('approve')} icon={Check}>Approve recommendation</Button><Button onClick={() => onDecision('reject')} variant="secondary" icon={X}>Keep in review</Button><button className="text-action" onClick={() => onDecision('request_evidence')}>Request more evidence <ArrowRight size={14} /></button></div></div></section>;
}

function EngineTrace({ engine }: { engine?: Detail['engine'] }) {
  const joint = engine?.joint;
  const conformal = engine?.confidence;
  const semantic = engine?.semantic;
  return <div className="engine-trace"><div className="engine-trace-head"><span className="eyebrow">RESEARCH ENGINE TRACE</span><small>Signals retained with this record</small></div><div className="engine-trace-grid"><div><Network size={15} /><span><b>Graph matcher</b><small>{engine?.spatial?.many_to_many?.length ? `${engine.spatial.many_to_many.length} many-to-many relation(s)` : 'No ambiguous relations'} · Hungarian allocation</small></span><em>{formatConfidence(joint?.geometry)}</em></div><div><Table2 size={15} /><span><b>LADM schema validation</b><small>{semantic?.mapped_field_count ?? 0} fields mapped · {semantic?.ontology?.triple_count ?? 0} ontology triples</small></span><em>{formatConfidence(joint?.semantic)}</em></div><div><ShieldCheck size={15} /><span><b>Conformal decision set</b><small>{conformal?.coverage ? `${Math.round(conformal.coverage * 100)}% coverage` : '95% coverage'} · {conformal?.region ?? 'spatial'} calibration</small></span><em>{conformal?.decision === 'auto_merge' ? 'AUTO' : conformal?.decision === 'null' ? 'NULL' : 'REVIEW'}</em></div></div></div>;
}

function LegacyDemoPage({ dashboard, sources, changes, selectedSourceIds, refresh, notify }: { dashboard?: Dashboard; sources: Source[]; changes: any[]; selectedSourceIds: string[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [mode, setMode] = useState<DemoMode>('sources');
  const [compare, setCompare] = useState(55);
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [detail, setDetail] = useState<Detail>();
  const [tab, setTab] = useState<DemoTab>('Review Queue');
  const [job, setJob] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState({ cadastral: true, municipal: true, buildings: true });
  const queue = dashboard?.review_queue ?? [];
  const conflicts = queue.filter((parcel) => parcel.conflict_type);
  const inspect = async (parcel: Parcel) => { setSelected(parcel); try { const response = await fetch(`${API}/parcels/${parcel.canonical_parcel_id}`); setDetail(await response.json()); } catch { notify('Parcel evidence is temporarily unavailable.'); } };
  const run = async () => { if (job) return; setJob(true); notify('Harmonization job running: validating sources and reconciling evidence.'); try { const request: RequestInit = { method: 'POST' }; if (selectedSourceIds.length >= 2) { request.headers = { 'Content-Type': 'application/json' }; request.body = JSON.stringify({ source_ids: selectedSourceIds }); } const response = await fetch(`${API}/harmonization/jobs`, request); const result = await response.json(); if (!response.ok) throw new Error(result.detail || 'The harmonization job could not start.'); await refresh(); notify(`${result.id} completed: ${result.result.auto_harmonized} records auto-harmonized, ${result.result.conflicts} conflicts detected.`); } catch (error) { notify(error instanceof Error ? error.message : 'The harmonization API is unavailable.'); } finally { setJob(false); } };
  const decide = async (action: string) => { if (!selected) return; try { const response = await fetch(`${API}/parcels/${selected.canonical_parcel_id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); const result = await response.json(); setSelected(toParcel(result.parcel.properties)); setDetail(await fetch(`${API}/parcels/${selected.canonical_parcel_id}`).then((item) => item.json())); await refresh(); notify(result.event.detail); } catch { notify('Decision could not be recorded.'); } };
  const rows = queue;
  const summary = dashboard?.summary;
  return <main className="demo-shell"><div className="page-container"><div className="demo-topline"><div><Pill tone="green">LIVE DEMO · DEMO WARD 14</Pill><span className="demo-updated"><i className="live-dot" /> Synthetic benchmark · 72 canonical parcels</span></div><Button onClick={run} disabled={job} icon={job ? RefreshCw : Play}>{job ? 'Running harmonization…' : 'Run harmonization'}</Button></div><div className="demo-heading"><div><span className="eyebrow">OPERATIONAL WORKSPACE</span><h1>Review the record, <em>not the raw layers.</em></h1><p>Inspect the map, open a conflict, and see the evidence behind every canonical recommendation.</p></div><div className="job-status"><span>LAST PIPELINE RUN</span><strong>{dashboard?.latest_job ? 'COMPLETED' : 'READY'}</strong><small>{dashboard?.latest_job ? dashboard.latest_job.id : 'Awaiting a first run'}</small></div></div><div className="demo-metrics"><div><span>PARCELS</span><strong>{summary?.total_parcels ?? '—'}</strong><small>Ward 14 scope</small></div><div><span>HARMONIZED</span><strong>{summary?.harmonized ?? '—'}</strong><small>Canonical output</small></div><div className="metric-alert"><span>OPEN CONFLICTS</span><strong>{summary?.conflicts ?? '—'}</strong><small>Prioritized for review</small></div><div><span>HUMAN REVIEW</span><strong>{summary?.human_review ?? '—'}</strong><small>Officer decision needed</small></div><div><span>CHANGES</span><strong>{summary?.changes ?? '—'}</strong><small>Audit events</small></div></div><div className="map-workspace"><div><span className="eyebrow">MAP LAYERS</span><strong>Spatial context</strong></div><div className="map-modes">{(['sources', 'harmonized', 'compare'] as DemoMode[]).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item === 'sources' ? 'Sources' : item === 'harmonized' ? 'AI harmonized' : 'Before / after'}</button>)}</div>{mode === 'compare' && <label className="compare-slider"><span>source</span><input type="range" min="10" max="100" value={compare} onChange={(event) => setCompare(Number(event.target.value))} /><span>canonical</span></label>}<div className="layer-toggles">{[['cadastral', 'Cadastral'], ['municipal', 'Municipal'], ['buildings', 'AI buildings']].map(([id, label]) => <label key={id}><input type="checkbox" checked={layerVisibility[id as keyof typeof layerVisibility]} onChange={() => setLayerVisibility((current) => ({ ...current, [id]: !current[id as keyof typeof current] }))} /><span>{label}</span></label>)}</div></div><div className="demo-map-grid"><div className="map-panel"><div className="map-panel-head"><div><span className="eyebrow">DEMO WARD 14 / BENGALURU</span><strong>Canonical parcel map</strong></div><div className="map-tools"><button title="Search parcels"><Search size={15} /></button><button title="Map settings"><SlidersHorizontal size={15} /></button></div></div><MapView mode={mode} compare={compare} layerVisibility={layerVisibility} selected={selected} onSelect={inspect} /><div className="map-legend"><span><i className="status-dot success" /> Trusted</span><span><i className="status-dot warning" /> AI assisted</span><span><i className="status-dot danger" /> Conflict</span></div><div className="map-note"><MapPinned size={13} /> Click a canonical boundary to inspect evidence</div></div><Inspector selected={selected} detail={detail} queue={queue} onSelect={inspect} /></div><SemanticSchemaPanel notify={notify} />{selected && detail && <ReconciliationWorkspace selected={selected} detail={detail} onDecision={decide} />}<section className="demo-operations"><div className="operation-tabs">{(['Review Queue', 'Data Sources', 'Changes', 'Export'] as DemoTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Review Queue' && <span>{queue.length}</span>}</button>)}</div>{tab === 'Data Sources' ? <div className="source-table">{sources.map((source) => <div className="source-row" key={source.id}><span className="source-status"><i /><b>{source.status}</b></span><div><strong>{source.name}</strong><small>{source.file} · {source.format} · {source.crs}</small></div><b>{source.records}</b><span>{source.issues.length ? source.issues[0] : 'No validation issues'}</span></div>)}</div> : tab === 'Changes' ? <div className="change-table">{changes.length ? changes.map((change) => <div key={change.id}><span>{change.parcel_id}</span><span>{change.old_value} <ArrowRight size={13} /> {change.new_value}</span><span>{change.officer}</span><code>v{change.version}</code></div>) : <div className="empty-table"><Clock3 size={18} /> Decisions will appear here after review.</div>}</div> : tab === 'Export' ? <div className="export-panel"><div><span className="icon-box"><Download size={20} /></span><div><h3>Canonical Urban Land Record</h3><p>Current confidence, review status, source lineage, and geometry for every parcel in the ward.</p></div></div><a className="button button-primary" href={`${API}/export/canonical.geojson`}><Download size={16} /> Download GeoJSON</a></div> : <div className="review-table">{rows.map((parcel) => <button key={parcel.canonical_parcel_id} onClick={() => inspect(parcel)}><span className="review-rank">{String(Math.round(parcel.priority)).padStart(2, '0')}</span><div><strong>{parcel.canonical_parcel_id}</strong><small>{titleCase(parcel.conflict_type)} · {titleCase(parcel.review_status)}</small></div><span className="review-impact">{parcel.conflict_type ? 'Review' : 'Assisted'}</span><em>{formatConfidence(parcel.overall_confidence)}</em><ArrowRight size={15} /></button>)}{!rows.length && <div className="empty-table"><BadgeCheck size={18} /> No open reconciliation cases.</div>}</div>}</section></div></main>;
}

function DemoPage(props: { dashboard?: Dashboard; sources: Source[]; changes: any[]; selectedSourceIds: string[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  return <ModernDemoPage {...props} />;
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromPath());
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [sources, setSources] = useState<Source[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const refresh = async () => { try { const [dashboardResponse, sourcesResponse, changesResponse] = await Promise.all([fetch(`${API}/dashboard`), sourceApi.list(), fetch(`${API}/changes`)]); setDashboard(await dashboardResponse.json()); setSources(sourcesResponse.sources); setChanges((await changesResponse.json()).changes); } catch { /* The public product surface remains usable before the API boots. */ } };
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 4200); };
  useEffect(() => { const onPopState = () => setRoute(routeFromPath()); window.addEventListener('popstate', onPopState); refresh(); return () => window.removeEventListener('popstate', onPopState); }, []);
  return <div className="app-root">{notice && <div className="toast"><Check size={15} />{notice}</div>}<SiteNav route={route} />{route === 'home' && <HomePage dashboard={dashboard} />}{route === 'features' && <FeaturesPage />}{route === 'architecture' && <ArchitecturePage />}{route === 'data-sources' && <DataSourcesPage sources={sources} selectedSourceIds={selectedSourceIds} setSelectedSourceIds={setSelectedSourceIds} refresh={refresh} notify={notify} />}{route === 'docs' && <DocsPage />}{route === 'demo' && <DemoPage dashboard={dashboard} sources={sources} changes={changes} selectedSourceIds={selectedSourceIds} refresh={refresh} notify={notify} />}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
