// Regex-based Go import parser

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const RAW_STR = /`[^`]*`/g;

// Single import:  import "pkg"  or  import alias "pkg"
const SINGLE_IMPORT_RE = /^[ \t]*import\s+(?:\w+\s+)?"([^"]+)"/gm;
// Block import:  import ( ... )
const BLOCK_IMPORT_RE = /import\s*\(([^)]*)\)/gs;
const BLOCK_LINE_RE = /(?:_|\w+\s+)?"([^"]+)"/g;

export function parseGolang(filePath, source) {
  const cleaned = source
    .replace(RAW_STR, '``')
    .replace(BLOCK_COMMENT, '')
    .replace(LINE_COMMENT, '');

  const deps = [];
  const seen = new Set();

  function add(importPath) {
    if (!importPath || seen.has(importPath)) return;
    seen.add(importPath);
    deps.push({ source: importPath, type: 'import' });
  }

  // Single-line imports
  SINGLE_IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = SINGLE_IMPORT_RE.exec(cleaned)) !== null) add(m[1]);

  // Block imports
  BLOCK_IMPORT_RE.lastIndex = 0;
  while ((m = BLOCK_IMPORT_RE.exec(cleaned)) !== null) {
    BLOCK_LINE_RE.lastIndex = 0;
    let lm;
    while ((lm = BLOCK_LINE_RE.exec(m[1])) !== null) add(lm[1]);
  }

  return deps;
}
