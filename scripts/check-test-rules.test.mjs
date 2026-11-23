import assert from "node:assert/strict";
import { test } from "vitest";
import { findViolations, isTestSource } from "./check-test-rules.mjs";

// 見張りの対象の書き方をそのまま書くと、このファイル自体が見張りに引っかかるので、つないで作る
const code = (...parts) => parts.join("");

test("前のテストの値を残す書き方を見つける", () => {
  const lines = [
    code('import { test } from "node', ':test";'),
    code("globalThis", ".fetch = fake;"),
    code("globalThis", '["window"] = {};'),
    code("Object.assign(", "globalThis, { window });"),
    code("process.env", ".HOME = dir;"),
    code("process.env", '["KICKOFF_X"] = "1";'),
    code("delete ", "process.env.HOME;"),
    code("process", '.chdir("/tmp");'),
    code("process.env", "[key] ??= value;"),
    code("process.env", ".X ||= \"1\";"),
    code("globalThis", ".fetch &&= fake;"),
  ];
  const found = findViolations(lines.join("\n"));
  assert.deepEqual(
    found.map((v) => v.line),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
});

test("読むだけ・比べるだけ・説明のコメントは見逃す", () => {
  const lines = [
    code("const home = process.env", ".HOME;"),
    code("if (process.env", ".CI === undefined) {}"),
    code("assert.ok(globalThis", ".fetch == null);"),
    code("// globalThis", ".fetch = fake; と書かない"),
    code(' * process.env', '.HOME = … ではなく vi.stubEnv'),
    'vi.stubEnv("HOME", dir);',
    'vi.stubGlobal("fetch", fake);',
  ];
  assert.deepEqual(findViolations(lines.join("\n")), []);
});

test("test-rules-ignore を同じ行か 1 つ上の行に書けば見逃す", () => {
  const text = [
    code("process.env", ".X = 1; // test-rules-ignore: 子プロセスに渡す"),
    "// test-rules-ignore: 理由",
    code("process.env", ".Y = 1;"),
    code("process.env", ".Z = 1;"),
  ].join("\n");
  assert.deepEqual(
    findViolations(text).map((v) => v.line),
    [4],
  );
});

test("見張るのはテストのファイルとテストの補助だけ", () => {
  assert.equal(isTestSource("src/features/chat/core/send.test.ts"), true);
  assert.equal(isTestSource("scripts/check-test-rules.test.mjs"), true);
  assert.equal(isTestSource("src/features/database/worker/drivers.dbtest.ts"), true);
  assert.equal(isTestSource("src/foundation/core/testing/quietShell.ts"), true);
  assert.equal(isTestSource("src/shared/foundation/testing/data.ts"), true);
  assert.equal(isTestSource("src/shared/chat/testing.ts"), true);
  assert.equal(isTestSource("vitest.setup.ts"), true);
  assert.equal(isTestSource("src/features/chat/core/send.ts"), false);
  assert.equal(isTestSource("src/foundation/ui/storage/storage.ts"), false);
});
