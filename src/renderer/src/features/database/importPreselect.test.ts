import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbImportCandidate } from "@shared/types";
import { withPreselect } from "./importPreselect";

const candidate = (key: string, patch: Partial<DbImportCandidate> = {}): DbImportCandidate => ({
  key,
  name: key,
  engine: "postgres",
  environment: "local",
  host: "localhost",
  port: 5432,
  database: "app",
  username: "app",
  file_path: null,
  ssl: null,
  source: "compose",
  origin: key,
  note: null,
  has_password: true,
  existing_id: null,
  ...patch,
});

test("withPreselect: 同じ DB の案をその位置で置き換え、同じサーバーでも DB の名前が違う案は残す", () => {
  const list = [candidate("env", { source: "env", host: "127.0.0.1", database: "app_test" }), candidate("compose:compose.yaml:db"), candidate("file", { engine: "sqlite", host: null, port: null })];
  const docker = candidate("docker:db:/repo|app|compose.yaml");
  assert.deepEqual(
    withPreselect(list, docker).map((c) => c.key),
    ["env", "docker:db:/repo|app|compose.yaml", "file"],
  );
});

test("withPreselect: 同じ DB の案がなければ（別のポートのワークツリーの db）最後に足す", () => {
  const list = [candidate("compose:compose.yaml:db")];
  const docker = candidate("docker:db:/wt|app-x|compose.yaml", { port: 5433, name: "app（feat-x）" });
  assert.deepEqual(
    withPreselect(list, docker).map((c) => c.key),
    ["compose:compose.yaml:db", "docker:db:/wt|app-x|compose.yaml"],
  );
});
