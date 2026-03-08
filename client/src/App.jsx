import { useState, useMemo, useCallback, useRef } from 'react';
import { GraphCanvas } from './components/GraphCanvas.jsx';
import { GraphControls } from './components/GraphControls.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { useGraphData } from './hooks/useGraphData.js';

const DEFAULT_FILTERS = {
  hiddenFileTypes: new Set(),
  hiddenFolders: new Set(),
  showExternal: false,
};


function computeDepthMap(nodes, links) {
  const getId = v => typeof v === 'object' ? v.id : v;
  const inDegree = new Map(nodes.map(n => [n.id, 0]));
  const adj = new Map(nodes.map(n => [n.id, []]));
  links.forEach(l => {
    const s = getId(l.source), t = getId(l.target);
    if (inDegree.has(t)) inDegree.set(t, inDegree.get(t) + 1);
    if (adj.has(s)) adj.get(s).push(t);
  });
  const depthMap = new Map();
  const queue = [];
  nodes.forEach(n => {
    if (inDegree.get(n.id) === 0) { depthMap.set(n.id, 0); queue.push(n.id); }
  });
  let i = 0;
  while (i < queue.length) {
    const u = queue[i++], d = depthMap.get(u);
    for (const v of (adj.get(u) || [])) {
      if (!depthMap.has(v)) { depthMap.set(v, d + 1); queue.push(v); }
    }
  }
  nodes.forEach(n => { if (!depthMap.has(n.id)) depthMap.set(n.id, -1); });
  return depthMap;
}


export default function App() {
  const { graphData, loading, error, analyze, clearGraph } = useGraphData();
  const [analyzePath, setAnalyzePath] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [incomingIds, setIncomingIds] = useState(new Set());
  const [outgoingIds, setOutgoingIds] = useState(new Set());
  const [viewMode, setViewMode] = useState(null); // null | 'depth'
  const [showClusters, setShowClusters] = useState(false);
  const [forceStrength, setForceStrength] = useState(1);
  const [linkDistance, setLinkDistance] = useState(120);
  const graphControlsRef = useRef({});

  const filteredGraphData = useMemo(() => {
    if (!graphData) return null;
    let nodes = graphData.nodes.filter(n => {
      if (!filters.showExternal && n.isExternal) return false;
      if (filters.hiddenFileTypes.has(n.ext)) return false;
      if (!n.isExternal && filters.hiddenFolders.has(n.folder)) return false;
      return true;
    });
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter(
      l => nodeIds.has(typeof l.source === 'object' ? l.source.id : l.source) &&
           nodeIds.has(typeof l.target === 'object' ? l.target.id : l.target)
    );
    return { nodes, links };
  }, [graphData, filters]);

  const depthMap = useMemo(() => {
    if (!filteredGraphData) return new Map();
    return computeDepthMap(filteredGraphData.nodes, filteredGraphData.links);
  }, [filteredGraphData]);

  const handleNodeClick = useCallback((node) => {
    if (!node) {
      setSelectedNode(null);
      setHighlightedIds(new Set());
      setIncomingIds(new Set());
      setOutgoingIds(new Set());
      return;
    }

    setSelectedNode(node);
    const data = filteredGraphData || graphData;
    if (!data) return;
    const getId = v => (typeof v === 'object' ? v.id : v);
    const outgoing = new Set();
    const incoming = new Set();
    for (const l of data.links) {
      const s = getId(l.source), t = getId(l.target);
      if (s === node.id) outgoing.add(t);
      if (t === node.id) incoming.add(s);
    }
    setOutgoingIds(outgoing);
    setIncomingIds(incoming);
    setHighlightedIds(new Set([node.id, ...outgoing, ...incoming]));
  }, [filteredGraphData, graphData]);

  const handleHighlight = useCallback((ids) => {
    setHighlightedIds(ids);
    setIncomingIds(new Set());
    setOutgoingIds(new Set());
    if (ids.size === 0) setSelectedNode(null);
  }, []);

  const handleClear = useCallback(() => {
    clearGraph();
    setFilters(DEFAULT_FILTERS);
    setSelectedNode(null);
    setHighlightedIds(new Set());
    setIncomingIds(new Set());
    setOutgoingIds(new Set());
    setViewMode(null);
    setShowClusters(false);
  }, [clearGraph]);

  const handleAnalyze = useCallback((p) => {
    clearGraph();
    setFilters(DEFAULT_FILTERS);
    setSelectedNode(null);
    setHighlightedIds(new Set());
    setIncomingIds(new Set());
    setOutgoingIds(new Set());
    setViewMode(null);
    setShowClusters(false);
    analyze(p);
  }, [analyze, clearGraph]);

  const handleViewMode = useCallback((mode) => {
    setViewMode(v => v === mode ? null : mode);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <ControlPanel
        graphData={graphData}
        filters={filters}
        onFilterChange={setFilters}
        analyzePath={analyzePath}
        onPathChange={setAnalyzePath}
        onAnalyze={handleAnalyze}
        onClear={handleClear}
        loading={loading}
        onHighlight={handleHighlight}
        meta={graphData?.meta}
      />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {error && <div style={errorBannerStyle}>{error}</div>}
        {!graphData && !loading && !error && <EmptyState />}
        {loading && <div style={loadingStyle}>Analyzing…</div>}
        {filteredGraphData && (
          <GraphControls
            forceStrength={forceStrength}
            onForceStrengthChange={setForceStrength}
            linkDistance={linkDistance}
            onLinkDistanceChange={setLinkDistance}
            onFitView={() => graphControlsRef.current.fitToView?.()}
            onResetLayout={() => graphControlsRef.current.resetLayout?.()}
            viewMode={viewMode}
            onViewMode={handleViewMode}
            showClusters={showClusters}
            onClustersChange={setShowClusters}
          />
        )}
        {filteredGraphData && (
          <GraphCanvas
            graphData={filteredGraphData}
            highlightedIds={highlightedIds}
            onNodeClick={handleNodeClick}
            incomingIds={incomingIds}
            outgoingIds={outgoingIds}
            viewMode={viewMode}
            depthMap={depthMap}
            showClusters={showClusters}
            forceStrength={forceStrength}
            linkDistance={linkDistance}
            controlsRef={graphControlsRef}
          />
        )}
      </div>

      {selectedNode && (
        <Sidebar
          node={selectedNode}
          graphData={filteredGraphData || graphData}
          onClose={() => {
            setSelectedNode(null);
            setHighlightedIds(new Set());
            setIncomingIds(new Set());
            setOutgoingIds(new Set());
          }}
          onNodeClick={handleNodeClick}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#4a5568', gap: 12,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>◎</div>
      <p style={{ fontSize: 15, fontWeight: 500 }}>Enter a project path and click Analyze</p>
      <p style={{ fontSize: 12 }}>Supports JS, TS, Python, C#, and Go</p>
    </div>
  );
}

const errorBannerStyle = {
  position: 'absolute', top: 12, left: '50%',
  transform: 'translateX(-50%)',
  background: '#742a2a', color: '#feb2b2',
  padding: '8px 16px', borderRadius: 6,
  fontSize: 13, zIndex: 10, maxWidth: '80%', textAlign: 'center',
};

const loadingStyle = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#718096', fontSize: 14, pointerEvents: 'none',
};
