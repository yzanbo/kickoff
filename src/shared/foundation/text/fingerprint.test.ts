import assert from "node:assert/strict";
import { test } from "vitest";
import { textFingerprint } from "./fingerprint";

test("textFingerprint: 同じ文は同じ、1 文字違えば違う。長さを頭に付ける", () => {
  const svg = `<svg>${"x".repeat(10_000)}</svg>`;
  assert.equal(textFingerprint(svg), textFingerprint(`${svg}`));
  assert.notEqual(textFingerprint(svg), textFingerprint(svg.replace("x", "y")));
  assert.match(textFingerprint(svg), /^10011:[0-9a-z]+$/);
});
