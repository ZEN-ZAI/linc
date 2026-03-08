// Regex-based C# import parser
// Extracts using directives and namespace declarations

const VERBATIM_STR = /@"(?:[^"]|"")*"/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const STRING_LIT = /"(?:[^"\\]|\\.)*"/g;

// using [static] [Alias =] Namespace.Name;
const USING_RE = /^[ \t]*using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/gm;
// namespace declaration (file-level)
const NS_RE = /\bnamespace\s+([\w.]+)/;

export function parseCSharp(filePath, source) {
  const cleaned = source
    .replace(VERBATIM_STR, '""')
    .replace(BLOCK_COMMENT, '')
    .replace(LINE_COMMENT, '')
    .replace(STRING_LIT, '""');

  const deps = [];

  // Emit namespace declaration so builder can build namespace→file map
  const nsMatch = NS_RE.exec(cleaned);
  if (nsMatch) {
    deps.push({ source: null, type: 'ns_decl', nsDecl: nsMatch[1] });
  }

  // Emit each using directive
  USING_RE.lastIndex = 0;
  let match;
  while ((match = USING_RE.exec(cleaned)) !== null) {
    const ns = match[1].trim();
    if (ns) deps.push({ source: ns, type: 'import' });
  }

  return deps;
}
