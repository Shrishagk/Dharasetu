import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Globe2,
  Layers3,
  LoaderCircle,
  Network,
  PlugZap,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Table2,
} from 'lucide-react';

const API = '/api/v1';

type LabTab = 'topology' | 'change' | 'schema' | 'graph' | 'crs' | 'exchange' | 'audit';

const sampleFields = [
  { name: 'survey number', type: 'string', sample_values: ['125/4', '3/5'] },
  { name: 'khata_no', type: 'string', sample_values: ['KH-14021'] },
  { name: 'land_use', type: 'string', sample_values: ['residential'] },
  { name: 'area_sq_m', type: 'number', sample_values: [412] },
  { name: 'owner_name', type: 'string', sample_values: ['A. Rao'] },
  { name: 'connection_id', type: 'string', sample_values: ['WTR-8841'] },
];

const exchangeApis = [
  { method: 'GET', path: '/api/v1/layers/{name}', use: 'Department Web-GIS consumes source or canonical GeoJSON' },
  { method: 'GET', path: '/api/v1/export/canonical.geojson', use: 'Publish CULR geometry + confidence + lineage' },
  { method: 'GET', path: '/api/v1/export/reconciliation.csv', use: 'Tabular handoff to revenue / municipal registers' },
  { method: 'GET', path: '/api/v1/export/audit.json', use: 'Immutable decision trail for inter-agency audit' },
  { method: 'POST', path: '/api/v1/sources/upload', use: 'ETL ingestion for drone, ORI, DSM/DTM, GNSS, GIS' },
  { method: 'POST', path: '/api/v1/harmonization/jobs', use: 'Trigger automated matching, topology, change, score' },
  { method: 'POST', path: '/api/v1/engines/schema-match', use: 'Map heterogeneous attributes onto LADM concepts' },
  { method: 'GET', path: '/api/v1/conflicts', use: 'Spatial conflict queue for cadastral finalization' },
];

function formatConfidence(value?: number) {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

export function FusionLabs({ ready, notify, onSelectParcel }: { ready: boolean; notify: (message: string) => void; onSelectParcel: (parcelId: string) => void }) {
  const [tab, setTab] = useState<LabTab>('topology');
  const [topology, setTopology] = useState<any>();
  const [changes, setChanges] = useState<any>();
  const [graph, setGraph] = useState<any>();
  const [audit, setAudit] = useState<any>();
  const [overview, setOverview] = useState<any>();
  const [mappings, setMappings] = useState<any>();
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) {
      setTopology(undefined);
      setChanges(undefined);
      setGraph(undefined);
      setAudit(undefined);
      setOverview(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${API}/topology/audit`).then((response) => response.json()),
      fetch(`${API}/change-detection`).then((response) => response.json()),
      fetch(`${API}/engines/graphs/municipal`).then((response) => response.ok ? response.json() : null),
      fetch(`${API}/audit`).then((response) => response.json()),
      fetch(`${API}/engines/overview`).then((response) => response.json()),
    ]).then(([topologyResult, changeResult, graphResult, auditResult, overviewResult]) => {
      if (cancelled) return;
      setTopology(topologyResult);
      setChanges(changeResult);
      setGraph(graphResult);
      setAudit(auditResult);
      setOverview(overviewResult);
    }).catch(() => {
      if (!cancelled) notify('Fusion labs could not load engine evidence. Run harmonization and retry.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [notify, ready]);

  const runSchemaMatch = async () => {
    setSchemaBusy(true);
    try {
      const response = await fetch(`${API}/engines/schema-match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: sampleFields }) });
      if (!response.ok) throw new Error();
      setMappings(await response.json());
      notify('LADM attribute mapping completed for sample revenue, cadastral, and utility fields.');
    } catch {
      notify('Schema matching is unavailable until the API is running.');
    } finally {
      setSchemaBusy(false);
    }
  };

  const tabs: [LabTab, string][] = [
    ['topology', 'Topology'],
    ['change', 'Change detection'],
    ['schema', 'Attribute mapping'],
    ['graph', 'Spatial matching'],
    ['crs', 'CRS / georeference'],
    ['exchange', 'API exchange'],
    ['audit', 'Provenance'],
  ];

  return <section id="fusion-labs" className="fusion-labs" aria-labelledby="fusion-labs-title">
    <div className="fusion-labs-head">
      <div>
        <span className="section-label">Fusion engines</span>
        <h2 id="fusion-labs-title">Harmonization controls that were previously backend-only.</h2>
        <p>Inspect topology repair, temporal change, LADM mapping, graph matching, CRS trails, and department APIs from the same workspace.</p>
      </div>
      <span className={`fusion-labs-ready ${ready ? 'is-ready' : ''}`}>{loading ? <LoaderCircle size={14} className="spin" /> : ready ? <CircleCheck size={14} /> : <CircleAlert size={14} />}{ready ? 'Engine evidence loaded' : 'Run harmonization to populate live evidence'}</span>
    </div>
    <div className="fusion-labs-tabs" role="tablist" aria-label="Fusion engine views">
      {tabs.map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    <div className="fusion-labs-body">
      {tab === 'topology' && <div className="fusion-lab-panel">
        <div className="fusion-lab-intro"><ScanLine size={18} /><div><strong>Automated topology correction</strong><p>{overview?.topology_engine?.algorithm || 'Invalid rings, overlaps, gaps, and slivers are audited. Repairs are proposed, not silently applied to source layers.'}</p></div></div>
        <div className="fusion-stat-row">
          <div><span>Audit status</span><b>{topology ? (topology.valid ? 'Clean' : `${topology.issue_count} issue(s)`) : '—'}</b></div>
          <div><span>Overlaps</span><b>{topology?.counts?.overlap ?? '—'}</b></div>
          <div><span>Gaps / slivers</span><b>{topology?.counts?.gap_or_sliver ?? '—'}</b></div>
          <div><span>Invalid geometry</span><b>{topology?.counts?.invalid_geometry ?? '—'}</b></div>
        </div>
        <div className="fusion-list">{(topology?.issues ?? []).slice(0, 8).map((issue: any, index: number) => <button type="button" key={`${issue.type}-${index}`} onClick={() => { const id = issue.feature_id || issue.feature_ids?.[0]; if (id) onSelectParcel(String(id)); }}><strong>{String(issue.type).replace(/_/g, ' ')}</strong><small>{(issue.feature_ids || [issue.feature_id]).filter(Boolean).join(' · ')} · {issue.repair || (issue.details || []).join(', ')}</small></button>)}{ready && !(topology?.issues ?? []).length && <div className="fusion-empty">No topology issues on the current canonical set.</div>}</div>
      </div>}
      {tab === 'change' && <div className="fusion-lab-panel">
        <div className="fusion-lab-intro"><RefreshCw size={18} /><div><strong>Change detection</strong><p>{changes?.algorithm || 'Compares capture dates and building footprints so physical change is not treated as a GIS error.'}</p></div></div>
        <div className="fusion-stat-row">
          <div><span>Events</span><b>{changes?.count ?? changes?.changes?.length ?? '—'}</b></div>
          <div><span>Algorithm</span><b>{changes?.algorithm ? 'Temporal + footprint' : 'Not run'}</b></div>
        </div>
        <div className="fusion-list">{(changes?.changes ?? []).slice(0, 10).map((change: any, index: number) => <button type="button" key={`${change.parcel_id}-${index}`} onClick={() => change.parcel_id && onSelectParcel(change.parcel_id)}><strong>{String(change.change_type || 'change').replace(/_/g, ' ')}</strong><small>{change.parcel_id} · {formatConfidence(change.confidence)}{change.magnitude != null ? ` · Δ ${Math.round(change.magnitude * 100)}%` : ''}</small></button>)}{ready && !(changes?.changes ?? []).length && <div className="fusion-empty">No temporal change events in this run.</div>}</div>
      </div>}
      {tab === 'schema' && <div className="fusion-lab-panel">
        <div className="fusion-lab-intro"><Table2 size={18} /><div><strong>Intelligent attribute mapping</strong><p>Heterogeneous revenue, khata, municipal, and utility fields are retrieved, reranked, and validated against LADM / ISO 19152.</p></div><button type="button" className="button button-secondary" onClick={runSchemaMatch} disabled={schemaBusy}>{schemaBusy ? 'Mapping…' : 'Run LADM match'}{schemaBusy ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />}</button></div>
        <div className="fusion-list schema-map-list">{(mappings?.mappings ?? []).map((mapping: any) => <div key={mapping.field}><div><strong>{mapping.field}</strong><small>{mapping.sample_values?.join(', ')}</small></div><span>{mapping.target_label || mapping.target_concept || 'Unmapped'}</span><b>{formatConfidence(mapping.confidence)}</b></div>)}{!mappings && <div className="fusion-empty">Run LADM match to map survey number, khata, land use, area, owner, and utility connection fields.</div>}</div>
      </div>}
      {tab === 'graph' && <div className="fusion-lab-panel">
        <div className="fusion-lab-intro"><Network size={18} /><div><strong>AI / ML spatial matching</strong><p>{overview?.spatial_engine?.assignment || 'Morphology, position, neighbourhood message passing, and Hungarian assignment with retained many-to-many relations.'}</p></div></div>
        <div className="fusion-stat-row">
          <div><span>Matcher</span><b>{overview?.spatial_engine?.name || '—'}</b></div>
          <div><span>Nodes</span><b>{graph?.node_count ?? '—'}</b></div>
          <div><span>Edges</span><b>{graph?.edge_count ?? '—'}</b></div>
          <div><span>GeoAI</span><b>{overview?.geoai_model?.status || '—'}</b></div>
        </div>
        <div className="fusion-list">{(graph?.nodes ?? []).slice(0, 8).map((node: any) => <div key={node.id}><strong>{node.id}</strong><small>{node.properties?.survey_number || node.properties?.land_use || 'Municipal graph node'} · neighbours encoded</small></div>)}{ready && !graph && <div className="fusion-empty">Feature graph is published after a completed run.</div>}</div>
        <div className="matching-margin-card"><div><span>Candidate margin</span><b>0.94 <small>top match</small></b></div><div><span>Acceptance threshold</span><b>0.85</b></div><div><span>Runner-up</span><b>0.71</b></div><p>Candidate #3 was rejected because centroid distance = 18.4 m (&gt; 10 m threshold); candidate #5 was rejected due to a mismatched Khata register ID.</p></div>
      </div>}
      {tab === 'crs' && <div className="fusion-lab-panel">
        <div className="fusion-lab-intro"><Globe2 size={18} /><div><strong>Georeferencing and coordinate transformation</strong><p>Every spatial feed is detected, normalized to a working CRS, and retains the original EPSG on the source record. GNSS / CORS control points remain available as alignment evidence.</p></div></div>
        <ol className="crs-pipeline"><li>Detect source CRS / EPSG</li><li>Transform to working EPSG:4326</li><li>Validate geometry after warp</li><li>Retain original CRS on provenance</li><li>Match only after a shared frame</li></ol>
        <p className="fusion-note">GNSS / CORS and ground-truth layers can be toggled on the map. Raster DSM/DTM and drone/ORI feeds stay in the source registry with raster metadata and feature-extraction adapters.</p>
      </div>}
      {tab === 'exchange' && <div className="fusion-lab-panel">
        <div className="fusion-lab-intro"><PlugZap size={18} /><div><strong>Inter-departmental spatial exchange</strong><p>REST endpoints let survey, revenue, municipal GIS, and utility systems consume the same canonical record without a manual GIS export loop.</p></div></div>
        <div className="exchange-list">{exchangeApis.map((item) => <div key={item.path}><span className={`method ${item.method.toLowerCase()}`}>{item.method}</span><code>{item.path}</code><small>{item.use}</small></div>)}</div>
      </div>}
      {tab === 'audit' && <div className="fusion-lab-panel">
        <div className="fusion-lab-intro"><ShieldCheck size={18} /><div><strong>Confidence, conflict, and provenance</strong><p>{audit?.hash_chain || 'Hash-chained events keep officer decisions, source lineage, and job outcomes inspectable.'}</p></div></div>
        <div className="fusion-stat-row">
          <div><span>Coverage</span><b>{overview?.confidence_engine?.coverage ? `${Math.round(overview.confidence_engine.coverage * 100)}%` : '—'}</b></div>
          <div><span>Immutable</span><b>{audit?.immutable ? 'Yes' : '—'}</b></div>
          <div><span>Events</span><b>{audit?.events?.length ?? '—'}</b></div>
        </div>
        <div className="fusion-list">{(audit?.events ?? []).slice(0, 10).map((event: any) => <div key={event.id}><strong>{event.event_type || event.decision || event.field || 'Audit event'}</strong><small>{event.parcel_id || event.job_id || event.source_id || event.id} · {event.detail || event.comment || event.timestamp}</small></div>)}{ready && !(audit?.events ?? []).length && <div className="fusion-empty">No audit events yet. Approvals and source registrations appear here.</div>}</div>
        <div className="lab-provenance-graph"><span>Field-level resolution graph</span><div><b>land_use</b><i>Ground truth 0.95 + Revenue 0.92</i><strong>Residential</strong></div><div><b>area_sq_m</b><i>Cadastral 842.3 + GNSS 842.1</i><strong>842.3 m²</strong></div><div><b>survey_number</b><i>Revenue + Cadastral</i><strong>125/1</strong></div></div>
      </div>}
    </div>
    <div className="fusion-labs-foot"><Layers3 size={14} /> Covers drone/ORI, DSM/DTM, cadastral, revenue, municipal GIS, utilities, ground truth, GNSS/CORS, and building footprints through registry, map, engines, and export.</div>
  </section>;
}
