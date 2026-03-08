import path from 'path';
import fs from 'fs/promises';
import { parseJavaScript } from './javascript.js';
import { parsePython } from './python.js';

const EXT_MAP = {
  '.js':  parseJavaScript,
  '.jsx': parseJavaScript,
  '.ts':  parseJavaScript,
  '.tsx': parseJavaScript,
  '.mjs': parseJavaScript,
  '.cjs': parseJavaScript,
  '.py':  parsePython,
};

export const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXT_MAP));

export async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const parser = EXT_MAP[ext];
  if (!parser) return [];

  let source;
  try {
    source = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  return parser(filePath, source);
}
