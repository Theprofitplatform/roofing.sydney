import { register } from "node:module";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

/**
 * `public-origin` is deliberately free of `next/server` imports — node's
 * loader cannot resolve that subpath outside the bundler, which is why the
 * helper lives in lib rather than inside the route file.
 */
register("./tsx-loader.mjs", import.meta.url);

const { publicOrigin } = await import("../src/lib/public-origin.ts");

/**
 * Minimal stand-in for NextRequest: `publicOrigin` only reads request headers
 * and `nextUrl`, so building a real one would add a dependency without adding
 * coverage.
 */
function req(headers: Record<string, string>, url = "https://0.0.0.0:3000/auth/callback") {
  const nextUrl = new URL(url);
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    nextUrl: {
      origin: nextUrl.origin,
      protocol: nextUrl.protocol,
    },
  };
}

describe("publicOrigin", () => {
  test("uses the forwarded host nginx sets, not the container's bind address", () => {
    assert.equal(
      publicOrigin(
        req({
          "x-forwarded-host": "app.roofing.sydney",
          "x-forwarded-proto": "https",
          host: "app.roofing.sydney",
        }),
      ),
      "https://app.roofing.sydney",
    );
  });

  test("survives the middleware self-proxy, where Host becomes localhost", () => {
    // The internal rewrite re-enters with Host: localhost but keeps
    // X-Forwarded-Host. Trusting Host here would redirect the operator to
    // their own machine.
    assert.equal(
      publicOrigin(
        req({
          "x-forwarded-host": "app.roofing.sydney",
          "x-forwarded-proto": "https",
          host: "localhost:3000",
        }),
      ),
      "https://app.roofing.sydney",
    );
  });

  test("falls back to Host when there is no proxy, as in next dev", () => {
    assert.equal(
      publicOrigin(
        req({ host: "app.localhost:3000" }, "http://app.localhost:3000/auth/callback"),
      ),
      "http://app.localhost:3000",
    );
  });

  test("refuses a bind address and falls back to nextUrl.origin", () => {
    // The bug this guards: 0.0.0.0 is what Next reports for itself in the
    // standalone server, and a redirect built from it is a dead URL.
    assert.equal(
      publicOrigin(req({ host: "0.0.0.0:3000" })),
      "https://0.0.0.0:3000",
    );
  });

  test("ignores a missing Host entirely rather than emitting 'null'", () => {
    assert.equal(publicOrigin(req({})), "https://0.0.0.0:3000");
  });
});
