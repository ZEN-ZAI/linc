// Regex-based Python import parser
// Strips comments and string literals to avoid false positives in docstrings

const TRIPLE_DOUBLE = /"""[\s\S]*?"""/g;
const TRIPLE_SINGLE = /'''[\s\S]*?'''/g;
const INLINE_COMMENT = /#[^\n]*/g;
const DOUBLE_STR = /"[^"\\]*(?:\\.[^"\\]*)*"/g;
const SINGLE_STR = /'[^'\\]*(?:\\.[^'\\]*)*'/g;

// Matches:
//   from X.Y.Z import foo, bar
//   import X, Y
//   import X as Y
const IMPORT_RE = /^[ \t]*(?:from\s+([\w.]+)\s+import\s+[\w,\s*()\\]+|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))$/gm;

export function parsePython(filePath, sourceCode) {
  const cleaned = sourceCode
    .replace(TRIPLE_DOUBLE, '""')
    .replace(TRIPLE_SINGLE, "''")
    .replace(INLINE_COMMENT, '')
    .replace(DOUBLE_STR, '""')
    .replace(SINGLE_STR, "''");

  const deps = [];
  IMPORT_RE.lastIndex = 0;
  let match;

  while ((match = IMPORT_RE.exec(cleaned)) !== null) {
    if (match[1]) {
      // from X import Y → source is X
      deps.push({ source: match[1], type: 'import' });
    } else if (match[2]) {
      // import X, Y, Z → multiple sources
      for (const mod of match[2].split(',')) {
        const name = mod.trim().split(/\s+/)[0]; // handle 'import X as Y'
        if (name) deps.push({ source: name, type: 'import' });
      }
    }
  }

  return deps;
}
