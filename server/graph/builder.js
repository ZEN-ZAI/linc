import path from 'path';
import fs from 'fs/promises';
import { glob } from 'glob';
import { parseFile, SUPPORTED_EXTENSIONS } from '../parsers/index.js';

const TYPE_STRENGTH = {
  import:      1.0,
  reexport:    0.9,
  require:     0.8,
  inheritance: 0.7,
  dynamic:     0.5,
};

const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
];

const RESOLVE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py'];

export async function buildGraph(rootPath, options = {}) {
  const { includeExternal = false } = options;

  // 1. Discover all files
  const patterns = [...SUPPORTED_EXTENSIONS].map(ext => `**/*${ext}`);
  const files = await glob(patterns, {
    cwd: rootPath,
    ignore: DEFAULT_EXCLUDES,
    absolute: true,
    nodir: true,
  });

  if (files.length === 0) {
    return { nodes: [], links: [], meta: { rootPath, fileCount: 0, parsedAt: new Date().toISOString() } };
  }

  // 2. Build absolute-path set for resolution
  const allFilePaths = new Set(files);

  // 3. Parse all files in parallel (batched to avoid fd limits)
  const BATCH = 50;
  const parsedMap = new Map(); // absolutePath -> DependencyRecord[]
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(f => parseFile(f).then(deps => [f, deps])));
    for (const [filePath, deps] of results) {
      parsedMap.set(filePath, deps);
    }
  }

  // 4. Build node map (nodeId = relative path from root)
  const nodes = [];
  const nodeById = new Map(); // nodeId -> node

  for (const absPath of files) {
    const relPath = path.relative(rootPath, absPath);
    const nodeId = relPath.replace(/\\/g, '/'); // normalize to forward slashes
    let stat;
    try { stat = await fs.stat(absPath); } catch { stat = { size: 0 }; }

    const node = {
      id: nodeId,
      label: path.basename(absPath),
      folder: path.relative(rootPath, path.dirname(absPath)).replace(/\\/g, '/') || '.',
      ext: path.extname(absPath).slice(1),
      connectionCount: 0,
      isExternal: false,
      size: stat.size,
    };
    nodes.push(node);
    nodeById.set(nodeId, node);
  }

  // 5. Resolve specifiers and build raw links
  const rawLinks = new Map(); // `src|tgt` -> { source, target, type, strength }
  const externalNodes = new Map(); // externalId -> node

  for (const [absPath, deps] of parsedMap) {
    const fromId = path.relative(rootPath, absPath).replace(/\\/g, '/');

    for (const dep of deps) {
      let targetId;
      let isExternal = false;

      if (dep.source === null) {
        // Inheritance — skip (can't resolve class name to file without symbol table)
        continue;
      }

      if (dep.source.startsWith('.') || dep.source.startsWith('/')) {
        // Relative/absolute specifier
        const fromDir = path.dirname(absPath);
        const candidate = dep.source.startsWith('/')
          ? dep.source
          : path.resolve(fromDir, dep.source);

        const resolved = tryResolve(candidate, allFilePaths);
        if (!resolved) continue; // unresolvable — skip

        targetId = path.relative(rootPath, resolved).replace(/\\/g, '/');
      } else {
        // Bare specifier = external package
        isExternal = true;
        // Strip sub-path (e.g. 'lodash/merge' → 'lodash')
        const pkgName = dep.source.startsWith('@')
          ? dep.source.split('/').slice(0, 2).join('/')
          : dep.source.split('/')[0];
        targetId = `[ext] ${pkgName}`;

        if (!externalNodes.has(targetId) && includeExternal) {
          const extNode = {
            id: targetId,
            label: pkgName,
            folder: 'node_modules',
            ext: '',
            connectionCount: 0,
            isExternal: true,
            size: 0,
          };
          externalNodes.set(targetId, extNode);
        }
      }

      if (isExternal && !includeExternal) continue;

      const key = `${fromId}|||${targetId}`;
      const strength = TYPE_STRENGTH[dep.type] ?? 0.5;

      if (!rawLinks.has(key) || rawLinks.get(key).strength < strength) {
        rawLinks.set(key, {
          source: fromId,
          target: targetId,
          type: dep.type,
          strength,
        });
      }
    }
  }

  // 6. Merge external nodes into nodes array
  if (includeExternal) {
    for (const extNode of externalNodes.values()) {
      nodes.push(extNode);
      nodeById.set(extNode.id, extNode);
    }
  }

  // 7. Filter links to only those where both endpoints exist
  const validNodeIds = new Set(nodes.map(n => n.id));
  const links = [];
  for (const link of rawLinks.values()) {
    if (validNodeIds.has(link.source) && validNodeIds.has(link.target)) {
      links.push(link);
    }
  }

  // 8. Compute connection counts
  const inDegree = new Map();
  const outDegree = new Map();
  for (const link of links) {
    outDegree.set(link.source, (outDegree.get(link.source) || 0) + 1);
    inDegree.set(link.target, (inDegree.get(link.target) || 0) + 1);
  }
  for (const node of nodes) {
    node.connectionCount = (inDegree.get(node.id) || 0) + (outDegree.get(node.id) || 0);
  }

  return {
    nodes,
    links,
    meta: {
      rootPath,
      fileCount: files.length,
      parsedAt: new Date().toISOString(),
    },
  };
}

function tryResolve(candidate, allFilePaths) {
  // 1. Exact match
  if (allFilePaths.has(candidate)) return candidate;

  // 2. Try adding extensions
  for (const ext of RESOLVE_EXTS) {
    const withExt = candidate + ext;
    if (allFilePaths.has(withExt)) return withExt;
  }

  // 3. Try as directory index
  for (const ext of RESOLVE_EXTS) {
    const asIndex = path.join(candidate, `index${ext}`);
    if (allFilePaths.has(asIndex)) return asIndex;
  }

  return null;
}
