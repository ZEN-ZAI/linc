import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

// ESM interop — @babel/traverse uses CJS default export
const traverse = _traverse.default ?? _traverse;

const BABEL_OPTS = {
  sourceType: 'module',
  strictMode: false,
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  errorRecovery: true,
  plugins: [
    'jsx',
    'typescript',
    ['decorators', { decoratorsBeforeExport: true }],
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'dynamicImport',
    'exportDefaultFrom',
    'exportNamespaceFrom',
    'optionalChaining',
    'nullishCoalescingOperator',
    'objectRestSpread',
  ],
};

const BABEL_OPTS_FALLBACK = {
  sourceType: 'module',
  strictMode: false,
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  errorRecovery: true,
  plugins: ['jsx', 'dynamicImport', 'objectRestSpread'],
};

export function parseJavaScript(filePath, sourceCode) {
  let ast;
  try {
    ast = parse(sourceCode, BABEL_OPTS);
  } catch {
    try {
      ast = parse(sourceCode, BABEL_OPTS_FALLBACK);
    } catch {
      return [];
    }
  }

  const deps = [];

  try {
    traverse(ast, {
      // import foo from './foo'
      // import { bar } from './bar'
      ImportDeclaration({ node }) {
        if (node.source?.value) {
          deps.push({ source: node.source.value, type: 'import' });
        }
      },

      // export { foo } from './foo'
      ExportNamedDeclaration({ node }) {
        if (node.source?.value) {
          deps.push({ source: node.source.value, type: 'reexport' });
        }
      },

      // export * from './utils'
      ExportAllDeclaration({ node }) {
        if (node.source?.value) {
          deps.push({ source: node.source.value, type: 'reexport' });
        }
      },

      // const x = require('./x')  |  import('./lazy')
      CallExpression({ node }) {
        // require('...')
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'StringLiteral'
        ) {
          deps.push({ source: node.arguments[0].value, type: 'require' });
        }
        // import('...')
        if (
          node.callee.type === 'Import' &&
          node.arguments[0]?.type === 'StringLiteral'
        ) {
          deps.push({ source: node.arguments[0].value, type: 'dynamic' });
        }
      },

      // class Foo extends Bar
      ClassDeclaration({ node }) {
        if (node.superClass?.type === 'Identifier') {
          deps.push({ source: null, type: 'inheritance', inherited: node.superClass.name });
        }
      },
      ClassExpression({ node }) {
        if (node.superClass?.type === 'Identifier') {
          deps.push({ source: null, type: 'inheritance', inherited: node.superClass.name });
        }
      },
    });
  } catch {
    // Traverse errors on malformed ASTs — return what we have
  }

  return deps;
}
