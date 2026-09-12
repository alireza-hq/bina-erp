const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
// Execute the actual TypeScript modules with only external boundaries replaced.
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/")) return load(path.join("src", name.slice(2) + ".ts"), mocks);
    return require(name);
  };
  new Function("require", "module", "exports", source)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

module.exports = { load };
