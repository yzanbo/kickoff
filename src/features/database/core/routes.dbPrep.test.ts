// API のテスト: DB の接続の準備のコマンドと、つなぐときのコマンド（確かめるまで流さない・流す様子と記録・後片付け）
// DB ワーカーは同じプロセスで動かす（testing/testServer.ts の setup({ features: ["database"] })）。本物のプロセスでの起動は core/workerClient.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { type DbConnection, type DbPrepRun, type DbPrepState } from "@shared/database/types";
import { setup } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { until } from "@/app/core/testing/testCore";
import { quietShell } from "@/foundation/core/testing/quietShell";
import { makeSqlite, sqliteBody } from "@/features/database/core/testing";

quietShell();

test("DB の接続: 準備のコマンド（確かめるまで流さない・流す様子と記録・失敗で止める・中身を変えたら確かめ直す・消す / 止めると後片付け）", async () => {
  const { call, project, close } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const base = `/api/projects/${project.id}/db-connections`;
  const dir = tempDir();
  const prep = { prepare: [" echo ready ", "", "printf '%s' second"], cleanup: [`touch ${dir}/cleaned`], tunnel: null, password: null, my_ip_url: null };
  const created = (await call("POST", base, { ...sqliteBody(), prep, check_on: "2026-12-01", check_note: "ローテーション" })).body as DbConnection;
  assert.deepEqual(created.prep, { ...prep, prepare: ["echo ready", "printf '%s' second"] });
  assert.equal(created.prep_confirmed, false);
  assert.deepEqual([created.check_on, created.check_note], ["2026-12-01", "ローテーション"]);
  const one = `${base}/${created.id}`;

  // 確かめるまで流さない
  const refused = await call("POST", `${one}/prepare`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "db_prep_unconfirmed");
  assert.equal(((await call("POST", `${one}/prep/confirm`)).body as DbConnection).prep_confirmed, true);

  const prepState = async (url = one) => (await call("GET", `${url}/prepare`)).body as DbPrepState | null;
  const waitDone = async () => {
    await until(async () => (await prepState())?.running === false, 10_000);
    return (await prepState())!;
  };
  assert.equal((await call("POST", `${one}/prepare`)).status, 202);
  const done = await waitDone();
  assert.equal(done.error, null);
  assert.deepEqual(
    done.steps.map((s) => [s.command, s.status, s.output.trim()]),
    [
      ["echo ready", "ok", "ready"],
      ["printf '%s' second", "ok", "second"],
    ],
  );
  const runs = (await call("GET", `${one}/prep-runs`)).body as DbPrepRun[];
  assert.deepEqual(
    runs.map((r) => [r.kind, r.command, r.ok]),
    [
      ["prepare", "printf '%s' second", true],
      ["prepare", "echo ready", true],
    ],
  );

  // 中身を変えたら確かめ直し。失敗したコマンドで止める
  const changed = (await call("PATCH", one, { prep: { ...prep, prepare: ["echo a", "exit 3", "echo never"] } })).body as DbConnection;
  assert.equal(changed.prep_confirmed, false);
  await call("POST", `${one}/prep/confirm`);
  await call("POST", `${one}/prepare`);
  const failed = await waitDone();
  assert.deepEqual(
    failed.steps.map((s) => s.status),
    ["ok", "failed"],
  );
  assert.match(failed.error ?? "", /「exit 3」が失敗しました/);
  // 写すと準備も写るが、写した先で確かめ直す
  const copied = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: false })).body as DbConnection;
  assert.deepEqual(copied.prep?.prepare, ["echo a", "exit 3", "echo never"]);
  assert.equal(copied.prep_confirmed, false);

  // 準備が済んだ接続を消すと、後片付けのコマンドを流す
  await call("PATCH", one, { prep });
  await call("POST", `${one}/prep/confirm`);
  await call("POST", `${one}/prepare`);
  assert.equal((await waitDone()).error, null);
  await call("DELETE", one);
  await until(() => fs.existsSync(path.join(dir, "cleaned")));

  // 空の準備は null・SSH と一緒のポートの転送は断る・日付の形
  assert.equal(((await call("POST", base, { ...sqliteBody({ name: "空" }), prep: { ...prep, prepare: [" "], cleanup: [] } })).body as DbConnection).prep, null);
  const pg = sqliteBody({ engine: "postgres", host: "h", file_path: null });
  assert.equal((await call("POST", base, { ...pg, ssh: { host: "b", port: null, user: null, identity_file: null }, prep: { ...prep, tunnel: "x {local_port}" } })).status, 400);
  assert.equal((await call("POST", base, { ...pg, check_on: "12/01" })).status, 400);
  assert.equal((await call("POST", base, { ...pg, prep: { ...prep, prepare: ["a\nb"] } })).status, 400);

  // アプリを止めるときも、準備が済んだ接続の後片付けを流してから止める（コアの機能を止めるので最後に確かめる）
  const other = (await call("POST", base, { ...sqliteBody({ name: "止めるとき" }), prep: { ...prep, cleanup: [`touch ${dir}/closed`] } })).body as DbConnection;
  await call("POST", `${base}/${other.id}/prep/confirm`);
  await call("POST", `${base}/${other.id}/prepare`);
  await until(async () => (await prepState(`${base}/${other.id}`))?.running === false, 10_000);
  await close();
  assert.ok(fs.existsSync(path.join(dir, "closed")));
});

test("DB の接続: つなぐときのコマンド（パスワードを取る）は確かめるまで流さず、流したら記録に残す（出力は残さない）", async () => {
  const { call, project } = setup({ features: ["database"] });
  const base = `/api/projects/${project.id}/db-connections`;
  const body = { ...sqliteBody({ engine: "postgres", host: "127.0.0.1", port: 1, file_path: null }), prep: { prepare: [], cleanup: [], tunnel: null, password: "printf s3cret", my_ip_url: null } };
  const conn = (await call("POST", base, body)).body as DbConnection;
  const refused = await call("GET", `${base}/${conn.id}/databases`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "db_prep_unconfirmed");
  await call("POST", `${base}/${conn.id}/prep/confirm`);
  // パスワードを取ってからつなぐ（ポート 1 なのでつながらない）
  assert.equal((await call("GET", `${base}/${conn.id}/databases`)).status, 400);
  const runs = (await call("GET", `${base}/${conn.id}/prep-runs`)).body as DbPrepRun[];
  assert.deepEqual(
    runs.map((r) => [r.kind, r.command, r.ok]),
    [["password", "printf s3cret", true]],
  );
  // 記録は種類・コマンド・成否だけ（出力 = パスワードは持たない）
  assert.deepEqual(Object.keys(runs[0]).sort(), ["command", "id", "kind", "ok", "ran_at"]);
  // 「つながるか試す」は、ダイアログで見えているコマンドを流す（確かめ済みかは問わない）。失敗するコマンドは出力を出さない
  const tested = (await call("POST", `${base}/test`, { ...body, prep: { ...body.prep, password: "echo leaked; exit 1" } })).body;
  assert.equal(tested.ok, false);
  assert.match(tested.error, /パスワードを取るコマンドが失敗しました/);
  assert.doesNotMatch(tested.error, /leaked/);
});

