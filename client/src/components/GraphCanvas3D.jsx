import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as d3 from 'd3';
import * as THREE from 'three';
import { colorScale, nodeBaseColor, nodeHighlightColor, linkHighlightColor, hexToRgba } from '../utils/graphColors.js';

export function GraphCanvas3D({
  graphData, highlightedIds, onNodeClick,
  incomingIds, outgoingIds,
  viewMode, depthMap,
  showClusters,
  forceStrength, linkDistance,
  controlsRef,
}) {
  const fgRef = useRef(null);
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState(null);
  const userInteractedRef = useRef(false);
  const forceStrengthRef = useRef(forceStrength);
  const linkDistanceRef = useRef(linkDistance);
  forceStrengthRef.current = forceStrength;
  linkDistanceRef.current = linkDistance;

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Deep-clone graph data — strip 2D simulation coords, seed random 3D positions
  const graphData3D = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    const spread = Math.max(10, Math.sqrt(graphData.nodes.length) * 8);
    return {
      nodes: graphData.nodes.map(({ x, y, z, vx, vy, vz, fx, fy, fz, index, ...rest }) => ({
        ...rest,
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
        z: (Math.random() - 0.5) * spread,
      })),
      links: graphData.links.map(l => ({
        ...l,
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target,
      })),
    };
  }, [graphData]);

  // Custom fitCamera — library zoomToFit doesn't work, so compute manually.
  // force=true bypasses the user interaction guard (used by explicit Fit button)
  const fitCamera = useCallback((force = false) => {
    if (!force && userInteractedRef.current) return;
    const fg = fgRef.current;
    if (!fg) return;
    const bbox = fg.getGraphBbox();
    if (!bbox) return;
    const cx = (bbox.x[0] + bbox.x[1]) / 2;
    const cy = (bbox.y[0] + bbox.y[1]) / 2;
    const cz = (bbox.z[0] + bbox.z[1]) / 2;
    const maxSpan = Math.max(bbox.x[1] - bbox.x[0], bbox.y[1] - bbox.y[0], bbox.z[1] - bbox.z[0], 20);
    const cam = fg.camera();
    const fov = cam.fov * Math.PI / 180;
    const dist = (maxSpan / 2) / Math.tan(fov / 2) * 1.5;
    fg.cameraPosition({ x: cx, y: cy, z: cz + dist }, { x: cx, y: cy, z: cz }, 0);
  }, []);

  // Configure forces using refs (reads current slider values at call time)
  const configureForces = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const fs = forceStrengthRef.current;
    const ld = linkDistanceRef.current;
    const charge = fg.d3Force('charge');
    if (charge) charge.strength(d => -(120 * fs) - (d.connectionCount || 0) * 6 * fs);
    const link = fg.d3Force('link');
    if (link) link.distance(d => ld + (1 - (d.strength || 0.5)) * 80);
  }, []);

  // Cluster force: pull same-folder nodes together using d3-force initialize pattern
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    if (showClusters) {
      let nodes = [];
      const force = (alpha) => {
        if (!nodes.length) return;
        const centroids = new Map();
        const counts = new Map();
        for (const n of nodes) {
          const f = n.folder;
          if (!centroids.has(f)) { centroids.set(f, { x: 0, y: 0, z: 0 }); counts.set(f, 0); }
          const c = centroids.get(f);
          c.x += n.x || 0; c.y += n.y || 0; c.z += n.z || 0;
          counts.set(f, counts.get(f) + 1);
        }
        for (const [f, c] of centroids) {
          const cnt = counts.get(f);
          c.x /= cnt; c.y /= cnt; c.z /= cnt;
        }
        const strength = 0.3 * alpha;
        for (const n of nodes) {
          const c = centroids.get(n.folder);
          if (!c) continue;
          n.vx += (c.x - (n.x || 0)) * strength;
          n.vy += (c.y - (n.y || 0)) * strength;
          n.vz += (c.z - (n.z || 0)) * strength;
        }
      };
      force.initialize = (n) => { nodes = n; };
      fg.d3Force('cluster', force);
    } else {
      fg.d3Force('cluster', null);
    }
    fg.d3ReheatSimulation();
  }, [showClusters]);

  // Render transparent cluster spheres around folder groups
  // Reuse meshes keyed by folder, update position/scale instead of recreating
  const clusterMeshMapRef = useRef(new Map()); // folder -> mesh
  const unitGeoRef = useRef(null);

  const disposeClusterMeshes = useCallback((scene) => {
    for (const mesh of clusterMeshMapRef.current.values()) {
      if (scene) try { scene.remove(mesh); } catch {}
      mesh.material.dispose();
    }
    clusterMeshMapRef.current.clear();
    if (unitGeoRef.current) { unitGeoRef.current.dispose(); unitGeoRef.current = null; }
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    let scene;
    try { scene = fg.scene(); } catch { return; }
    if (!scene) return;

    if (!showClusters) {
      disposeClusterMeshes(scene);
      return;
    }

    // Shared unit sphere geometry (scaled per cluster)
    if (!unitGeoRef.current) unitGeoRef.current = new THREE.SphereGeometry(1, 16, 12);

    const updateClusters = () => {
      const cur = fgRef.current;
      if (!cur) return;
      let data;
      try { data = cur.graphData(); } catch { return; }
      if (!data?.nodes?.length) return;
      let curScene;
      try { curScene = cur.scene(); } catch { return; }
      if (!curScene) return;

      // Group nodes by folder
      const groups = new Map();
      for (const n of data.nodes) {
        if (!groups.has(n.folder)) groups.set(n.folder, []);
        groups.get(n.folder).push(n);
      }

      const activeFolders = new Set();
      for (const [folder, nodes] of groups) {
        if (nodes.length < 2) continue;
        activeFolders.add(folder);

        let cx = 0, cy = 0, cz = 0;
        for (const n of nodes) { cx += n.x || 0; cy += n.y || 0; cz += n.z || 0; }
        cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;
        let maxR = 0;
        for (const n of nodes) {
          const dx = (n.x || 0) - cx, dy = (n.y || 0) - cy, dz = (n.z || 0) - cz;
          maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }
        const radius = maxR + 12;

        let mesh = clusterMeshMapRef.current.get(folder);
        if (!mesh) {
          const color = new THREE.Color(colorScale(folder));
          const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false });
          mesh = new THREE.Mesh(unitGeoRef.current, mat);
          clusterMeshMapRef.current.set(folder, mesh);
          curScene.add(mesh);
        }
        mesh.position.set(cx, cy, cz);
        mesh.scale.setScalar(radius);
      }

      // Remove meshes for folders no longer active
      for (const [folder, mesh] of clusterMeshMapRef.current) {
        if (!activeFolders.has(folder)) {
          curScene.remove(mesh);
          mesh.material.dispose();
          clusterMeshMapRef.current.delete(folder);
        }
      }
    };

    updateClusters();
    const interval = setInterval(updateClusters, 500);
    return () => {
      clearInterval(interval);
      disposeClusterMeshes(scene);
    };
  }, [showClusters, graphData3D, disposeClusterMeshes]);

  // Configure forces once the ForceGraph3D ref is available; reset interaction flag on new data
  useEffect(() => {
    userInteractedRef.current = false;
    const fg = fgRef.current;
    if (!fg) return;
    configureForces();
    fg.d3ReheatSimulation();
  }, [graphData3D, configureForces]);

  // Update forces when slider params change
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    configureForces();
    fg.d3ReheatSimulation();
  }, [forceStrength, linkDistance, configureForces]);

  // Max depth for color scaling
  const maxDepth = useMemo(() => {
    if (!depthMap) return 1;
    let m = 1;
    for (const v of depthMap.values()) { if (v > m) m = v; }
    return m;
  }, [depthMap]);

  // Node color accessor
  const nodeColor = useCallback((d) => {
    if (viewMode === 'depth' && depthMap) {
      const depth = depthMap.get(d.id);
      if (depth != null && depth >= 0) return d3.interpolateWarm(depth / Math.max(1, maxDepth));
      return '#2d3748';
    }
    if (highlightedIds && highlightedIds.size > 0 && !highlightedIds.has(d.id)) {
      const base = nodeBaseColor(d);
      return hexToRgba(base, 0.1);
    }
    return nodeHighlightColor(d, highlightedIds, incomingIds, outgoingIds);
  }, [viewMode, depthMap, maxDepth, highlightedIds, incomingIds, outgoingIds]);

  // Link color accessor
  const linkColor = useCallback((d) => {
    const s = typeof d.source === 'object' ? d.source.id : d.source;
    const t = typeof d.target === 'object' ? d.target.id : d.target;
    if (highlightedIds && highlightedIds.size > 0) {
      if (highlightedIds.has(s) && highlightedIds.has(t)) {
        return linkHighlightColor(d, highlightedIds, incomingIds, outgoingIds);
      }
      return 'rgba(74, 85, 104, 0.03)';
    }
    return 'rgba(74, 85, 104, 0.4)';
  }, [highlightedIds, incomingIds, outgoingIds]);

  const linkWidth = useCallback((d) => 0.5 + (d.strength || 0.5) * 1.5, []);
  const nodeVal = useCallback((d) => 2 + (d.connectionCount || 0), []);
  const arrowColor = useCallback((d) => linkColor(d), [linkColor]);

  // react-kapsule detects nodeColor/linkColor prop changes and re-applies them

  // Expose controls to parent
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      fitToView: () => fitCamera(true),
      resetLayout: () => {
        userInteractedRef.current = false;
        const fg = fgRef.current;
        if (!fg || typeof fg.graphData !== 'function') return;
        const data = fg.graphData();
        if (!data?.nodes) return;
        data.nodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });
        fg.graphData(data);
        configureForces();
        fg.d3ReheatSimulation();
        setTimeout(() => fitCamera(true), 2000);
      },
    };
  });

  // Mark user interaction on orbit/zoom so auto-fit stops
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const markInteracted = () => { userInteractedRef.current = true; };
    el.addEventListener('pointerdown', markInteracted);
    el.addEventListener('wheel', markInteracted);
    return () => {
      el.removeEventListener('pointerdown', markInteracted);
      el.removeEventListener('wheel', markInteracted);
    };
  }, [dimensions]);

  // Auto-fit camera as simulation spreads nodes
  useEffect(() => {
    const times = [500, 1500, 3000, 5000];
    const timers = times.map(ms => setTimeout(() => fitCamera(), ms));
    return () => timers.forEach(clearTimeout);
  }, [graphData3D, fitCamera]);

  const handleEngineStop = useCallback(() => fitCamera(), [fitCamera]);
  const handleNodeClick = useCallback((node) => onNodeClick(node), [onNodeClick]);
  const handleBgClick = useCallback(() => onNodeClick(null), [onNodeClick]);

  // Don't render ForceGraph3D until we know the container size
  if (!dimensions) {
    return (
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, background: '#0f1117' }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, background: '#0f1117' }}
    >
      <ForceGraph3D
        ref={fgRef}
        graphData={graphData3D}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#0f1117"
        showNavInfo={false}

        nodeVal={nodeVal}
        nodeRelSize={1}
        nodeColor={nodeColor}
        nodeLabel={d => d.label}
        nodeOpacity={0.9}

        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={1}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={arrowColor}

        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBgClick}
        enableNodeDrag={true}

        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        cooldownTicks={300}
        onEngineStop={handleEngineStop}
      />
    </div>
  );
}
