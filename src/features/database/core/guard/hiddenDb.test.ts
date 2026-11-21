// 「見せない」DB の接続に、AI が Bash・ファイルのツールで直接入るのを断る判定
import assert from "node:assert/strict";
import os from "node:os";
import { test } from "vitest";
import type { DbConnection } from "@shared/database/types";
import { evaluateHiddenDbAccess, hiddenDbRuleSource } from "./hiddenDb";
import { testMaterials } from "@/app/core/testing/testGate";
import { hiddenDbTargets } from "@/features/database/core/hiddenTargets";

const conn = (patch: Partial<DbConnection>): DbConnection => ({
  id: 1,
  project_id: 1,
  name: "本番",
  engine: "postgres",
  environment: "production",
  host: "db.example.com",
  port: 5432,
  database: "app",
  username: "u",
  file_path: null,
  ssl: null,
  read_only: true,
  write_check: "env_name",
  ai_access: "none",
  ai_username: null,
  has_password: true,
  has_ai_password: false,
  note_path: null,
  ssh: null,
  has_ssh_password: false,
  prep: null,
  worktree_path: null,
  prep_confirmed: false,
  check_on: null,
  check_note: null,
  position: 0,
  last_connected_at: null,
  created_at: "",
  updated_at: "",
  ...patch,
});

const bash = (targets: ReturnType<typeof hiddenDbTargets>, command: string) => evaluateHiddenDbAccess(targets, "Bash", { command }).kind;

test("見せない接続: ドットのあるホスト・接続の URL を含む Bash を断る（ほかのホスト・名前の一部は通す）", () => {
  const t = hiddenDbTargets([conn({})], ["/repo"]);
  assert.equal(bash(t, "psql -h db.example.com -U u app"), "deny");
  assert.equal(bash(t, 'psql "postgres://u:p@db.example.com:5432/app"'), "deny");
  assert.equal(bash(t, "PGHOST=DB.EXAMPLE.COM psql"), "deny");
  assert.equal(bash(t, "psql -h staging.db.example.com"), "pass");
  assert.equal(bash(t, "curl https://db.example.com.evil.test"), "pass");
  assert.equal(bash(t, "npm test"), "pass");
  const result = evaluateHiddenDbAccess(t, "Bash", { command: "psql -h db.example.com" });
  assert.ok(result.kind === "deny" && result.reason.includes("「本番」"));
});

test("見せない接続: 1 語のホスト（docker の db など）は、つなぎ先として書いたときだけ断る", () => {
  const t = hiddenDbTargets([conn({ host: "db" })], ["/repo"]);
  assert.equal(bash(t, "psql -h db -U u"), "deny");
  assert.equal(bash(t, "psql postgres://u@db:5432/app"), "deny");
  assert.equal(bash(t, "psql 'host=db dbname=app'"), "deny");
  assert.equal(bash(t, "cat db/schema.rb && ls db"), "pass");
});

test("見せない接続: この Mac の DB はポートで見分ける（ほかのポートの localhost は通す）", () => {
  const t = hiddenDbTargets([conn({ host: "localhost", port: 5433 })], ["/repo"]);
  assert.equal(bash(t, "psql postgres://u@localhost:5433/app"), "deny");
  assert.equal(bash(t, "psql -h localhost -p 5433"), "deny");
  assert.equal(bash(t, "psql -h localhost -p 5432"), "pass");
  assert.equal(bash(t, "curl localhost:3000"), "pass");
  // ポートを省いた接続は種類の既定のポート
  const mysql = hiddenDbTargets([conn({ engine: "mysql", host: "127.0.0.1", port: null })], ["/repo"]);
  assert.equal(bash(mysql, "mysql -h 127.0.0.1 -P 3306 -u root"), "deny");
  assert.equal(bash(mysql, "curl 127.0.0.1:8080"), "pass");
});

test("見せない接続: SQLite のファイルは、作業場所・本体の絶対パス・登録した書き方・ファイル名で断り、ファイルのツールでも断る", () => {
  const t = hiddenDbTargets([conn({ engine: "sqlite", host: null, port: null, file_path: "db/production.sqlite3" })], ["/wt", "/repo"]);
  assert.equal(bash(t, "sqlite3 db/production.sqlite3 .tables"), "deny");
  assert.equal(bash(t, "sqlite3 /repo/db/production.sqlite3"), "deny");
  assert.equal(bash(t, "cd db && sqlite3 production.sqlite3"), "deny");
  assert.equal(bash(t, "sqlite3 db/development.sqlite3"), "pass");
  assert.equal(evaluateHiddenDbAccess(t, "Read", { file_path: "/wt/db/production.sqlite3" }).kind, "deny");
  assert.equal(evaluateHiddenDbAccess(t, "Read", { file_path: "/wt/db/schema.rb" }).kind, "pass");
  // ~ から書いたファイル
  const home = hiddenDbTargets([conn({ engine: "sqlite", host: null, port: null, file_path: "~/data/prod.db" })], ["/repo"]);
  assert.equal(bash(home, `sqlite3 ${os.homedir()}/data/prod.db`), "deny");
  assert.equal(bash(home, "sqlite3 ~/data/prod.db"), "deny");
});

test("見せない接続: 見せる接続と同じファイル名なら名前だけでは断らない。見せる接続しかなければ何も断らない", () => {
  const both = hiddenDbTargets(
    [conn({ engine: "sqlite", host: null, port: null, file_path: "prod/app.db" }), conn({ id: 2, name: "開発", ai_access: "allow", engine: "sqlite", host: null, port: null, file_path: "dev/app.db" })],
    ["/repo"],
  );
  assert.equal(bash(both, "sqlite3 dev/app.db"), "pass");
  assert.equal(bash(both, "sqlite3 prod/app.db"), "deny");
  assert.deepEqual(hiddenDbTargets([conn({ ai_access: "ask" })], ["/repo"]), []);
  assert.equal(evaluateHiddenDbAccess([], "Bash", { command: "psql -h db.example.com" }).kind, "pass");
});

test("守りを出す口: 実行のたびにプロジェクトの接続を引き、見せない接続があるときだけ守りを付ける（SQLite は作業場所と本体の両方で解く）", async () => {
  const byProject: Record<number, DbConnection[]> = { 1: [conn({ engine: "sqlite", host: null, port: null, file_path: "db/app.sqlite3" })], 2: [conn({ ai_access: "ask" })] };
  const source = hiddenDbRuleSource((projectId) => byProject[projectId] ?? []);
  const materials = testMaterials({ cwd: "/wt" });
  const [rule, ...rest] = source.rulesFor({ ...materials, project: { ...materials.project, id: 1, repo_path: "/repo" } });
  assert.equal(rest.length, 0);
  const read = (file: string) => rule.check({ name: "Read", input: { file_path: file }, cwd: "/wt" });
  assert.equal((await read("/wt/db/app.sqlite3")).kind, "deny");
  assert.equal((await read("/repo/db/app.sqlite3")).kind, "deny");
  assert.deepEqual(source.rulesFor({ ...materials, project: { ...materials.project, id: 2 } }), []);
});
