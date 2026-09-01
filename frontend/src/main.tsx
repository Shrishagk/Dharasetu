import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
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
  CloudUpload,
  Database,
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
  Radar,
  RefreshCw,
  ScanLine,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Table2,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const ModernDemoPage = lazy(() => import('./DemoWorkspace').then(({ ModernDemoPage: Page }) => ({ default: Page })));

const API = '/api/v1';

type Route = 'home' | 'features' | 'architecture' | 'data-sources' | 'docs' | 'demo';

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
  review_queue: any[];
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
  { slug: 'api', label: 'API overview', kicker: 'INTEGRATION', title: 'Simple endpoints for operational workflows', summary: 'The service exposes graph runs, LADM schema matching, dashboard layers, parcel evidence, decisions, jobs, and export endpoints.' },
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
  return <button type="button" className={`brand ${compact ? 'brand-compact' : ''}`} onClick={() => navigateTo('home')} aria-label="UrbanLand Fusion AI home">
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
        {navItems.map((item) => <button type="button" key={item.label} className={route === item.route ? 'active' : ''} aria-current={route === item.route ? 'page' : undefined} onClick={() => navigateTo(item.route)}>{item.label}</button>)}
      </nav>
      <div className="nav-actions"><Button href="/demo" variant="secondary" icon={ArrowUpRight}>Request a demo</Button><button type="button" className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileOpen} aria-controls="mobile-navigation">{mobileOpen ? <X size={19} /> : <Menu size={19} />}</button></div>
    </div>
    {mobileOpen && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{navItems.map((item) => <button type="button" key={item.label} aria-current={route === item.route ? 'page' : undefined} onClick={() => { navigateTo(item.route); setMobileOpen(false); }}>{item.label}<ArrowRight size={15} /></button>)}<Button href="/demo" variant="primary">Request a demo</Button></nav>}
  </header>;
}

function Footer() {
  return <footer className="site-footer"><div className="footer-top"><div><Brand compact /><p>Evidence-backed land records for<br />interoperable urban administration.</p></div><div className="footer-links"><div><span>Explore</span><button type="button" onClick={() => navigateTo('features')}>Features</button><button type="button" onClick={() => navigateTo('architecture')}>Architecture</button><button type="button" onClick={() => navigateTo('demo')}>Live demo</button></div><div><span>Resources</span><button type="button" onClick={() => navigateTo('docs')}>Documentation</button><a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">API reference</a><a href="/api/v1/export/canonical.geojson">Sample export</a></div></div></div><div className="footer-bottom"><span>URBANLAND FUSION AI · DEMO WARD 14</span><span>Built for accountable automation</span></div></footer>;
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
    {pipelineStages.map((stage, index) => <button type="button" key={stage.label} className={`pipeline-stage ${index === active ? 'active' : ''} ${index < active ? 'passed' : ''}`} onClick={() => setActive(index)}><span className="pipeline-number">{String(index + 1).padStart(2, '0')}</span><span className="pipeline-node"><i /></span><strong>{stage.label}</strong><small>{stage.detail}</small>{index < pipelineStages.length - 1 && <ArrowRight className="pipeline-arrow" size={15} />}</button>)}
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
  return <><main className="docs-page"><div className="page-container docs-layout"><aside className="docs-sidebar"><span className="eyebrow">DOCUMENTATION</span><h1>UrbanLand docs</h1><p>Understand the data model, decisions, and integration surface.</p><div className="docs-nav">{docs.map((item) => <button type="button" key={item.slug} className={item.slug === slug ? 'active' : ''} onClick={() => setSlug(item.slug)}><span>{item.kicker}</span>{item.label}<ArrowRight size={14} /></button>)}</div><div className="docs-version"><span>DEMO API</span><code>v0.2.0</code></div></aside><article className="docs-content"><div className="docs-breadcrumb">Docs <span>/</span> {doc.label}</div><span className="eyebrow">{doc.kicker}</span><h2>{doc.title}</h2><p className="docs-lede">{doc.summary}</p><DocsBody slug={doc.slug} /><div className="docs-next"><button type="button" onClick={() => setSlug(nextDoc.slug)}>Next: {nextDoc.label}<ArrowRight size={15} /></button></div></article><aside className="docs-toc"><span>ON THIS PAGE</span><a href="#model">Core model</a><a href="#signals">Decision signals</a><a href="#next">What comes next</a></aside></div></main><Footer /></>;
}

function DocsBody({ slug }: { slug: string }) {
  if (slug === 'confidence') return <div className="docs-body"><h3 id="model">Spatial conformal calibration</h3><p>Confidence combines graph agreement, LADM-validated attribute evidence, temporal freshness, survey accuracy, and cross-source consistency before a locally weighted split-conformal wrapper is applied.</p><div className="score-equation"><span>graph agreement</span><b>+</b><span>LADM evidence</span><b>+</b><span>spatial calibration</span><strong>-&gt;</strong><em>95% confidence set</em></div><h3 id="signals">Safe thresholds</h3><p>A singleton set can be auto-resolved when its calibrated confidence clears the merge threshold. Ambiguous, high-impact, or null predictions are routed to human review.</p></div>;
  if (slug === 'schemas') return <div className="docs-body"><h3 id="model">Core model</h3><p>The canonical record is a durable view over source entities, not a destructive merge. It keeps the geometry and attributes that are currently trusted, alongside the provenance needed to explain each field.</p><div className="schema-card"><code>canonical_parcels</code><div><span>canonical_parcel_id</span><b>CULR-56000064</b></div><div><span>geometry_confidence</span><b>0.94</b></div><div><span>conformal_confidence</span><b>0.95 coverage</b></div><div><span>review_status</span><b>HUMAN_REVIEW</b></div></div><h3 id="signals">LADM relationships</h3><p>Spatial Unit, Party, Administrative Unit, and RRR concepts validate field mappings before they enter the canonical record.</p></div>;
  if (slug === 'api') return <div className="docs-body"><h3 id="model">Operational surface</h3><p>The service exposes asynchronous, PostGIS-ready workflow endpoints for ingestion, harmonization, evidence review, audit, and export.</p><div className="endpoint-list"><div><span className="method get">GET</span><code>/api/v1/engines/overview</code><small>Engine configuration and benchmark metrics</small></div><div><span className="method post">POST</span><code>/api/v1/engines/schema-match</code><small>Run LADM rollup/drilldown mapping</small></div><div><span className="method get">GET</span><code>/api/v1/topology/audit</code><small>Overlap, gap, sliver, and invalid-geometry audit</small></div><div><span className="method get">GET</span><code>/api/v1/change-detection</code><small>Temporal building and capture-date events</small></div><div><span className="method get">GET</span><code>/api/v1/layers/:name</code><small>GeoJSON source and canonical layers including GNSS</small></div><div><span className="method post">POST</span><code>/api/v1/harmonization/jobs</code><small>Execute the explainable fusion pipeline</small></div><div><span className="method get">GET</span><code>/api/v1/export/canonical.geojson</code><small>Inter-departmental CULR exchange</small></div></div><h3 id="signals">Response shape</h3><p>Parcel responses contain graph matches, source evidence, LADM validation, conformal decision sets, recommendation text, and lineage.</p></div>;
  if (slug === 'integration') return <div className="docs-body"><h3 id="model">Deployment path</h3><p>The demo runs as a small Docker Compose stack: a React/MapLibre web client, a FastAPI service, and a PostgreSQL/PostGIS foundation.</p><div className="integration-steps"><div><b>01</b><span>Upload</span><small>GeoJSON · CSV · raster</small></div><div><b>02</b><span>Audit</span><small>Quality + CRS checks</small></div><div><b>03</b><span>Harmonize</span><small>Async processing job</small></div><div><b>04</b><span>Review</span><small>Evidence-led decisions</small></div></div><h3 id="signals">Production increments</h3><p>PostGIS persistence, role-based access, queue workers, and provenance-aware processing are wired into this demo; production deployments can swap the offline GeoAI adapter for a validated model registry.</p></div>;
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
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="source-drawer" role="dialog" aria-modal="true" aria-labelledby="source-drawer-title"><div className="drawer-head"><div><span className="eyebrow">SOURCE INSPECTION</span><h2 id="source-drawer-title">{detail.name}</h2><p>{detail.file_reference || detail.file}</p></div><button type="button" className="drawer-close" onClick={onClose} aria-label="Close source details"><PanelRightClose size={18} /></button></div>{loading && <div className="drawer-loading"><LoaderCircle size={16} className="spin" /> Refreshing source metadata…</div>}<div className="drawer-scroll"><div className="drawer-status-row"><StatusBadge source={detail} /><span className={sourceIsEligible(detail) ? 'ready-copy' : 'attention-copy'}>{sourceIsEligible(detail) ? 'Ready for Harmonization' : 'Not Ready'}</span></div><div className="drawer-section"><span className="drawer-section-label">OVERVIEW</span><div className="drawer-facts"><div><span>Provider</span><b>{sourceProviderLabel(detail)}</b></div><div><span>Dataset type</span><b>{sourceTypeLabel(detail)}</b></div><div><span>Source format</span><b>{detail.format}</b></div><div><span>Version</span><b>v{detail.version ?? 1}</b></div><div><span>Acquisition date</span><b>{detail.acquisition_date || 'Not provided'}</b></div><div><span>Updated</span><b>{sourceUpdatedLabel(detail)}</b></div></div></div><div className="drawer-section"><span className="drawer-section-label">SPATIAL PREVIEW</span><SourcePreviewMap source={detail} /></div><div className="drawer-section"><span className="drawer-section-label">SPATIAL INFORMATION</span><div className="drawer-facts"><div><span>CRS</span><b>{detail.crs || 'Missing'}</b></div><div><span>Feature count</span><b>{formatNumber(detail.feature_count ?? detail.records)}</b></div><div><span>Geometry type</span><b>{detail.geometry_type || 'Not detected'}</b></div><div><span>Coverage</span><b>{detail.coverage || 'Not specified'}</b></div><div><span>Extent</span><b>{detail.spatial_extent || 'Not available'}</b></div></div></div><div className="drawer-section"><span className="drawer-section-label">SCHEMA</span><div className="schema-fields">{(detail.schema?.length ? detail.schema : (detail.attribute_fields ?? []).map((name) => ({ name, type: 'string' }))).map((field) => <div key={field.name}><code>{field.name}</code><span>{field.type}</span></div>)}{!detail.schema?.length && !detail.attribute_fields?.length && <span className="muted-inline">No attribute fields were detected.</span>}</div></div><div className="drawer-section"><span className="drawer-section-label">VALIDATION</span><div className="validation-checks">{checks.map((check) => <div key={check.label} className={`check-${check.status}`}><span>{check.status === 'passed' ? <Check size={14} /> : check.status === 'warning' ? <CircleAlert size={14} /> : <Info size={14} />}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div><b>{sourceStatusLabel(check.status)}</b></div>)}</div></div><div className="drawer-section"><span className="drawer-section-label">SOURCE PROVENANCE</span><div className="provenance-card"><div><span>Organization</span><b>{detail.provenance?.organization || sourceProviderLabel(detail)}</b></div><div><span>Imported by</span><b>{detail.provenance?.imported_by || 'Authorized source operator'}</b></div><div><span>Submitted</span><b>{detail.created_at ? new Date(detail.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'}</b></div><div><span>Harmonization job</span><b>{detail.last_harmonization_job || 'Not used yet'}</b></div></div></div><div className={`readiness-callout ${sourceIsEligible(detail) ? 'ready' : 'blocked'}`}><span className="drawer-section-label">HARMONIZATION READINESS</span><strong>{sourceIsEligible(detail) ? 'Ready for Harmonization' : 'Not Ready'}</strong><p>{detail.readiness_reason || 'Readiness status is supplied by the source service.'}</p></div></div></aside></div>;
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
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="add-modal" role="dialog" aria-modal="true" aria-labelledby="add-source-title"><div className="modal-head"><div><span className="eyebrow">CONTROLLED INGESTION</span><h2 id="add-source-title">Add data source</h2><p>Identify the source, inspect its metadata, and validate it before harmonization.</p></div><button type="button" className="drawer-close" onClick={onClose} disabled={busy} aria-label="Close add data source workflow"><X size={18} /></button></div><div className="add-stepper">{addSteps.map((label, index) => <div className={`${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`} key={label}><span>{index < step ? <Check size={13} /> : index + 1}</span><b>{label}</b></div>)}</div>{error && <div className="workflow-error"><CircleAlert size={16} /><div><strong>Action required</strong><span>{error}</span></div></div>}<div className="modal-body">{step === 0 && <div className="workflow-panel"><div className="workflow-intro"><h3>Who is providing this data?</h3><p>Use the responsible organization, not an individual account name. It becomes part of the source provenance trail.</p></div><div className="form-grid"><label><span>Provider type</span><select value={draft.providerType} onChange={(event) => updateDraft({ providerType: event.target.value })}><option>Survey Agency</option><option>Revenue Department</option><option>Municipal GIS</option><option>Field Survey Team</option><option>Utility Agency</option><option>Other Authorized Source</option></select></label><label><span>Organization name</span><input value={draft.providerName} onChange={(event) => updateDraft({ providerName: event.target.value })} placeholder="e.g. Bengaluru Survey Office" /></label><label className="form-span-2"><span>Contact / reference <em>optional</em></span><input value={draft.reference} onChange={(event) => updateDraft({ reference: event.target.value })} placeholder="Procurement reference, team, or contact" /></label></div><div className="auth-note"><ShieldCheck size={17} /><span>This workspace is designed for authorized data providers. Authentication and organization permissions are enforced by the backend when enabled.</span></div></div>}{step === 1 && <div className="workflow-panel"><div className="workflow-intro"><h3>How should this source enter the workspace?</h3><p>Choose a supported ingestion path. Connectors that are not backed by the current service stay clearly unavailable.</p></div><div className="ingestion-options"><button type="button" className={`ingestion-option ${draft.method === 'upload' ? 'selected' : ''}`} onClick={() => updateDraft({ method: 'upload' })}><span className="icon-box"><CloudUpload size={20} /></span><div><strong>Upload file</strong><p>GeoJSON, CSV, GeoTIFF, and common raster images are validated by the FastAPI ingestion service.</p><code>GEOJSON · JSON · CSV · 250 MB INGESTION LIMIT</code></div><ChevronRight size={16} /></button><button type="button" className="ingestion-option disabled" disabled><span className="icon-box"><PlugZap size={20} /></span><div><strong>Connect existing source <small>COMING SOON</small></strong><p>REST, WFS, PostGIS, and government service connectors are not enabled in this build.</p><code>CONNECTOR SERVICE REQUIRED</code></div><ChevronRight size={16} /></button><button type="button" className={`ingestion-option ${draft.method === 'sample' ? 'selected' : ''}`} onClick={() => { updateDraft({ method: 'sample', datasetName: 'Demo Ward 14 benchmark', providerName: 'UrbanLand Fusion AI benchmark' }); }}><span className="icon-box"><Database size={20} /></span><div><strong>Use sample dataset <small>DEMO / SAMPLE</small></strong><p>Load the same four labeled source feeds used by the live ward benchmark.</p><code>72 PARCELS · 8 KNOWN CONFLICT TYPES</code></div><ChevronRight size={16} /></button></div>{draft.method === 'upload' && <label className="file-drop"><FileUp size={19} /><span><strong>{draft.file ? draft.file.name : 'Choose a vector or raster source file'}</strong><small>{draft.file ? `${(draft.file.size / 1024).toFixed(1)} KB · ready for metadata review` : 'The file is sent to the backend only after you confirm metadata.'}</small></span><input type="file" accept=".geojson,.json,.csv,.tif,.tiff,.png,.jpg,.jpeg,application/geo+json,text/csv,image/tiff,image/png,image/jpeg" onChange={(event) => chooseFile(event.target.files?.[0] || null)} /></label>}</div>}{step === 2 && <div className="workflow-panel"><div className="workflow-intro"><h3>Confirm dataset metadata</h3><p>Detected metadata is shown separately from what you enter. The backend re-checks the file during validation.</p></div><div className="form-grid"><label><span>Dataset name</span><input value={draft.datasetName} onChange={(event) => updateDraft({ datasetName: event.target.value })} placeholder="Ward_17_Cadastral_2026" /></label><label><span>Dataset type</span><select value={draft.datasetType} onChange={(event) => updateDraft({ datasetType: event.target.value })}>{addDatasetTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label><span>Acquisition / survey date <em>optional</em></span><input type="date" value={draft.acquisitionDate} onChange={(event) => updateDraft({ acquisitionDate: event.target.value })} /></label><label><span>EPSG code <em>optional for GeoJSON; required for spatial CSV</em></span><input value={draft.epsgCode} onChange={(event) => updateDraft({ epsgCode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="4326" /></label><label><span>Geographic coverage <em>optional</em></span><input value={draft.coverage} onChange={(event) => updateDraft({ coverage: event.target.value })} placeholder="Ward 17 / area of interest" /></label><label><span>Dataset description <em>optional</em></span><input value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Purpose and capture context" /></label></div>{draft.method === 'sample' ? <div className="detected-panel"><span className="detected-tag"><Check size={13} /> backend sample bundle</span><strong>Demo Ward 14 benchmark</strong><p>Four sample source feeds · clearly labeled · same pipeline as real uploads.</p></div> : <div className="detected-panel"><span className="detected-tag"><Info size={13} /> detected from selection</span><strong>{draft.file?.name || 'No file selected'}</strong><p>{draft.file ? `${draft.file.name.split('.').pop()?.toUpperCase()} format · ${formatNumber(draft.file.size)} bytes · server validation pending` : 'Choose a file in the Dataset step to extract metadata.'}</p></div>}</div>}{step === 3 && <div className="workflow-panel validation-panel"><div className="workflow-intro"><h3>{busy ? 'Validating source…' : error ? 'Validation needs attention' : 'Validation complete'}</h3><p>{busy ? 'The ingestion service is checking the source before it can be registered.' : error ? 'Review the actionable error above, correct the source, and retry validation.' : 'These checks come from the source service and determine harmonization readiness.'}</p></div><div className="validation-timeline">{(checks.length ? checks : addSteps.slice(0, 1).map((label) => ({ label: `${label} validation`, status: 'processing', detail: 'Validation in progress…' }))).map((check) => <div className={`validation-stage stage-${check.status}`} key={check.label}><span>{busy ? <LoaderCircle size={15} className="spin" /> : check.status === 'passed' ? <Check size={15} /> : check.status === 'warning' ? <CircleAlert size={15} /> : <Info size={15} />}</span><div><strong>{check.label}</strong><small>{busy ? 'Validation in progress…' : check.detail}</small></div><b>{busy ? 'RUNNING' : sourceStatusLabel(check.status)}</b></div>)}</div>{!busy && !error && resultSource && <div className={`validation-result ${sourceIsEligible(resultSource) ? 'ready' : 'blocked'}`}><span>{sourceIsEligible(resultSource) ? <Check size={16} /> : <CircleAlert size={16} />}</span><div><strong>{sourceIsEligible(resultSource) ? 'Ready for Harmonization' : 'Not Ready'}</strong><p>{resultSource.readiness_reason}</p></div></div>}{error && <button type="button" className="retry-button" onClick={runValidation}><RefreshCw size={15} /> Retry validation</button>}</div>}{step === 4 && <div className="workflow-panel review-panel"><div className="workflow-intro"><h3>Review before registration</h3><p>Confirm the source identity and readiness. The dataset will return to the table after registration.</p></div><div className="review-summary"><div><span>Dataset</span><strong>{sampleResult ? sampleResult.dataset_name : resultSource?.name || draft.datasetName}</strong></div><div><span>Provider</span><strong>{sampleResult ? 'UrbanLand Fusion AI benchmark' : sourceProviderLabel(resultSource || ({ provider_name: draft.providerName } as Source))}</strong></div><div><span>Type</span><strong>{sampleResult ? 'Demo source bundle · 4 feeds' : sourceTypeLabel(resultSource || ({ dataset_type: draft.datasetType } as Source))}</strong></div><div><span>Format</span><strong>{sampleResult ? 'GeoJSON · CSV' : resultSource?.format}</strong></div><div><span>Features</span><strong>{sampleResult ? '72 canonical parcels' : formatNumber(resultSource?.feature_count)}</strong></div><div><span>CRS</span><strong>{sampleResult ? 'EPSG:4326' : resultSource?.crs || 'Missing'}</strong></div><div><span>Coverage</span><strong>{sampleResult ? 'Demo Ward 14' : resultSource?.coverage || draft.coverage || 'Not specified'}</strong></div><div><span>Validation</span><strong>{sampleResult ? 'Passed · sample benchmark' : resultSource?.validation_status === 'WARNING' ? `Passed with ${resultSource.issues.length} warning${resultSource.issues.length === 1 ? '' : 's'}` : 'Passed'}</strong></div></div><div className="review-note"><Info size={15} /><span>Registration preserves provenance and makes the source available for multi-source selection. Harmonization remains a separate downstream action.</span></div></div>}</div><div className="modal-foot"><button type="button" className="button button-secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || busy}>Back</button><div><span className="modal-step-count">Step {step + 1} of {addSteps.length}</span>{step < 4 ? <button type="button" className="button button-primary" onClick={advance} disabled={!canAdvance || busy}>{step === 2 ? 'Run validation' : 'Continue'}<ArrowRight size={16} /></button> : <button type="button" className="button button-primary" onClick={finalize} disabled={busy}>{busy ? 'Registering…' : sampleResult ? 'Load demo sources' : 'Add data source'}<Check size={16} /></button>}</div></div></section></div>;
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
  return <><main className="data-sources-shell"><div className="page-container"><div className="data-sources-header"><div><span className="eyebrow">CONTROLLED INGESTION / SOURCE REGISTRY</span><h1>Data Sources</h1><p>Manage, validate, and prepare geospatial datasets for harmonization.</p></div><div className="data-sources-actions"><Button onClick={() => setModalOpen(true)} icon={CloudUpload}>Add Data Source</Button><button type="button" className="icon-button refresh-button" onClick={doRefresh} disabled={refreshing} title="Refresh data sources" aria-label="Refresh data sources"><RefreshCw size={16} className={refreshing ? 'spin' : ''} /></button></div></div><div className="source-metric-grid"><div><span className="metric-icon"><Database size={17} /></span><div><strong>{sources.length}</strong><span>Total sources</span><small>Registered source feeds</small></div></div><div><span className="metric-icon metric-icon-success"><CircleCheck size={17} /></span><div><strong>{readyCount}</strong><span>Ready for harmonization</span><small>Passed readiness checks</small></div></div><div><span className="metric-icon metric-icon-blue"><LoaderCircle size={17} /></span><div><strong>{processingCount}</strong><span>Processing</span><small>Ingestion or validation jobs</small></div></div><div><span className="metric-icon metric-icon-warning"><CircleAlert size={17} /></span><div><strong>{attentionCount}</strong><span>Attention required</span><small>Warnings or missing metadata</small></div></div></div>{sources.length === 0 ? <div className="sources-empty"><span className="empty-icon"><Database size={26} /></span><span className="eyebrow">SOURCE REGISTRY</span><h2>No data sources yet</h2><p>Add geospatial datasets from authorized survey, revenue, municipal, or field sources to begin harmonization.</p><div><Button onClick={() => setModalOpen(true)} icon={CloudUpload}>Add Data Source</Button><button type="button" className="text-action" onClick={() => setModalOpen(true)}>Load Demo Dataset <ArrowRight size={14} /></button></div></div> : <><div className="source-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search datasets, providers, or files" aria-label="Search datasets" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</label><select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} aria-label="Filter by provider"><option>All providers</option>{sourceProviders.map((value) => <option key={value}>{value}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by dataset type"><option>All types</option>{sourceTypes.map((value) => <option key={value}>{value}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option>All statuses</option>{sourceStatuses.map((value) => <option key={value}>{sourceStatusLabel(value)}</option>)}</select><select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)} aria-label="Filter by format"><option>All formats</option>{sourceFormats.map((value) => <option key={value}>{value}</option>)}</select>{(search || providerFilter !== 'All providers' || typeFilter !== 'All types' || statusFilter !== 'All statuses' || formatFilter !== 'All formats') && <button type="button" className="clear-filters" onClick={clearFilters}>Clear filters</button>}</div><div className="sources-toolbar-meta"><span>{filtered.length} of {sources.length} registered sources</span><span>All records are scoped to this authorized workspace</span></div><div className="source-table-shell"><table className="sources-table"><caption className="sr-only">Registered geospatial and tabular data sources</caption><thead><tr><th className="select-column"><span className="sr-only">Select</span></th><th><button type="button" onClick={() => { setSortField('name'); setSortDirection(sortField === 'name' ? sortDirection * -1 as 1 | -1 : 1); }}>Dataset <ChevronDown size={13} /></button></th><th><button type="button" onClick={() => { setSortField('provider'); setSortDirection(sortField === 'provider' ? sortDirection * -1 as 1 | -1 : 1); }}>Provider <ChevronDown size={13} /></button></th><th>Type</th><th>Format</th><th>Coverage</th><th>Status</th><th><button type="button" onClick={() => { setSortField('updated'); setSortDirection(sortField === 'updated' ? sortDirection * -1 as 1 | -1 : -1); }}>Updated <ChevronDown size={13} /></button></th><th>Actions</th></tr></thead><tbody>{filtered.map((source) => <tr key={source.id} className={selectedSourceIds.includes(source.id) ? 'row-selected' : ''}><td className="select-column"><input type="checkbox" checked={selectedSourceIds.includes(source.id)} disabled={!sourceIsEligible(source)} onChange={() => toggleSelected(source)} aria-label={`Select ${source.name} for harmonization`} /></td><td><button type="button" className="dataset-identity" onClick={() => setDrawerSource(source)}><strong>{source.name}</strong><code>{source.file}</code></button>{source.is_demo && <span className="demo-label">DEMO / SAMPLE</span>}</td><td><span className="provider-name">{sourceProviderLabel(source)}</span><small className="provider-meta">{source.provenance?.imported_by || 'Authorized source'}</small></td><td><span className="type-label">{sourceTypeLabel(source)}</span><small className="type-meta">{source.source_type || 'Source'}</small></td><td><code className="format-label">{source.format}</code></td><td><span className="coverage-label">{source.coverage || 'Not specified'}</span><small className="coverage-meta">{source.geometry_type || 'No geometry'}</small></td><td><StatusBadge source={source} /><small className={sourceIsEligible(source) ? 'ready-copy' : 'attention-copy'}>{sourceIsEligible(source) ? 'Ready for harmonization' : source.readiness_reason || 'Not ready'}</small></td><td><span className="updated-label">{sourceUpdatedLabel(source)}</span><small className="updated-meta">v{source.version ?? 1} · {source.last_harmonization_job || 'not used'}</small></td><td><div className="source-row-actions"><button type="button" className="icon-button" title="Inspect source" aria-label={`Inspect ${source.name}`} onClick={() => setDrawerSource(source)}><Eye size={15} /></button><button type="button" className="icon-button" title="Archive source" aria-label={`Archive ${source.name}`} onClick={() => archive(source)} disabled={source.status === 'ARCHIVED'}><Archive size={15} /></button></div></td></tr>)}{!filtered.length && <tr><td colSpan={9}><div className="empty-table"><Search size={18} /> No sources match the current filters. <button type="button" className="text-action" onClick={clearFilters}>Clear filters</button></div></td></tr>}</tbody></table></div><div className={`selection-dock ${selectedSources.length ? 'has-selection' : ''}`}><div className="selection-intro"><span className="selection-count"><Check size={15} /> {selectedSources.length} source{selectedSources.length === 1 ? '' : 's'} selected</span><strong>{selectedSources.length < 2 ? 'Select at least 2 validated datasets' : 'Inputs ready for compatibility check'}</strong><small>{selectedSources.length < 2 ? 'Harmonization operates on multiple heterogeneous sources.' : 'The next step will use only the selected, eligible source records.'}</small></div>{selectedSources.length > 0 && <div className="compatibility-summary"><span className="selection-summary-label">COMPATIBILITY</span><div className={coverageCompatible ? 'compat-good' : 'compat-warn'}>{coverageCompatible ? <Check size={14} /> : <CircleAlert size={14} />}<span>Spatial coverage {coverageCompatible ? 'overlaps' : 'needs review'}</span></div><div className={crsCompatible ? 'compat-good' : 'compat-warn'}>{crsCompatible ? <Check size={14} /> : <CircleAlert size={14} />}<span>CRS {crsCompatible ? 'compatible' : 'needs review'}</span></div><div className={geometrySupported ? 'compat-good' : 'compat-warn'}>{geometrySupported ? <Check size={14} /> : <CircleAlert size={14} />}<span>Source types supported</span></div>{schemaMismatch && <div className="compat-warn"><CircleAlert size={14} /><span>Attribute schema mismatch detected</span></div>}</div>}<Button variant="primary" onClick={() => { notify(`${selectedSources.length} validated sources are ready for the harmonization workspace.`); navigateTo('demo'); }} disabled={selectedSources.length < 2 || selectedSources.some((source) => !sourceIsEligible(source))} icon={ArrowRight}>Continue to Harmonization</Button></div></>}</div></main><Footer />{drawerSource && <SourceDetailsDrawer source={drawerSource} onClose={() => setDrawerSource(undefined)} />}<AddDataSourceModal open={modalOpen} onClose={() => setModalOpen(false)} refresh={refresh} notify={notify} setSelectedSourceIds={setSelectedSourceIds} /></>;
}

function DemoSignalOverview({ dashboard, sources }: { dashboard?: Dashboard; sources: Source[] }) {
  const total = dashboard?.summary.total_parcels ?? 0;
  const reviewQueue = dashboard?.review_queue ?? [];
  const approved = Math.max(0, total - reviewQueue.length);
  const conflicts = dashboard?.summary.conflicts ?? reviewQueue.filter((item) => Boolean(item.conflict_type)).length;
  const averageConfidence = reviewQueue.length ? reviewQueue.reduce((sum, item) => sum + Number(item.overall_confidence ?? 0), 0) / reviewQueue.length : 0;
  const confidenceValues = reviewQueue.length ? reviewQueue.slice(0, 8).map((item) => Math.round(Number(item.overall_confidence ?? 0) * 100)).reverse() : [0, 0, 0, 0, 0, 0, 0, 0];
  const points = confidenceValues.map((value, index) => ({ x: 28 + index * 62, y: 154 - value * 1.1 }));
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L 462 166 L 28 166 Z`;
  const resolutionRate = total ? Math.round((approved / total) * 100) : 0;
  return <section className="demo-signal-overview" aria-label="Fusion telemetry for Demo Ward 14">
    <div className="signal-overview-copy"><span className="eyebrow">FUSION TELEMETRY / WARD 14</span><h2>One confident view of the city.</h2><p>Source layers become an auditable urban land record through one evidence-led workflow.</p><div className="signal-source-line"><span><i className="signal-green" /> {Math.max(sources.length, 4)} source families connected</span><span><i className="signal-blue" /> {dashboard?.started ? `${approved} canonical records published` : 'Run the pipeline to unlock results'}</span></div></div>
    <div className="signal-3d-visual"><div className="signal-visual-head"><span><i className="signal-live-dot" /> LIVE SYSTEM MODEL</span><strong>{dashboard?.started ? 'RUN COMPLETE' : 'READY TO RUN'}</strong></div><div className="signal-3d-stage"><div className="signal-grid-plane" /><div className="signal-orbit signal-orbit-a" /><div className="signal-orbit signal-orbit-b" /><div className="signal-orbit signal-orbit-c" /><span className="signal-node signal-node-a">IMAGERY</span><span className="signal-node signal-node-b">CADASTRAL</span><span className="signal-node signal-node-c">MUNICIPAL</span><span className="signal-node signal-node-d">GNSS</span><div className="signal-core"><span>FUSION CORE</span><strong>{dashboard?.started ? `${resolutionRate}%` : 'READY'}</strong><small>{dashboard?.started ? 'automated resolution' : 'four source families'}</small></div><div className="signal-base"><span>CANONICAL RECORDS</span><strong>{dashboard?.started ? total : '—'}</strong></div></div><div className="signal-visual-foot"><span><i className="signal-green" /> confidence-aware</span><span><i className="signal-amber" /> human review stays visible</span></div></div>
    <div className="signal-chart-panel"><div className="signal-panel-head"><div><span className="signal-kicker"><BarChart3 size={13} /> REVIEW QUALITY</span><strong>Confidence across priority records</strong></div><b>{dashboard?.started ? `${Math.round(averageConfidence * 100)}%` : '—'}<small> avg. signal</small></b></div><svg className="signal-line-chart" viewBox="0 0 520 190" role="img" aria-label="Confidence line chart across priority records"><defs><linearGradient id="signal-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".25" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><g><line x1="28" y1="44" x2="500" y2="44" /><line x1="28" y1="88" x2="500" y2="88" /><line x1="28" y1="132" x2="500" y2="132" /></g><path className="signal-area" d={areaPath} /><path className="signal-line" d={linePath} />{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4" />)}<text x="28" y="182">01</text><text x="248" y="182">04</text><text x="480" y="182">08</text><text x="4" y="48">100</text><text x="11" y="136">25</text></svg><div className="signal-chart-foot"><span>Priority queue / indexed by risk</span><span>{dashboard?.started ? `${conflicts} conflict signals` : 'Awaiting first run'}</span></div></div>
  </section>;
}

function DemoPage(props: { dashboard?: Dashboard; sources: Source[]; changes: any[]; selectedSourceIds: string[]; refresh: () => Promise<void>; notify: (message: string) => void; runUnlocked: boolean; onRunUnlocked: () => void }) {
  const [controlRun, setControlRun] = useState(false);
  const runFromControlPlane = async () => {
    if (controlRun) return;
    setControlRun(true);
    props.notify('Harmonization job started from Platform controls.');
    try {
      const request: RequestInit = { method: 'POST' };
      if (props.selectedSourceIds.length >= 2) { request.headers = { 'Content-Type': 'application/json' }; request.body = JSON.stringify({ source_ids: props.selectedSourceIds }); }
      const response = await fetch(`${API}/harmonization/jobs`, request);
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'The harmonization job could not start.');
      let completed = result;
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const statusResponse = await fetch(`${API}/harmonization/jobs/${result.id}`);
        completed = await statusResponse.json();
        if (completed.status === 'COMPLETED' || completed.status === 'FAILED') break;
      }
      if (completed.status !== 'COMPLETED') throw new Error(completed.error || 'The harmonization job did not complete.');
      props.onRunUnlocked();
      await props.refresh();
      props.notify(`${completed.id} completed. Results and review signals are now available.`);
    } catch (error) {
      props.notify(error instanceof Error ? error.message : 'The harmonization API is unavailable.');
    } finally {
      setControlRun(false);
    }
  };
  return <><DemoSignalOverview dashboard={props.dashboard} sources={props.sources} /><ModernDemoPage {...props} /></>;
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromPath());
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [sources, setSources] = useState<Source[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [demoRunUnlocked, setDemoRunUnlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number>();
  const refresh = async () => { try { const [dashboardResponse, sourcesResponse, changesResponse] = await Promise.all([fetch(`${API}/dashboard`), sourceApi.list(), fetch(`${API}/changes`)]); setDashboard(await dashboardResponse.json()); setSources(sourcesResponse.sources); setChanges((await changesResponse.json()).changes); } catch { /* The public product surface remains usable before the API boots. */ } };
  const notify = (message: string) => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); setNotice(message); noticeTimer.current = window.setTimeout(() => setNotice(''), 4200); };
  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath());
    window.addEventListener('popstate', onPopState);
    void refresh();
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);
  return <div className="app-root"><a className="skip-link" href="#main-content">Skip to main content</a>{notice && <div className="toast" role="status" aria-live="polite"><Check size={15} aria-hidden="true" />{notice}</div>}<SiteNav route={route} /><div id="main-content"><Suspense fallback={<RouteLoading />}>{route === 'home' && <HomePage dashboard={dashboard} />}{route === 'features' && <FeaturesPage />}{route === 'architecture' && <ArchitecturePage />}{route === 'data-sources' && <DataSourcesPage sources={sources} selectedSourceIds={selectedSourceIds} setSelectedSourceIds={setSelectedSourceIds} refresh={refresh} notify={notify} />}{route === 'docs' && <DocsPage />}{route === 'demo' && <DemoPage dashboard={dashboard} sources={sources} changes={changes} selectedSourceIds={selectedSourceIds} refresh={refresh} notify={notify} runUnlocked={demoRunUnlocked} onRunUnlocked={() => setDemoRunUnlocked(true)} />}</Suspense></div></div>;
}

function RouteLoading() {
  return <main className="route-loading" aria-live="polite"><LoaderCircle size={22} className="spin" aria-hidden="true" /><div><strong>Loading workspace</strong><span>Preparing the review tools…</span></div></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
