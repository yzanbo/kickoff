import assert from "node:assert/strict";
import { test } from "vitest";
import { composeFileList, parseEnvLine, readEnvVars } from "./envFile";

test("parseEnvLine: export・空白・囲み・行末のコメントを書いたまま読み、変数の行でなければ null", () => {
  assert.deepEqual(parseEnvLine('  export DB_URL = "postgres://x:5432/db" # 本体'), { head: "  export ", key: "DB_URL", eq: " = ", value: '"postgres://x:5432/db" # 本体' });
  assert.deepEqual(parseEnvLine("vite.port=3000"), { head: "", key: "vite.port", eq: "=", value: "3000" });
  assert.equal(parseEnvLine("# COMPOSE_FILE=a.yaml"), null);
  assert.equal(parseEnvLine(""), null);
});

test("readEnvVars・composeFileList: 囲みを外し、COMPOSE_FILE を区切り（既定は :）で分ける", () => {
  const vars = readEnvVars("COMPOSE_FILE='a.yaml;b.yaml;'  \nCOMPOSE_PATH_SEPARATOR=;\nX=1");
  assert.deepEqual(composeFileList(vars), ["a.yaml", "b.yaml"]);
  assert.deepEqual(composeFileList(readEnvVars("COMPOSE_FILE=a.yaml:b.yaml")), ["a.yaml", "b.yaml"]);
  assert.equal(composeFileList(readEnvVars("X=1")), null);
});
