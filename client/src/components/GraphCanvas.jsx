import { useRef, useEffect } from 'react';
import { useD3Simulation } from '../hooks/useD3Simulation.js';

export function GraphCanvas({
  graphData, highlightedIds, onNodeClick,
  incomingIds, outgoingIds,
  viewMode, depthMap,
  showClusters,
  forceStrength, linkDistance, controlsRef,
}) {
  const svgRef = useRef(null);
  const { fitToView, resetLayout } = useD3Simulation({
    svgRef, graphData, highlightedIds, onNodeClick,
    incomingIds, outgoingIds,
    viewMode, depthMap,
    showClusters,
    forceStrength, linkDistance,
  });

  // Expose controls to parent via ref
  useEffect(() => {
    if (controlsRef) controlsRef.current = { fitToView, resetLayout };
  });

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', background: '#0f1117', cursor: 'grab', userSelect: 'none' }}
      width="100%"
      height="100%"
    />
  );
}
