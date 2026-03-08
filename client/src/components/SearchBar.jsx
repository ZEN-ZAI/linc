import { useState, useEffect } from 'react';

export function SearchBar({ graphData, onHighlight }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!query.trim() || !graphData) {
        onHighlight(new Set());
        return;
      }
      const q = query.toLowerCase();
      const matching = new Set(
        graphData.nodes
          .filter(n => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
          .map(n => n.id)
      );
      onHighlight(matching);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, graphData]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <input
        type="search"
        placeholder="Search files..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

const inputStyle = {
  width: '100%',
  background: '#2d3748',
  border: '1px solid #4a5568',
  borderRadius: 6,
  padding: '6px 10px',
  color: '#e2e8f0',
  fontSize: 13,
  outline: 'none',
};
