import * as d3 from 'd3';

export const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

export function nodeRadius(d) {
  return 4 + Math.sqrt(d.connectionCount || 0) * 2;
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function nodeBaseColor(d) {
  return d.isExternal ? '#4a5568' : colorScale(d.folder);
}

export function nodeHighlightColor(d, highlightedIds, incomingIds, outgoingIds) {
  if (!highlightedIds || highlightedIds.size === 0 || !highlightedIds.has(d.id)) {
    return nodeBaseColor(d);
  }
  const isOut = outgoingIds && outgoingIds.has(d.id);
  const isIn = incomingIds && incomingIds.has(d.id);
  if (!isOut && !isIn) return '#ffffff';   // selected node
  if (isOut && !isIn) return '#63b3ed';    // outgoing (cyan)
  if (isIn && !isOut) return '#68d391';    // incoming (green)
  return '#f6e05e';                         // mutual (yellow)
}

export function linkHighlightColor(link, highlightedIds, incomingIds, outgoingIds) {
  const s = typeof link.source === 'object' ? link.source.id : link.source;
  const t = typeof link.target === 'object' ? link.target.id : link.target;
  if (!highlightedIds || highlightedIds.size === 0) return '#4a5568';
  if (!(highlightedIds.has(s) && highlightedIds.has(t))) return '#4a5568';
  if (outgoingIds && outgoingIds.has(t)) return '#63b3ed';
  if (incomingIds && incomingIds.has(s)) return '#68d391';
  return '#f6ad55';
}
