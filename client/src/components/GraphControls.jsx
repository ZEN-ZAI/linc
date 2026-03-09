import { useState } from 'react';

export function GraphControls({
  forceStrength, onForceStrengthChange,
  linkDistance, onLinkDistanceChange,
  onFitView, onResetLayout,
  viewMode, onViewMode,
  showClusters, onClustersChange,
  is3D, onToggle3D,
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {open && (
        <div style={{
          background: '#13171f',
          border: '1px solid #1e2535',
          borderRadius: 8,
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          marginBottom: 6,
        }}>
          {/* Row 1: sliders */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SliderRow
              label="Repulsion"
              value={forceStrength}
              min={0.3} max={3} step={0.1}
              display={`${forceStrength.toFixed(1)}×`}
              onChange={onForceStrengthChange}
            />
            <Divider />
            <SliderRow
              label="Link dist"
              value={linkDistance}
              min={40} max={300} step={10}
              display={`${linkDistance}`}
              onChange={onLinkDistanceChange}
            />
          </div>

          <HRule />

          {/* Row 2: buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn onClick={onFitView}>⊡ Fit</Btn>
              <Btn onClick={onResetLayout}>⟳ Reset</Btn>
            </div>
            <Divider />
            <div style={{ display: 'flex', gap: 4 }}>
              <ToggleBtn
                active={viewMode === 'depth'}
                onClick={() => onViewMode('depth')}
                activeColor="#90cdf4" activeBg="#1a2f4a"
              >
                Depth
              </ToggleBtn>
              <ToggleBtn
                active={showClusters}
                onClick={() => onClustersChange(!showClusters)}
                activeColor="#9ae6b4" activeBg="#1a3328"
              >
                Clusters
              </ToggleBtn>
            </div>
            <Divider />
            <ToggleBtn
              active={is3D}
              onClick={onToggle3D}
              activeColor="#d6bcfa" activeBg="#322659"
            >
              3D
            </ToggleBtn>
          </div>
        </div>
      )}

      {/* Toggle tab */}
      <button
        onClick={() => setOpen(v => !v)}
        title={open ? 'Hide controls' : 'Show controls'}
        style={{
          background: '#13171f',
          border: '1px solid #1e2535',
          borderRadius: 6,
          color: '#4a5568',
          fontSize: 11,
          padding: '3px 10px',
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
      >
        {open ? '▾ hide' : '▴ controls'}
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 22, background: '#1e2535', flexShrink: 0 }} />;
}

function HRule() {
  return <div style={{ height: 1, background: '#1e2535' }} />;
}

function Btn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 8px',
        background: '#1a202c',
        border: '1px solid #2d3748',
        borderRadius: 5,
        color: '#a0aec0',
        fontSize: 11,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function ToggleBtn({ active, onClick, activeColor, activeBg, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 8px',
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        background: active ? activeBg : '#1a202c',
        color: active ? activeColor : '#718096',
        border: `1px solid ${active ? activeColor + '80' : '#2d3748'}`,
      }}
    >
      {children}
    </button>
  );
}

function SliderRow({ label, value, min, max, step, display, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#718096' }}>{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: 90, accentColor: '#3182ce', cursor: 'pointer' }}
      />
      <span style={{ fontSize: 11, color: '#a0aec0', fontFamily: 'monospace', width: 32 }}>{display}</span>
    </div>
  );
}
