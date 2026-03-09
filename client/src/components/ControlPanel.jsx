import { useMemo } from 'react';
import { SearchBar } from './SearchBar.jsx';

// Detect Tauri desktop context
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function ControlPanel({
  graphData,
  filters,
  onFilterChange,
  analyzePath,
  onPathChange,
  onAnalyze,
  onClear,
  loading,
  onHighlight,
  meta,
}) {
  async function handlePickFolder() {
    try {
      if (isTauri()) {
        // Use native Tauri dialog — works reliably inside the desktop webview
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({ directory: true, multiple: false, title: 'Select a project folder' });
        if (selected) { onPathChange(selected); onAnalyze(selected); }
      } else {
        // Browser fallback: ask the Express backend to spawn osascript/zenity
        const res = await fetch('/api/pick-folder');
        const data = await res.json();
        if (data.path) { onPathChange(data.path); onAnalyze(data.path); }
      }
    } catch { /* cancelled or unsupported */ }
  }

  const { fileTypes, folders } = useMemo(() => {
    if (!graphData) return { fileTypes: [], folders: [] };
    const exts = [...new Set(graphData.nodes.filter(n => !n.isExternal).map(n => n.ext))].sort();
    const dirs = [...new Set(graphData.nodes.filter(n => !n.isExternal).map(n => n.folder))].sort();
    return { fileTypes: exts, folders: dirs };
  }, [graphData]);

  function toggleExt(ext) {
    const next = new Set(filters.hiddenFileTypes);
    if (next.has(ext)) next.delete(ext); else next.add(ext);
    onFilterChange({ ...filters, hiddenFileTypes: next });
  }

  function toggleFolder(folder) {
    const next = new Set(filters.hiddenFolders);
    if (next.has(folder)) next.delete(folder); else next.add(folder);
    onFilterChange({ ...filters, hiddenFolders: next });
  }

  const handleKeyDown = e => { if (e.key === 'Enter') onAnalyze(analyzePath); };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
          linc
        </h1>
        <p style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>dependency graph</p>
      </div>

      {/* Path input */}
      <section style={sectionStyle}>
        <label style={labelStyle}>Project Path</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={analyzePath}
            onChange={e => onPathChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/path/to/project"
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            spellCheck={false}
          />
          <button
            onClick={handlePickFolder}
            title="Browse for folder"
            style={{
              ...inputStyle,
              flex: 'none', width: 30, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 14,
              border: '1px solid #4a5568', borderRadius: 6,
              background: '#1a202c', color: '#a0aec0',
            }}
          >
            ⌘
          </button>
        </div>
        <button
          onClick={() => onAnalyze(analyzePath)}
          disabled={loading || !analyzePath.trim()}
          style={{ ...btnStyle, marginTop: 6, opacity: loading || !analyzePath.trim() ? 0.5 : 1 }}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
        {graphData && (
          <button
            onClick={onClear}
            style={{
              ...btnStyle, marginTop: 4,
              background: 'transparent',
              color: '#718096',
              border: '1px solid #2d3748',
            }}
          >
            Clear graph
          </button>
        )}
        {meta && (
          <p style={{ fontSize: 10, color: '#4a5568', marginTop: 6 }}>
            {meta.fileCount} files · {new Date(meta.parsedAt).toLocaleTimeString()}
          </p>
        )}
      </section>

      {/* Search */}
      <section style={sectionStyle}>
        <label style={labelStyle}>Search</label>
        <SearchBar graphData={graphData} onHighlight={onHighlight} />
      </section>

      {/* External toggle */}
      <section style={sectionStyle}>
        <CheckRow
          checked={filters.showExternal}
          onChange={v => onFilterChange({ ...filters, showExternal: v })}
          label="Show node_modules"
        />
      </section>

      {/* File types */}
      {fileTypes.length > 0 && (
        <section style={sectionStyle}>
          <label style={labelStyle}>File Types</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {fileTypes.map(ext => {
              const visible = !filters.hiddenFileTypes.has(ext);
              return (
                <button
                  key={ext}
                  onClick={() => toggleExt(ext)}
                  title={visible ? `Hide .${ext} files` : `Show .${ext} files`}
                  style={{
                    ...tagStyle,
                    background: visible ? '#2c5282' : '#1a202c',
                    color: visible ? '#bee3f8' : '#4a5568',
                    border: visible ? '1px solid #2b6cb0' : '1px solid #2d3748',
                  }}
                >
                  .{ext || '?'}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Folders */}
      {folders.length > 0 && (
        <section style={sectionStyle}>
          <label style={labelStyle}>Folders</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
            {folders.map(folder => (
              <CheckRow
                key={folder}
                checked={!filters.hiddenFolders.has(folder)}
                onChange={() => toggleFolder(folder)}
                label={folder}
              />
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
      {graphData && (
        <section style={{ ...sectionStyle, marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #1a202c' }}>
          <p style={{ fontSize: 11, color: '#4a5568' }}>
            {graphData.nodes.filter(n => !n.isExternal).length} files
            · {graphData.links.length} edges
          </p>
          <p style={{ fontSize: 11, color: '#4a5568' }}>
            {graphData.nodes.filter(n => n.connectionCount === 0).length} orphans
          </p>
        </section>
      )}
    </div>
  );
}

function CheckRow({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: checked ? '#a0aec0' : '#4a5568' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: '#3182ce' }}
      />
      <span style={{ wordBreak: 'break-all' }}>{label}</span>
    </label>
  );
}



const panelStyle = {
  width: 220,
  background: '#13171f',
  borderRight: '1px solid #1a202c',
  padding: '16px 14px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  flexShrink: 0,
};

const sectionStyle = {
  marginBottom: 18,
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#718096',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  background: '#1a202c',
  border: '1px solid #2d3748',
  borderRadius: 6,
  padding: '6px 8px',
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'monospace',
};

const btnStyle = {
  width: '100%',
  background: '#2b6cb0',
  color: '#bee3f8',
  border: 'none',
  borderRadius: 6,
  padding: '7px 12px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const tagStyle = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'monospace',
};
