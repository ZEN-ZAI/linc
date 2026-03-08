import { useState, useMemo, useCallback } from 'react';
import { GraphCanvas } from './components/GraphCanvas.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { useGraphData } from './hooks/useGraphData.js';

// hiddenFolders / hiddenFileTypes: exclude-based — empty Set = show all
const DEFAULT_FILTERS = {
  hiddenFileTypes: new Set(),
  hiddenFolders: new Set(),
  showExternal: false,
};


export default function App() {
  const { graphData, loading, error, analyze } = useGraphData();
  const [analyzePath, setAnalyzePath] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());

  // Derived filtered graph
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

  const handleNodeClick = useCallback((node) => {
    if (!node) {
      setSelectedNode(null);
      setHighlightedIds(new Set());
      return;
    }
    setSelectedNode(node);
    const data = filteredGraphData || graphData;
    if (!data) return;
    const getId = v => (typeof v === 'object' ? v.id : v);
    const neighbors = new Set([node.id]);
    for (const l of data.links) {
      const s = getId(l.source), t = getId(l.target);
      if (s === node.id) neighbors.add(t);
      if (t === node.id) neighbors.add(s);
    }
    setHighlightedIds(neighbors);
  }, [filteredGraphData, graphData]);

  const handleHighlight = useCallback((ids) => {
    setHighlightedIds(ids);
    if (ids.size === 0) setSelectedNode(null);
  }, []);

  const handleAnalyze = useCallback((p) => {
    // Reset project-specific filters before each new analysis
    setFilters(DEFAULT_FILTERS);
    setSelectedNode(null);
    setHighlightedIds(new Set());
    analyze(p);
  }, [analyze]);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <ControlPanel
        graphData={graphData}
        filters={filters}
        onFilterChange={setFilters}
        analyzePath={analyzePath}
        onPathChange={setAnalyzePath}
        onAnalyze={handleAnalyze}
        loading={loading}
        onHighlight={handleHighlight}
        meta={graphData?.meta}
      />

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {error && (
          <div style={errorBannerStyle}>
            {error}
          </div>
        )}
        {!graphData && !loading && !error && (
          <EmptyState />
        )}
        {loading && (
          <div style={loadingStyle}>Analyzing…</div>
        )}
        {filteredGraphData && (
          <GraphCanvas
            graphData={filteredGraphData}
            highlightedIds={highlightedIds}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>

      {selectedNode && (
        <Sidebar
          node={selectedNode}
          graphData={filteredGraphData || graphData}
          onClose={() => { setSelectedNode(null); setHighlightedIds(new Set()); }}
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
      <p style={{ fontSize: 12 }}>Supports JavaScript, TypeScript, and Python</p>
    </div>
  );
}

const errorBannerStyle = {
  position: 'absolute', top: 12, left: '50%',
  transform: 'translateX(-50%)',
  background: '#742a2a',
  color: '#feb2b2',
  padding: '8px 16px',
  borderRadius: 6,
  fontSize: 13,
  zIndex: 10,
  maxWidth: '80%',
  textAlign: 'center',
};

const loadingStyle = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#718096', fontSize: 14,
  pointerEvents: 'none',
};
