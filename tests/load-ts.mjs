import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export function createLoader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const loadedModule = { exports: {} }; cache.set(absolute, loadedModule);
    const code = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const localRequire = specifier => {
      if (specifier in mocks) return mocks[specifier];
      if (specifier === 'server-only') return {};
      if (specifier.startsWith('@/')) return load(path.resolve(specifier.slice(2)) + '.ts');
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(absolute), specifier) + (specifier.endsWith('.ts') ? '' : '.ts'));
      return require(specifier);
    };
    new Function('require', 'module', 'exports', code)(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}
