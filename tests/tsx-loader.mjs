/**
 * Module hook that transpiles `.tsx` for `node --test`.
 *
 * Node's built-in type stripping handles `.ts` but refuses `.tsx` — it erases
 * types, it does not transform JSX. The quote PDF is the only JSX outside the
 * Next.js build, so rather than pull in a test bundler this hook hands those
 * files to the TypeScript compiler that already ships as a devDependency.
 *
 * Registered from within the test that needs it, so the plain `.ts` suites keep
 * running on native stripping with no loader in the path.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * tsconfig sets `moduleResolution: "bundler"`, so source files may omit the
 * extension on a relative import; Next's bundler resolves it. Node resolves
 * specifiers literally and would throw. Filling in the extension here keeps the
 * test runner honest about what the bundler will do at build time.
 */
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of [".ts", ".tsx"]) {
      const candidate = new URL(base.href + ext);
      if (existsSync(fileURLToPath(candidate))) {
        return nextResolve(specifier + ext, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:") || !url.endsWith(".tsx")) return nextLoad(url, context);

  const source = await readFile(fileURLToPath(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      // Preserve the specifier verbatim: the source imports "../db/types.ts"
      // and the runtime resolves it literally, exactly as tsconfig intends.
      verbatimModuleSyntax: false,
    },
  });

  return { format: "module", shortCircuit: true, source: outputText };
}
