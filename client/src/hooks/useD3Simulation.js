import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

export function nodeRadius(d) {
  return 4 + Math.sqrt(d.connectionCount || 0) * 2;
}

export function useD3Simulation({ svgRef, graphData, highlightedIds, onNodeClick }) {
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const nodesDataRef = useRef([]);

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

    // Arrow marker for directed edges
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#4a5568');

    const g = svg.append('g').attr('class', 'graph-root');
    g.append('g').attr('class', 'links-layer');
    g.append('g').attr('class', 'nodes-layer');

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.02, 10])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);
    // Disable double-click zoom (we use it for node focus)
    svg.on('dblclick.zoom', null);
    zoomRef.current = zoom;

    // Force simulation
    const simulation = d3.forceSimulation()
      .force('link', d3.forceLink()
        .id(d => d.id)
        .distance(d => 120 + (1 - d.strength) * 80)
        .strength(d => d.strength * 0.4)
      )
      .force('charge', d3.forceManyBody()
        .strength(d => -120 - (d.connectionCount || 0) * 6)
        .distanceMax(400)
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide()
        .radius(d => nodeRadius(d) + 14)
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

    // Preserve old positions
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
        exit => exit.transition().duration(200).attr('stroke-opacity', 0).remove()
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
          // Update radius in case connectionCount changed
          update.select('circle')
            .transition().duration(300)
            .attr('r', d => nodeRadius(d))
            .attr('fill', d => d.isExternal ? '#4a5568' : colorScale(d.folder));
          update.select('text')
            .attr('dy', d => nodeRadius(d) + 11);
          return update;
        },
        exit => exit.transition().duration(200).attr('opacity', 0).remove()
      );

    // Drag behavior
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        // Keep fx/fy pinned so node stays where it was dropped
      });

    nodeSel.call(drag);

    nodeSel.on('click', (event, d) => {
      event.stopPropagation();
      onNodeClick(d);
    });

    svg.on('click', () => onNodeClick(null));

    // Feed simulation
    simulation.nodes(nodes);
    simulation.force('link').links(links);
    simulation.alpha(0.5).restart();

    // Tick handler
    simulation.on('tick', () => {
      svg.select('.links-layer').selectAll('line.link')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => {
          // Shorten line to not overlap node circle
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = nodeRadius(d.target) + 6;
          return d.source.x + dx * (1 - r / dist);
        })
        .attr('y2', d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const r = nodeRadius(d.target) + 6;
          return d.source.y + dy * (1 - r / dist);
        });

      svg.select('.nodes-layer').selectAll('g.node')
        .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Auto-fit after cooling
    function pinAllNodes() {
      nodesDataRef.current.forEach(n => { if (n.x != null) { n.fx = n.x; n.fy = n.y; } });
    }

    let fitted = false;
    simulation.on('end', () => {
      if (!fitted) {
        fitted = true;
        autoFit(svg, svgEl, zoomRef.current, nodes);
        pinAllNodes();
      }
    });
    // Also auto-fit after 3s for large graphs that take long to cool
    const fitTimer = setTimeout(() => {
      if (!fitted) {
        fitted = true;
        autoFit(svg, svgEl, zoomRef.current, nodesDataRef.current);
        pinAllNodes();
      }
    }, 3000);
    return () => clearTimeout(fitTimer);

  }, [graphData]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Effect 3: Highlight — visual only, no simulation restart ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const has = highlightedIds && highlightedIds.size > 0;

    svg.select('.nodes-layer').selectAll('g.node')
      .transition().duration(200)
      .attr('opacity', d => {
        if (!has) return d.connectionCount === 0 ? 0.35 : 1;
        return highlightedIds.has(d.id) ? 1 : 0.08;
      })
      .select('circle')
      .attr('stroke', d => has && highlightedIds.has(d.id) ? '#f6e05e' : '#0f1117')
      .attr('stroke-width', d => has && highlightedIds.has(d.id) ? 2.5 : 1.5);

    svg.select('.links-layer').selectAll('line.link')
      .transition().duration(200)
      .attr('stroke-opacity', d => {
        if (!has) return 0.5;
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        return highlightedIds.has(srcId) && highlightedIds.has(tgtId) ? 0.9 : 0.04;
      })
      .attr('stroke', d => {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        return has && highlightedIds.has(srcId) && highlightedIds.has(tgtId) ? '#f6ad55' : '#4a5568';
      });
  }, [highlightedIds, svgRef]);

  return { fitToView };
}

function autoFit(svg, svgEl, zoom, nodes) {
  const live = nodes.filter(n => n.x != null && n.y != null);
  if (!live.length) return;
  const xs = live.map(n => n.x).sort((a, b) => a - b);
  const ys = live.map(n => n.y).sort((a, b) => a - b);
  // Use 2nd–98th percentile to ignore outliers blown away by simulation
  const lo = Math.max(0, Math.floor(live.length * 0.02));
  const hi = Math.min(live.length - 1, Math.floor(live.length * 0.98));
  const minX = xs[lo], maxX = xs[hi];
  const minY = ys[lo], maxY = ys[hi];
  const pad = 80;
  const w = svgEl.clientWidth;
  const h = svgEl.clientHeight;
  const rangeX = maxX - minX + pad * 2;
  const rangeY = maxY - minY + pad * 2;
  const scale = Math.min(w / rangeX, h / rangeY, 3);
  const tx = w / 2 - scale * ((minX + maxX) / 2);
  const ty = h / 2 - scale * ((minY + maxY) / 2);
  svg.transition().duration(800)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}
