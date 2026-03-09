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
  '**/target/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/bin/**',
  '**/obj/**',
  '**/vendor/**',
];

const RESOLVE_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.cs', '.go'];

// Strip JSONC features: comments and trailing commas (tsconfig.json supports these)
// Single char-by-char walk handles everything in a string-aware way
function stripJsonComments(text) {
  let result = '';
  let i = 0;
  while (i < text.length) {
    // String literal — copy verbatim
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j++; // skip escaped char
        j++;
      }
      result += text.slice(i, j + 1);
      i = j + 1;
    // Line comment
    } else if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    // Block comment
    } else if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    // Trailing comma — peek ahead past whitespace for } or ]
    } else if (text[i] === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length && (text[j] === '}' || text[j] === ']')) {
        i++; // drop the trailing comma
      } else {
        result += text[i++];
      }
    } else {
      result += text[i++];
    }
  }
  return result;
}

// Read and parse a single tsconfig/jsconfig file (throws on ENOENT or parse error)
async function readTsConfig(configPath) {
  const raw = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(stripJsonComments(raw));
}

// Resolve compilerOptions.paths from a parsed config, following "extends" chain
async function resolvePathsFromConfig(configPath, visited = new Set()) {
  if (visited.has(configPath)) return null; // circular extends guard
  visited.add(configPath);

  const config = await readTsConfig(configPath); // throws if file missing or malformed
  const configDir = path.dirname(configPath);
  const baseUrl = config.compilerOptions?.baseUrl || '.';
  const paths = config.compilerOptions?.paths;

  if (paths) {
    return { absBase: path.resolve(configDir, baseUrl), paths };
  }

  // No paths — follow "extends" to inherit from parent config
  if (config.extends) {
    const parentPath = config.extends.endsWith('.json')
      ? path.resolve(configDir, config.extends)
      : path.resolve(configDir, config.extends + '.json');
    try {
      return await resolvePathsFromConfig(parentPath, visited);
    } catch { /* extends target missing/broken — treat as no paths */ }
  }

  return null; // config found, no paths, no extends — authoritative
}

// Sort path patterns by specificity: exact matches first, then longest prefix+suffix
function sortPathEntries(paths) {
  return Object.entries(paths).sort(([a], [b]) => {
    const aStarIdx = a.indexOf('*');
    const bStarIdx = b.indexOf('*');
    const aExact = aStarIdx === -1;
    const bExact = bStarIdx === -1;
    if (aExact !== bExact) return aExact ? -1 : 1;
    const aLen = aExact ? a.length : aStarIdx + (a.length - aStarIdx - 1);
    const bLen = bExact ? b.length : bStarIdx + (b.length - bStarIdx - 1);
    return bLen - aLen || a.localeCompare(b);
  });
}

async function loadTsPaths(rootPath) {
  const tsConfigNames = ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json'];
  // Search rootPath and up to 3 parent directories
  let dir = rootPath;
  for (let depth = 0; depth < 4; depth++) {
    for (const name of tsConfigNames) {
      const configPath = path.join(dir, name);
      try {
        const result = await resolvePathsFromConfig(configPath);
        if (result) {
          result.sortedEntries = sortPathEntries(result.paths);
          return result;
        }
        // Config found but no paths (even after extends) — authoritative, stop
        return null;
      } catch (err) {
        if (err?.code === 'ENOENT') continue; // file not found, try next name
        return null; // parse error = authoritative, stop
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

function tryResolveTsPaths(specifier, tsConfig, allFilePaths) {
  if (!tsConfig) return null;
  const { absBase, sortedEntries } = tsConfig;

  for (const [pattern, mappings] of sortedEntries) {
    const starIdx = pattern.indexOf('*');
    if (starIdx === -1) {
      // Exact match: "@components" -> ["./src/components/index.ts"]
      if (specifier !== pattern) continue;
      for (const mapping of mappings) {
        const candidate = path.resolve(absBase, mapping);
        const resolved = tryResolve(candidate, allFilePaths);
        if (resolved) return resolved;
      }
    } else {
      // Wildcard: "@/*" -> ["./src/*"]
      const prefix = pattern.slice(0, starIdx);
      const suffix = pattern.slice(starIdx + 1);
      if (!specifier.startsWith(prefix)) continue;
      if (suffix && !specifier.endsWith(suffix)) continue;
      const captured = specifier.slice(prefix.length, suffix ? -suffix.length || undefined : undefined);
      for (const mapping of mappings) {
        const mapped = mapping.replace('*', captured);
        const candidate = path.resolve(absBase, mapped);
        const resolved = tryResolve(candidate, allFilePaths);
        if (resolved) return resolved;
      }
    }
  }
  return null;
}

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

  // 3b. Load TypeScript path aliases (tsconfig.json / jsconfig.json)
  const tsConfig = await loadTsPaths(rootPath);

  // 3c. Read go.mod for Go module name (used to detect internal imports)
  let goModuleName = null;
  try {
    const goModContent = await fs.readFile(path.join(rootPath, 'go.mod'), 'utf-8');
    const modMatch = goModContent.match(/^module\s+(\S+)/m);
    if (modMatch) goModuleName = modMatch[1];
  } catch { /* no go.mod */ }

  // 3d. First pass: collect C# namespace declarations → namespace → absPath
  const nsToFile = new Map();
  for (const [absPath, deps] of parsedMap) {
    if (path.extname(absPath).toLowerCase() !== '.cs') continue;
    for (const dep of deps) {
      if (dep.type === 'ns_decl' && dep.nsDecl && !nsToFile.has(dep.nsDecl)) {
        nsToFile.set(dep.nsDecl, absPath);
      }
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
  const tsPathCache = new Map(); // specifier -> resolved|null (memoize path alias lookups)
  const JS_TS_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

  for (const [absPath, deps] of parsedMap) {
    const fromId = path.relative(rootPath, absPath).replace(/\\/g, '/');

    const srcExt = path.extname(absPath).toLowerCase();

    for (const dep of deps) {
      let targetId;
      let isExternal = false;

      // Skip namespace declarations (C# ns_decl = declaration, not a dependency)
      if (dep.type === 'ns_decl') continue;

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
        // Bare specifier — try TypeScript path aliases, then language-specific resolution
        let internalResolved = false;

        // Only attempt TS path resolution for JS/TS files
        let tsResolved = null;
        if (JS_TS_EXTS.has(srcExt)) {
          if (tsPathCache.has(dep.source)) {
            tsResolved = tsPathCache.get(dep.source);
          } else {
            tsResolved = tryResolveTsPaths(dep.source, tsConfig, allFilePaths);
            tsPathCache.set(dep.source, tsResolved);
          }
        }
        if (tsResolved) {
          targetId = path.relative(rootPath, tsResolved).replace(/\\/g, '/');
          internalResolved = true;
        } else if (srcExt === '.cs') {
          // C# using directive: check against namespace→file map
          const nsFile = nsToFile.get(dep.source);
          if (nsFile) {
            targetId = path.relative(rootPath, nsFile).replace(/\\/g, '/');
            internalResolved = true;
          }
        } else if (srcExt === '.go' && goModuleName && dep.source.startsWith(goModuleName + '/')) {
          // Go internal import: strip module prefix and resolve directory
          const subPath = dep.source.slice(goModuleName.length + 1);
          const candidate = path.resolve(rootPath, subPath);
          const resolved = tryResolve(candidate, allFilePaths);
          if (resolved) {
            targetId = path.relative(rootPath, resolved).replace(/\\/g, '/');
            internalResolved = true;
          }
        }

        if (!internalResolved) {
          // External package
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

  // 6. Eliminate index files: rewire links through them, then remove
  const INDEX_RE = /^index\.[jt]sx?$|^index\.(?:mjs|cjs)$/;
  const indexNodeIds = new Set();
  for (const node of nodes) {
    if (INDEX_RE.test(path.basename(node.id))) {
      indexNodeIds.add(node.id);
    }
  }

  for (const indexId of indexNodeIds) {
    const incoming = [];
    const outgoing = [];
    for (const link of rawLinks.values()) {
      if (link.target === indexId) incoming.push(link);
      if (link.source === indexId) outgoing.push(link);
    }

    // Create pass-through links: A → index → B becomes A → B
    for (const inLink of incoming) {
      for (const outLink of outgoing) {
        if (inLink.source === outLink.target) continue;
        const key = `${inLink.source}|||${outLink.target}`;
        const strength = Math.min(inLink.strength, outLink.strength);
        if (!rawLinks.has(key) || rawLinks.get(key).strength < strength) {
          rawLinks.set(key, {
            source: inLink.source,
            target: outLink.target,
            type: inLink.type,
            strength,
          });
        }
      }
    }

    // Remove all links involving this index node
    for (const [key, link] of rawLinks) {
      if (link.source === indexId || link.target === indexId) {
        rawLinks.delete(key);
      }
    }
  }

  // Remove index nodes
  let i = nodes.length;
  while (i--) {
    if (indexNodeIds.has(nodes[i].id)) {
      nodeById.delete(nodes[i].id);
      nodes.splice(i, 1);
    }
  }

  // 7. Merge external nodes into nodes array
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
