/**
 * Resolves the `@/…` path alias for `node --test`.
 *
 * tsconfig maps `@/*` to `src/*` and Next's bundler honours it, but Node
 * resolves specifiers literally and sees a bare package name. The other test
 * suites sidestep this because the modules they exercise only import `@/…` for
 * TYPES, which type stripping erases before Node ever sees them. The quotes
 * helpers import real functions from `@/lib/money`, so the alias has to exist at
 * runtime for them to be testable at all.
 *
 * Deliberately a resolve hook and nothing more: no transpiling, no source
 * rewriting. Node's native type stripping still does the work.
 */

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(dirname(fileURLToPath(import.meta.url))), "src");

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = join(SRC, specifier.slice(2));
    // tsconfig's "bundler" resolution lets source omit the extension.
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  // Aliased modules import each other with bare relative specifiers, which the
  // bundler resolves and Node does not. Fill the extension in rather than
  // short-circuiting, so Node's own type stripping still handles the file.
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of [".ts", ".tsx"]) {
      if (existsSync(fileURLToPath(new URL(base.href + ext)))) {
        return nextResolve(specifier + ext, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
