import { useRef } from 'react';
import { useD3Simulation } from '../hooks/useD3Simulation.js';

export function GraphCanvas({ graphData, highlightedIds, onNodeClick }) {
  const svgRef = useRef(null);
  const { fitToView } = useD3Simulation({ svgRef, graphData, highlightedIds, onNodeClick });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex' }}>
      <svg
        ref={svgRef}
        style={{ flex: 1, background: '#0f1117', cursor: 'grab', userSelect: 'none' }}
        width="100%"
        height="100%"
      />
      <button
        onClick={fitToView}
        title="Fit graph to view"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          background: '#1a202c',
          border: '1px solid #2d3748',
          borderRadius: 6,
          color: '#a0aec0',
          fontSize: 16,
          width: 32,
          height: 32,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ⊡
      </button>
    </div>
  );
}
