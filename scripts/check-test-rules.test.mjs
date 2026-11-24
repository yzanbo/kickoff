import assert from "node:assert/strict";
import { test } from "vitest";
import { findViolations, isTestSource, MAX_HELPER_LINES, MAX_TEST_LINES } from "./check-test-rules.mjs";

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

test("作りに寄りかかる書き方を見つける: 角かっこで名前を読む・偽物に口を生やす・決め打ちの待ち・vi.mock・メモリの DB", () => {
  const lines = [
    code("s.docker", '["operations"].size;'),
    code("(fake as unknown as { x: 1 })", ".x = 2;"),
    code("await new Promise((r) => set", "Timeout(r, 50));"),
    code("vi", '.mock("./x", () => ({}));'),
    code('new Store(":mem', 'ory:");'),
  ];
  assert.deepEqual(
    findViolations(lines.join("\n")).map((v) => v.line),
    [1, 2, 3, 4, 5],
  );
});

test("見逃す書き方: 名前でない角かっこ・型の添字・比べるだけ・0 の待ち", () => {
  const lines = [
    'const type = headers["content-type"];',
    'const status: Chat["status"] = "idle";',
    "const id = list[0].id;",
    code("assert.ok((fake as unknown as { x: 1 })", ".x === 2);"),
    code("await new Promise((r) => set", "Timeout(r, 0));"),
  ];
  assert.deepEqual(findViolations(lines.join("\n")), []);
});

test("ファイルの大きさ: テストは 400 行・補助は 300 行まで。1 行目の test-rules-ignore-file で見逃す", () => {
  const body = (n) => Array.from({ length: n }, (_, i) => `const a${i} = ${i};`).join("\n");
  assert.deepEqual(findViolations(body(MAX_TEST_LINES), "a.test.ts"), []);
  assert.deepEqual(findViolations(body(MAX_TEST_LINES + 1), "a.test.ts").map((v) => v.line), [1]);
  assert.deepEqual(findViolations(body(MAX_HELPER_LINES + 1), "core/testing.ts").map((v) => v.line), [1]);
  assert.deepEqual(findViolations(code("// test-rules-", "ignore-file: 1 つの店の一覧\n") + body(MAX_TEST_LINES + 1), "a.test.ts"), []);
  // ファイルを渡さなければ大きさは見ない
  assert.deepEqual(findViolations(body(MAX_TEST_LINES + 1)), []);
});
