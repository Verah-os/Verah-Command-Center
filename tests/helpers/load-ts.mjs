import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute production modules with only transport/framework dependencies replaced.
// No copies of business logic: both mobile insert and concierge select run here.
export function loadTs(path, dependencies) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: path,
  });
  const module = { exports: {} };
  const require = (name) => {
    if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", outputText)(require, module, module.exports);
  return module.exports;
}
