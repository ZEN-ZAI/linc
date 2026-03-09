import { useState, useMemo } from 'react';

/**
 * Build a nested tree from flat folder paths like ["src", "src/components", "src/utils"]
 */
function buildTree(folders) {
  const root = { name: '', children: {}, folders: [] };

  for (const folder of folders) {
    const parts = folder === '.' ? ['.'] : folder.split('/');
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) {
        node.children[part] = { name: part, children: {}, folders: [] };
      }
      node = node.children[part];
    }
    node.folders.push(folder);
  }

  return root;
}

/** Collect all leaf folder paths under a tree node */
function collectFolders(node, allFolders) {
  const result = [...node.folders];
  for (const child of Object.values(node.children)) {
    result.push(...collectFolders(child, allFolders));
  }
  return result;
}

/** Get the check state: 'all' | 'none' | 'partial' */
function getCheckState(node, hiddenFolders) {
  const folders = collectFolders(node);
  if (folders.length === 0) return 'all';
  const hiddenCount = folders.filter(f => hiddenFolders.has(f)).length;
  if (hiddenCount === 0) return 'all';
  if (hiddenCount === folders.length) return 'none';
  return 'partial';
}

function TreeNode({ node, depth, hiddenFolders, onToggle, onToggleAll, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 1);
  const childEntries = Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b));
  const hasChildren = childEntries.length > 0;
  const isLeaf = node.folders.length > 0 && !hasChildren;
  const checkState = getCheckState(node, hiddenFolders);
  const checked = checkState === 'all';
  const indeterminate = checkState === 'partial';

  function handleCheck() {
    const folders = collectFolders(node);
    onToggleAll(folders, checkState === 'all');
  }

  function handleExpand(e) {
    e.stopPropagation();
    setExpanded(v => !v);
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: depth * 14,
          paddingTop: 1,
          paddingBottom: 1,
          cursor: 'pointer',
          fontSize: 12,
          color: checked ? '#a0aec0' : indeterminate ? '#718096' : '#4a5568',
        }}
      >
        {/* Expand/collapse arrow */}
        <span
          onClick={hasChildren ? handleExpand : undefined}
          style={{
            width: 14,
            textAlign: 'center',
            fontSize: 9,
            color: '#4a5568',
            cursor: hasChildren ? 'pointer' : 'default',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : ''}
        </span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flex: 1, minWidth: 0 }}>
          <input
            type="checkbox"
            checked={checked}
            ref={el => { if (el) el.indeterminate = indeterminate; }}
            onChange={handleCheck}
            style={{ accentColor: '#3182ce', flexShrink: 0 }}
          />
          <span style={{ wordBreak: 'break-all', lineHeight: 1.3 }}>{node.name}</span>
        </label>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {childEntries.map(([key, child]) => (
            <TreeNode
              key={key}
              node={child}
              depth={depth + 1}
              hiddenFolders={hiddenFolders}
              onToggle={onToggle}
              onToggleAll={onToggleAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({ folders, hiddenFolders, onToggle, onToggleAll }) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const topLevel = Object.entries(tree.children).sort(([a], [b]) => a.localeCompare(b));

  if (topLevel.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
      {topLevel.map(([key, node]) => (
        <TreeNode
          key={key}
          node={node}
          depth={0}
          hiddenFolders={hiddenFolders}
          onToggle={onToggle}
          onToggleAll={onToggleAll}
          defaultExpanded
        />
      ))}
    </div>
  );
}
