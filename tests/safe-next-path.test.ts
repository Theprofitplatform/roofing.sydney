import { register } from "node:module";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

register("./tsx-loader.mjs", import.meta.url);

const { safeNextPath } = await import("../src/lib/safe-next-path.ts");

describe("safeNextPath", () => {
  test("keeps an ordinary in-app destination", () => {
    assert.equal(safeNextPath("/quotes/42"), "/quotes/42");
    assert.equal(safeNextPath("/"), "/");
  });

  test("defaults to the dashboard when absent", () => {
    assert.equal(safeNextPath(null), "/");
    assert.equal(safeNextPath(undefined), "/");
    assert.equal(safeNextPath(""), "/");
  });

  test("refuses an absolute URL to another host", () => {
    // An open redirect off the login page borrows the operator's trust in it.
    assert.equal(safeNextPath("https://evil.example/harvest"), "/");
    assert.equal(safeNextPath("http://evil.example"), "/");
  });

  test("refuses protocol-relative forms a browser would treat as a host", () => {
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("/\\evil.example"), "/");
  });

  test("does not mistake a path that merely starts with a slash-word", () => {
    assert.equal(safeNextPath("/jobs"), "/jobs");
    assert.equal(safeNextPath("/quotes?status=sent"), "/quotes?status=sent");
  });
});
