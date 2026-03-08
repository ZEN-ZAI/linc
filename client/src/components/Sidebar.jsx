import { useMemo } from 'react';

export function Sidebar({ node, graphData, onClose, onNodeClick }) {
  const { imports, importedBy } = useMemo(() => {
    if (!node || !graphData) return { imports: [], importedBy: [] };

    const getId = v => (typeof v === 'object' ? v.id : v);

    const imports = graphData.links
      .filter(l => getId(l.source) === node.id)
      .map(l => ({
        id: getId(l.target),
        type: l.type,
        strength: l.strength,
      }));

    const importedBy = graphData.links
      .filter(l => getId(l.target) === node.id)
      .map(l => ({
        id: getId(l.source),
        type: l.type,
      }));

    return { imports, importedBy };
  }, [node, graphData]);

  const findNode = id => graphData?.nodes.find(n => n.id === id);

  return (
    <div style={sidebarStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f6ad55', wordBreak: 'break-all', paddingRight: 8 }}>
          {node.label}
        </h3>
        <button onClick={onClose} style={closeBtnStyle} title="Close">✕</button>
      </div>

      <p style={metaStyle}>{node.id}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginBottom: 12 }}>
        <Badge>{node.ext || 'no ext'}</Badge>
        {node.isExternal && <Badge color="#744210">external</Badge>}
        <Badge color="#1a365d">{node.connectionCount} connections</Badge>
      </div>
      <p style={{ ...metaStyle, marginBottom: 4 }}>
        <span style={{ color: '#718096' }}>folder: </span>{node.folder}
      </p>
      {node.size > 0 && (
        <p style={metaStyle}>
          <span style={{ color: '#718096' }}>size: </span>{formatBytes(node.size)}
        </p>
      )}

      <div style={{ borderTop: '1px solid #2d3748', marginTop: 14, paddingTop: 14 }}>
        <h4 style={sectionTitle}>Imports ({imports.length})</h4>
        {imports.length === 0 && <p style={emptyStyle}>No outgoing imports</p>}
        <ul style={listStyle}>
          {imports.map(imp => (
            <li
              key={imp.id}
              style={listItemStyle}
              onClick={() => { const n = findNode(imp.id); if (n) onNodeClick(n); }}
            >
              <span style={{ color: '#a0aec0', fontSize: 11, wordBreak: 'break-all' }}>{imp.id}</span>
              <span style={{ color: '#4a5568', fontSize: 10, flexShrink: 0 }}>{imp.type}</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ borderTop: '1px solid #2d3748', marginTop: 14, paddingTop: 14 }}>
        <h4 style={sectionTitle}>Imported by ({importedBy.length})</h4>
        {importedBy.length === 0 && <p style={emptyStyle}>Not imported by any file</p>}
        <ul style={listStyle}>
          {importedBy.map(imp => (
            <li
              key={imp.id}
              style={listItemStyle}
              onClick={() => { const n = findNode(imp.id); if (n) onNodeClick(n); }}
            >
              <span style={{ color: '#a0aec0', fontSize: 11, wordBreak: 'break-all' }}>{imp.id}</span>
              <span style={{ color: '#4a5568', fontSize: 10, flexShrink: 0 }}>{imp.type}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Badge({ children, color = '#2c5282' }) {
  return (
    <span style={{
      background: color,
      color: '#e2e8f0',
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 4,
      fontWeight: 500,
    }}>
      {children}
    </span>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const sidebarStyle = {
  width: 280,
  background: '#13171f',
  borderLeft: '1px solid #2d3748',
  padding: '16px 14px',
  overflowY: 'auto',
  flexShrink: 0,
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#718096',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 4px',
  flexShrink: 0,
};

const metaStyle = {
  fontSize: 11,
  color: '#718096',
  wordBreak: 'break-all',
  lineHeight: 1.5,
};

const sectionTitle = {
  fontSize: 12,
  fontWeight: 600,
  color: '#a0aec0',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const emptyStyle = {
  fontSize: 11,
  color: '#4a5568',
  fontStyle: 'italic',
};

const listStyle = {
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const listItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 6,
  padding: '4px 6px',
  borderRadius: 4,
  cursor: 'pointer',
  background: 'transparent',
  transition: 'background 0.1s',
  onMouseEnter: undefined, // handled via CSS-in-JS below isn't viable; use :hover via className
};
