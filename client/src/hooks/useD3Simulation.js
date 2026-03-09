import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { colorScale, nodeRadius } from '../utils/graphColors.js';

export function useD3Simulation({
  svgRef, graphData, highlightedIds, onNodeClick,
  incomingIds, outgoingIds,
  viewMode, depthMap,
  showClusters,
  forceStrength = 1, linkDistance = 120,
}) {
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const nodesDataRef = useRef([]);
  const showClustersRef = useRef(showClusters);
  const forceStrengthRef = useRef(forceStrength);
  const linkDistanceRef = useRef(linkDistance);
  useEffect(() => { showClustersRef.current = showClusters; }, [showClusters]);

  function fitToView() {
    if (!svgRef.current || !zoomRef.current) return;
    autoFit(d3.select(svgRef.current), svgRef.current, zoomRef.current, nodesDataRef.current);
  }

  // --- Effect 1: Mount — create SVG structure, zoom, simulation ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    svg.selectAll('*').remove();

    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#4a5568');

    const g = svg.append('g').attr('class', 'graph-root');
    g.append('g').attr('class', 'hulls-layer');
    g.append('g').attr('class', 'links-layer');
    g.append('g').attr('class', 'nodes-layer');

    const zoom = d3.zoom()
      .scaleExtent([0.02, 10])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);
    svg.on('dblclick.zoom', null);
    zoomRef.current = zoom;

    const simulation = d3.forceSimulation()
      .force('link', d3.forceLink()
        .id(d => d.id)
        .distance(d => linkDistanceRef.current + (1 - d.strength) * 80)
        .strength(d => d.strength * 0.4)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => -(120 * forceStrengthRef.current) - (d.connectionCount || 0) * 6 * forceStrengthRef.current)
        .distanceMax(400)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide()
        .radius(d => nodeRadius(d) + Math.max(8, 14 * forceStrengthRef.current))
        .strength(0.8)
      )
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(height / 2).strength(0.1))
      .alphaDecay(0.02)
      .velocityDecay(0.6);

    simulationRef.current = simulation;

    return () => simulation.stop();
  }, [svgRef]);

  // --- Effect 2: Data — rebind nodes/links, restart simulation ---
  useEffect(() => {
    if (!graphData || !simulationRef.current || !svgRef.current) return;

    const simulation = simulationRef.current;
    const svg = d3.select(svgRef.current);
    const svgEl = svgRef.current;

    const oldPos = new Map(nodesDataRef.current.map(n => [n.id, { x: n.x, y: n.y }]));

    const nodes = graphData.nodes.map(n => {
      const old = oldPos.get(n.id);
      return { ...n, x: old?.x ?? null, y: old?.y ?? null };
    });
    const links = graphData.links.map(l => ({ ...l }));
    nodesDataRef.current = nodes;

    // --- LINKS ---
    svg.select('.links-layer')
      .selectAll('line.link')
      .data(links, d => `${typeof d.source === 'object' ? d.source.id : d.source}|||${typeof d.target === 'object' ? d.target.id : d.target}`)
      .join(
        enter => enter.append('line')
          .attr('class', 'link')
          .attr('stroke-opacity', 0)
          .call(e => e.transition().duration(300).attr('stroke-opacity', 0.5)),
        update => update,
        exit => exit.classed('exiting', true).transition().duration(200).attr('stroke-opacity', 0).remove()
      )
      .attr('stroke', '#4a5568')
      .attr('stroke-width', d => 0.8 + d.strength * 2.5)
      .attr('stroke-dasharray', d => d.type === 'dynamic' ? '5,3' : null)
      .attr('marker-end', d => d.type !== 'reexport' ? 'url(#arrow)' : null);

    // --- NODES ---
    const nodeSel = svg.select('.nodes-layer')
      .selectAll('g.node')
      .data(nodes, d => d.id)
      .join(
        enter => {
          const g = enter.append('g')
            .attr('class', 'node')
            .attr('opacity', 0)
            .attr('cursor', 'pointer')
            .call(e => e.transition().duration(300).attr('opacity', d => d.connectionCount === 0 ? 0.35 : 1));

          g.append('circle')
            .attr('r', d => nodeRadius(d))
            .attr('fill', d => d.isExternal ? '#4a5568' : colorScale(d.folder))
            .attr('stroke', '#0f1117')
            .attr('stroke-width', 1.5);

          g.append('text')
            .attr('class', 'node-label')
            .attr('dy', d => nodeRadius(d) + 11)
            .attr('text-anchor', 'middle')
            .attr('font-size', 9)
            .attr('font-family', 'system-ui, sans-serif')
            .attr('fill', '#718096')
            .attr('pointer-events', 'none')
            .text(d => d.label);

          return g;
        },
        update => {
          update.select('circle')
            .transition().duration(300)
            .attr('r', d => nodeRadius(d))
            .attr('fill', d => d.isExternal ? '#4a5568' : colorScale(d.folder));
          update.select('text')
            .attr('dy', d => nodeRadius(d) + 11);
          return update;
        },
        exit => exit.classed('exiting', true).transition().duration(200).attr('opacity', 0).remove()
      );

    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    nodeSel.call(drag);

    nodeSel.on('click', (event, d) => { event.stopPropagation(); onNodeClick(d); });
    svg.on('click', () => onNodeClick(null));

    simulation.nodes(nodes);
    simulation.force('link').links(links);
    simulation.alpha(0.5).restart();

    simulation.on('tick', () => {
      svg.select('.links-layer').selectAll('line.link')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return d.source.x + dx * (1 - (nodeRadius(d.target) + 6) / dist);
        })
        .attr('y2', d => {
          const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return d.source.y + dy * (1 - (nodeRadius(d.target) + 6) / dist);
        });

      svg.select('.nodes-layer').selectAll('g.node')
        .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);

      if (showClustersRef.current) drawHulls(svg, nodesDataRef.current);
    });

    function killCenterForces() {
      simulation.force('center', null);
      simulation.force('x', null);
      simulation.force('y', null);
    }

    let fitted = false;
    simulation.on('end', () => {
      if (!fitted) { fitted = true; autoFit(svg, svgEl, zoomRef.current, nodes); killCenterForces(); }
    });
    const fitTimer = setTimeout(() => {
      if (!fitted) { fitted = true; autoFit(svg, svgEl, zoomRef.current, nodesDataRef.current); killCenterForces(); }
    }, 3000);
    return () => clearTimeout(fitTimer);

  }, [graphData]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Effect 3: Visual modes ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    // Depth mode
    if (viewMode === 'depth' && depthMap) {
      const maxDepth = Math.max(1, ...[...depthMap.values()].filter(v => v >= 0));
      const depthColor = d3.scaleSequential(d3.interpolateWarm).domain([0, maxDepth]);
      svg.select('.nodes-layer').selectAll('g.node:not(.exiting)')
        .transition().duration(300)
        .attr('opacity', 1)
        .select('circle')
        .attr('fill', d => {
          const depth = depthMap.get(d.id);
          return depth != null && depth >= 0 ? depthColor(depth) : '#2d3748';
        })
        .attr('stroke', '#0f1117')
        .attr('stroke-width', 1.5);
      svg.select('.links-layer').selectAll('line.link:not(.exiting)')
        .transition().duration(200)
        .attr('stroke-opacity', 0.3).attr('stroke', '#4a5568');
      return;
    }

    // Default: directional highlight
    const has = highlightedIds && highlightedIds.size > 0;
    svg.select('.nodes-layer').selectAll('g.node:not(.exiting)')
      .transition().duration(200)
      .attr('opacity', d => {
        if (!has) return d.connectionCount === 0 ? 0.35 : 1;
        return highlightedIds.has(d.id) ? 1 : 0.08;
      })
      .select('circle')
      .attr('fill', d => {
        if (!has || !highlightedIds.has(d.id)) return d.isExternal ? '#4a5568' : colorScale(d.folder);
        const isOut = outgoingIds && outgoingIds.has(d.id);
        const isIn = incomingIds && incomingIds.has(d.id);
        if (!isOut && !isIn) return '#ffffff';   // selected node
        if (isOut && !isIn) return '#63b3ed';    // this file imports them
        if (isIn && !isOut) return '#68d391';    // they import this file
        return '#f6e05e';                         // mutual
      })
      .attr('stroke', d => has && highlightedIds.has(d.id) ? '#f6e05e' : '#0f1117')
      .attr('stroke-width', d => has && highlightedIds.has(d.id) ? 2.5 : 1.5);

    svg.select('.links-layer').selectAll('line.link:not(.exiting)')
      .transition().duration(200)
      .attr('stroke-opacity', d => {
        if (!has) return 0.5;
        const s = typeof d.source === 'object' ? d.source.id : d.source;
        const t = typeof d.target === 'object' ? d.target.id : d.target;
        return highlightedIds.has(s) && highlightedIds.has(t) ? 0.9 : 0.04;
      })
      .attr('stroke', d => {
        const s = typeof d.source === 'object' ? d.source.id : d.source;
        const t = typeof d.target === 'object' ? d.target.id : d.target;
        if (!has || !(highlightedIds.has(s) && highlightedIds.has(t))) return '#4a5568';
        if (outgoingIds && outgoingIds.has(t)) return '#63b3ed';
        if (incomingIds && incomingIds.has(s)) return '#68d391';
        return '#f6ad55';
      });
  }, [highlightedIds, incomingIds, outgoingIds, viewMode, depthMap, svgRef]);

  // --- Effect 4: Clusters ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    if (!showClusters) { svg.select('.hulls-layer').selectAll('*').remove(); return; }
    drawHulls(svg, nodesDataRef.current);
  }, [showClusters, svgRef]);

  // --- Effect 5: Force param changes — update refs, reheat ---
  useEffect(() => {
    forceStrengthRef.current = forceStrength;
    linkDistanceRef.current = linkDistance;
    const sim = simulationRef.current;
    if (!sim || !nodesDataRef.current.length) return;
    sim.alpha(0.4).restart();
  }, [forceStrength, linkDistance]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetLayout() {
    const sim = simulationRef.current;
    if (!sim || !nodesDataRef.current.length) return;
    const svg = d3.select(svgRef.current);
    const w = svgRef.current?.clientWidth || 800;
    const h = svgRef.current?.clientHeight || 600;
    // Temporarily restore centering forces so reset produces a well-centered layout
    sim.force('center', d3.forceCenter(w / 2, h / 2));
    sim.force('x', d3.forceX(w / 2).strength(0.1));
    sim.force('y', d3.forceY(h / 2).strength(0.1));
    nodesDataRef.current.forEach(n => { n.fx = null; n.fy = null; });
    sim.alpha(0.8).restart();
    let done = false;
    const repin = () => {
      if (done) return; done = true;
      autoFit(svg, svgRef.current, zoomRef.current, nodesDataRef.current);
      sim.force('center', null);
      sim.force('x', null);
      sim.force('y', null);
      sim.on('end.reset', null);
    };
    sim.on('end.reset', repin);
    setTimeout(repin, 3000);
  }

  return { fitToView, resetLayout };
}

function drawHulls(svg, nodes) {
  const folderGroups = d3.group(
    nodes.filter(n => !n.isExternal && n.x != null),
    n => n.folder
  );
  svg.select('.hulls-layer').selectAll('path.hull')
    .data([...folderGroups.entries()], d => d[0])
    .join('path')
    .attr('class', 'hull')
    .attr('d', ([, pts]) => {
      if (!pts.length) return null;
      if (pts.length < 3) {
        const cx = d3.mean(pts, n => n.x), cy = d3.mean(pts, n => n.y), r = 22;
        return `M${cx},${cy - r}A${r},${r},0,1,1,${cx - 0.01},${cy - r}Z`;
      }
      const hull = d3.polygonHull(pts.map(n => [n.x, n.y]));
      if (!hull) return null;
      const cx = d3.mean(hull, p => p[0]), cy = d3.mean(hull, p => p[1]);
      const expanded = hull.map(([x, y]) => {
        const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return [x + (dx / dist) * 22, y + (dy / dist) * 22];
      });
      return `M${expanded.map(p => p.join(',')).join('L')}Z`;
    })
    .attr('fill', ([folder]) => colorScale(folder))
    .attr('fill-opacity', 0.07)
    .attr('stroke', ([folder]) => colorScale(folder))
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width', 1.5)
    .attr('stroke-linejoin', 'round');
}

function autoFit(svg, svgEl, zoom, nodes) {
  const live = nodes.filter(n => n.x != null && n.y != null);
  if (!live.length) return;
  const xs = live.map(n => n.x).sort((a, b) => a - b);
  const ys = live.map(n => n.y).sort((a, b) => a - b);
  const lo = Math.max(0, Math.floor(live.length * 0.02));
  const hi = Math.min(live.length - 1, Math.floor(live.length * 0.98));
  const pad = 80, w = svgEl.clientWidth, h = svgEl.clientHeight;
  const rangeX = xs[hi] - xs[lo] + pad * 2, rangeY = ys[hi] - ys[lo] + pad * 2;
  const scale = Math.min(w / rangeX, h / rangeY, 3);
  const tx = w / 2 - scale * ((xs[lo] + xs[hi]) / 2);
  const ty = h / 2 - scale * ((ys[lo] + ys[hi]) / 2);
  svg.transition().duration(800)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}
