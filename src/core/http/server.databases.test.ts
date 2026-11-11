// API のテスト: DB クライアント（接続の登録・パスワードの扱い・写す・試す・木とテーブル・SQL のタブ・読み取り専用・この Mac からだけ）
// DB ワーカーは同じプロセスで動かす（testing/testServer.ts の setup()）。本物のプロセスでの起動は databases/client.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { BusEvent, DbConnection, DbErSchema, DbImportCandidate, DbPrepRun, DbPrepState, DbQueryHistoryEntry, DbQueryResult, DbTableDetail, NewDbConnectionBody } from "@shared/types";
import { AUTH, setup } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";
import { gitRepo } from "../testing/gitRepo.js";
import { until } from "../testing/testCore.js";

/** プロジェクトのフォルダに SQLite のファイルを作る（users と、users を指す posts） */
function makeSqlite(dir: string, name = "app.db") {
  const file = path.join(dir, name);
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar BLOB);
    CREATE INDEX idx_users_name ON users(name);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT);
    CREATE VIEW user_names AS SELECT name FROM users;
    INSERT INTO users (name, avatar) VALUES ('b', x'0102'), ('a', NULL), ('c', NULL);
    INSERT INTO posts (user_id, title) VALUES (1, 'hello');
  `);
  db.close();
  return file;
}

const sqliteBody = (patch: Partial<NewDbConnectionBody> = {}): NewDbConnectionBody => ({
  name: "ローカルの DB",
  engine: "sqlite",
  environment: "local",
  host: null,
  port: null,
  database: null,
  username: null,
  file_path: "app.db",
  ssl: null,
  read_only: false,
  ai_access: "allow",
  ...patch,
});

test("DB の接続: 作る・一覧・変える・並べ替える・消す。パスワードは保存したかだけ返し、消すと秘密の値も消える", async () => {
  const { call, project, store, bus } = setup();
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  makeSqlite(project.repo_path);

  const created = await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody());
  assert.equal(created.status, 201);
  assert.equal(created.body.has_password, false);
  const pg = (
    await call("POST", `/api/projects/${project.id}/db-connections`, {
      ...sqliteBody({ name: "本番", engine: "postgres", environment: "production", host: "db.example.com", port: 5432, database: "app", username: "u", file_path: null }),
      read_only: true,
      ai_access: "none",
      ssl: { mode: "require", ca_path: null },
      password: "s3cret",
    })
  ).body as DbConnection;
  assert.equal(pg.has_password, true);
  assert.deepEqual(pg.ssl, { mode: "require", ca_path: null });
  assert.ok(!JSON.stringify(pg).includes("s3cret"));
  assert.equal(store.dbConnections.password(pg.id), "s3cret");
  // 知らせには中身を載せない
  assert.ok(events.some((e) => e.type === "db_connections" && e.project_id === project.id));
  assert.ok(!JSON.stringify(events).includes("db.example.com"));

  const list = (await call("GET", `/api/projects/${project.id}/db-connections`)).body as DbConnection[];
  assert.deepEqual(
    list.map((c) => c.name),
    ["ローカルの DB", "本番"],
  );

  // パスワードは省けばそのまま、null で消す
  const renamed = (await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { name: "本番2" })).body as DbConnection;
  assert.equal(renamed.name, "本番2");
  assert.equal(renamed.has_password, true);
  assert.equal(((await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { password: null })).body as DbConnection).has_password, false);
  await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { password: "again" });

  const ordered = (await call("PUT", `/api/projects/${project.id}/db-connections/order`, { ids: [pg.id] })).body as DbConnection[];
  assert.deepEqual(
    ordered.map((c) => c.id),
    [pg.id, created.body.id],
  );

  assert.equal((await call("DELETE", `/api/projects/${project.id}/db-connections/${pg.id}`)).status, 204);
  assert.equal(store.dbConnections.password(pg.id), null);
  assert.equal((await call("DELETE", `/api/projects/${project.id}/db-connections/${pg.id}`)).status, 404);
});

test("DB の接続: 種類ごとに要る項目・Kickoff 自身のデータは断り、ほかのプロジェクトの接続は 404。プロジェクトを消すと秘密の値も消える", async () => {
  const { call, project, store, dbFake } = setup();
  const base = `/api/projects/${project.id}/db-connections`;
  assert.equal((await call("POST", base, sqliteBody({ file_path: null }))).status, 400);
  assert.equal((await call("POST", base, sqliteBody({ engine: "mysql", file_path: null }))).status, 400);
  // Kickoff の保存先の中（リンクを解いた実体で比べる）
  fs.writeFileSync(path.join(dbFake.dataDir, "kickoff.db"), "");
  const kickoff = await call("POST", base, sqliteBody({ file_path: path.join(dbFake.dataDir, "kickoff.db") }));
  assert.equal(kickoff.status, 400);
  assert.match(kickoff.body.error, /Kickoff 自身のデータ/);
  const link = path.join(tempDir(), "link");
  fs.symlinkSync(dbFake.dataDir, link);
  assert.equal((await call("POST", base, sqliteBody({ file_path: path.join(link, "kickoff.db") }))).status, 400);

  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const theirs = store.dbConnections.create(other.id, { ...sqliteBody(), password: "p" });
  assert.equal((await call("PATCH", `${base}/${theirs.id}`, { name: "x" })).status, 404);
  store.projects.delete(other.id);
  assert.equal(store.dbConnections.get(theirs.id), undefined);
  assert.equal(store.dbConnections.password(theirs.id), null);
});

test("DB の接続: ほかのプロジェクトから写す（パスワードは選んだときだけ）", async () => {
  const { call, project, store } = setup();
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const from = store.dbConnections.create(other.id, { ...sqliteBody({ engine: "postgres", host: "h", file_path: null }), password: "p" });
  const without = (await call("POST", `/api/projects/${project.id}/db-connections/copy`, { from_id: from.id, copy_password: false })).body as DbConnection;
  assert.equal(without.project_id, project.id);
  assert.equal(without.host, "h");
  assert.equal(without.has_password, false);
  const withPassword = (await call("POST", `/api/projects/${project.id}/db-connections/copy`, { from_id: from.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.password(withPassword.id), "p");
});

test("DB の接続: プロジェクトから取り込む（案にパスワードは出さず、取り込むときに読み直す。登録済みの印・環境の既定・ないものは 404）", async () => {
  const { call, project, store } = setup();
  const base = `/api/projects/${project.id}/db-connections/import`;
  makeSqlite(project.repo_path);
  fs.writeFileSync(path.join(project.repo_path, ".env"), "DATABASE_URL=postgres://app:s3cret@db.example.com/shop\n");
  store.dbConnections.create(project.id, { ...sqliteBody(), password: null });

  const res = await call("GET", base);
  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes("s3cret"));
  const list = res.body as DbImportCandidate[];
  assert.deepEqual(
    list.map((c) => [c.key, c.engine, c.environment, c.has_password, c.existing_id !== null]),
    [
      ["env:.env:DATABASE_URL", "postgres", "production", true, false],
      ["file:app.db", "sqlite", "local", false, true],
    ],
  );

  const created = await call("POST", base, { items: [{ key: "env:.env:DATABASE_URL", name: "店の DB", environment: "staging" }] });
  assert.equal(created.status, 201);
  const [conn] = created.body as DbConnection[];
  assert.equal(conn.name, "店の DB");
  assert.equal(conn.host, "db.example.com");
  assert.equal(conn.environment, "staging");
  assert.equal(conn.ai_access, "ask");
  assert.equal(conn.read_only, false);
  assert.equal(conn.has_password, true);
  assert.ok(!JSON.stringify(created.body).includes("s3cret"));
  assert.equal(store.dbConnections.password(conn.id), "s3cret");
  assert.equal(((await call("GET", base)).body as DbImportCandidate[])[0].existing_id, conn.id);

  assert.equal((await call("POST", base, { items: [{ key: "env:.env:NOPE", name: "x", environment: "local" }] })).status, 404);
  assert.equal((await call("POST", base, { items: [] })).status, 400);
});

test("DB の接続: 手順メモ（メモのフォルダからの相対パス。外を指すものは断り、メモの名前の変更・フォルダの移動で付け替え、写すときは外す）", async () => {
  const { call, project, store } = setup();
  const base = `/api/projects/${project.id}/db-connections`;
  makeSqlite(project.repo_path);
  assert.equal((await call("POST", base, { ...sqliteBody(), memo_path: "../x.md" })).status, 400);
  assert.equal((await call("POST", base, { ...sqliteBody(), memo_path: "/etc/x.md" })).status, 400);
  const a = (await call("POST", base, { ...sqliteBody(), memo_path: "DB/ローカル.md" })).body as DbConnection;
  const b = (await call("POST", base, { ...sqliteBody({ name: "2 つ目" }), memo_path: "DB/ローカル.md" })).body as DbConnection;
  const other = (await call("POST", base, { ...sqliteBody({ name: "別" }), memo_path: "DB/ローカル.md.bak" })).body as DbConnection;
  assert.equal(a.memo_path, "DB/ローカル.md");

  assert.equal((await call("POST", `/api/projects/${project.id}/memos`, { path: "DB/ローカル.md", content: "# x" })).status, 201);
  assert.equal((await call("POST", `/api/projects/${project.id}/memos/move`, { from: "DB/ローカル.md", to: "DB/Docker.md" })).status, 200);
  assert.deepEqual([a, b, other].map((c) => store.dbConnections.get(c.id)!.memo_path), ["DB/Docker.md", "DB/Docker.md", "DB/ローカル.md.bak"]);
  assert.equal((await call("POST", `/api/projects/${project.id}/memos/move`, { from: "DB", to: "接続" })).status, 200);
  assert.equal(store.dbConnections.get(a.id)!.memo_path, "接続/Docker.md");

  const cleared = (await call("PATCH", `${base}/${a.id}`, { memo_path: null })).body as DbConnection;
  assert.equal(cleared.memo_path, null);
  const otherProject = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const copied = (await call("POST", `/api/projects/${otherProject.id}/db-connections/copy`, { from_id: b.id, copy_password: false })).body as DbConnection;
  assert.equal(copied.memo_path, null);
});

test("DB の接続: AI 用のユーザーとパスワード（パスワードは保存したかだけ返す・写すのは選んだときだけ・消すと秘密の値も消える）", async () => {
  const { call, project, store } = setup();
  const base = `/api/projects/${project.id}/db-connections`;
  const body = { ...sqliteBody({ engine: "postgres", host: "h", file_path: null }), ai_username: "ai_reader", ai_password: "ai-s3cret" };
  const created = (await call("POST", base, body)).body as DbConnection;
  assert.equal(created.ai_username, "ai_reader");
  assert.equal(created.has_ai_password, true);
  assert.equal(created.has_password, false);
  assert.ok(!JSON.stringify(created).includes("ai-s3cret"));
  assert.equal(store.dbConnections.aiPassword(created.id), "ai-s3cret");
  // 省けばそのまま、null で消す
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { name: "x" })).body as DbConnection).has_ai_password, true);
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { ai_password: null })).body as DbConnection).has_ai_password, false);
  await call("PATCH", `${base}/${created.id}`, { ai_password: "again" });
  // 空のユーザーは「ない」（null）
  assert.equal(((await call("POST", base, { ...body, name: "空", ai_username: " " })).body as DbConnection).ai_username, null);

  const other = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: false })).body as DbConnection;
  assert.equal(other.ai_username, "ai_reader");
  assert.equal(other.has_ai_password, false);
  const copied = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.aiPassword(copied.id), "again");

  await call("DELETE", `${base}/${created.id}`);
  assert.equal(store.dbConnections.aiPassword(created.id), null);
});

test("DB の接続: SSH トンネル（パスワードは保存したかだけ返す・写すのは選んだときだけ・「-」で始まるホストは断る・~/.ssh/config の Host の一覧）", async () => {
  const { call, project, store } = setup();
  const base = `/api/projects/${project.id}/db-connections`;
  const ssh = { host: "bastion", port: 2222, user: "ec2-user", identity_file: "~/.ssh/id_ed25519" };
  const body = { ...sqliteBody({ engine: "postgres", host: "db.internal", file_path: null }), ssh, ssh_password: "ssh-s3cret" };
  const created = (await call("POST", base, body)).body as DbConnection;
  assert.deepEqual(created.ssh, ssh);
  assert.equal(created.has_ssh_password, true);
  assert.equal(created.has_password, false);
  assert.ok(!JSON.stringify(created).includes("ssh-s3cret"));
  assert.equal(store.dbConnections.sshPassword(created.id), "ssh-s3cret");
  // 省けばそのまま、null で消す。ssh: null でトンネルをやめる
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { name: "x" })).body as DbConnection).has_ssh_password, true);
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { ssh_password: null })).body as DbConnection).has_ssh_password, false);
  await call("PATCH", `${base}/${created.id}`, { ssh_password: "again" });
  assert.equal(((await call("POST", base, { ...body, name: "なし", ssh: null })).body as DbConnection).ssh, null);

  const other = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: false })).body as DbConnection;
  assert.deepEqual(other.ssh, ssh);
  assert.equal(other.has_ssh_password, false);
  const copied = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.sshPassword(copied.id), "again");

  // ssh のオプションと取り違えるホスト・ユーザー・空白入りは断る
  for (const bad of [{ host: "-oProxyCommand=touch /tmp/x" }, { host: "a b" }, { user: "-oX" }]) {
    assert.equal((await call("POST", base, { ...body, name: "悪い", ssh: { ...ssh, ...bad } })).status, 400);
    assert.equal((await call("POST", `${base}/ssh-host-key`, { ssh: { ...ssh, ...bad } })).status, 400);
  }
  assert.ok(Array.isArray((await call("GET", `${base}/ssh-hosts`)).body));

  await call("DELETE", `${base}/${created.id}`);
  assert.equal(store.dbConnections.sshPassword(created.id), null);
});

test("DB の接続: 準備のコマンド（確かめるまで流さない・流す様子と記録・失敗で止める・中身を変えたら確かめ直す・消す / 止めると後片付け）", async () => {
  const { call, project, databases } = setup();
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

  const waitDone = async () => {
    let state: DbPrepState | null = null;
    for (let i = 0; i < 200; i++) {
      state = (await call("GET", `${one}/prepare`)).body as DbPrepState | null;
      if (state && !state.running) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return state!;
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

  // アプリを止めるときも、準備が済んだ接続の後片付けを流してから止める
  const other = (await call("POST", base, { ...sqliteBody({ name: "止めるとき" }), prep: { ...prep, cleanup: [`touch ${dir}/closed`] } })).body as DbConnection;
  await call("POST", `${base}/${other.id}/prep/confirm`);
  await call("POST", `${base}/${other.id}/prepare`);
  for (let i = 0; i < 200 && ((await call("GET", `${base}/${other.id}/prepare`)).body as DbPrepState | null)?.running !== false; i++) await new Promise((r) => setTimeout(r, 50));
  await databases.close();
  assert.ok(fs.existsSync(path.join(dir, "closed")));

  // 空の準備は null・SSH と一緒のポートの転送は断る・日付の形
  assert.equal(((await call("POST", base, { ...sqliteBody({ name: "空" }), prep: { ...prep, prepare: [" "], cleanup: [] } })).body as DbConnection).prep, null);
  const pg = sqliteBody({ engine: "postgres", host: "h", file_path: null });
  assert.equal((await call("POST", base, { ...pg, ssh: { host: "b", port: null, user: null, identity_file: null }, prep: { ...prep, tunnel: "x {local_port}" } })).status, 400);
  assert.equal((await call("POST", base, { ...pg, check_on: "12/01" })).status, 400);
  assert.equal((await call("POST", base, { ...pg, prep: { ...prep, prepare: ["a\nb"] } })).status, 400);
});

test("DB の接続: つなぐときのコマンド（パスワードを取る）は確かめるまで流さず、流したら記録に残す（出力は残さない）", async () => {
  const { call, project } = setup();
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

test("DB の接続: つながるか試す（保存しない）。ないファイルは失敗を返す", async () => {
  const { call, project } = setup();
  makeSqlite(project.repo_path);
  const base = `/api/projects/${project.id}/db-connections`;
  const ok = (await call("POST", `${base}/test`, { ...sqliteBody(), name: undefined })).body;
  assert.equal(ok.ok, true);
  assert.match(ok.server_version, /^SQLite \d/);
  const missing = (await call("POST", `${base}/test`, sqliteBody({ file_path: "none.db" }))).body;
  assert.equal(missing.ok, false);
  assert.match(missing.error, /見つかりません/);
  // まだ対応していない種類も失敗の文で返す
  assert.equal((await call("POST", `${base}/test`, sqliteBody({ engine: "postgres", host: "127.0.0.1", file_path: null }))).body.ok, false);
  assert.equal(fs.existsSync(path.join(project.repo_path, "none.db")), false);
});

test("DB の木とテーブル: DB・テーブルとビュー・構造・行（並べ替え・続き）・数・補完の名前", async () => {
  const { call, project } = setup();
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const main = { database: "main", schema: null };

  assert.deepEqual((await call("GET", `${base}/databases`)).body, { databases: ["main"], current: "main", has_schemas: false });
  assert.deepEqual((await call("POST", `${base}/objects`, { path: main })).body, [
    { kind: "table", name: "posts" },
    { kind: "view", name: "user_names" },
    { kind: "table", name: "users" },
  ]);

  const users = (await call("POST", `${base}/table`, { path: main, name: "users" })).body as DbTableDetail;
  assert.deepEqual(
    users.columns.map((c) => [c.name, c.type, c.primary_key, c.nullable]),
    [
      ["id", "INTEGER", true, false],
      ["name", "TEXT", false, false],
      ["avatar", "BLOB", false, true],
    ],
  );
  assert.deepEqual(
    users.indexes.map((i) => [i.name, i.columns]),
    [["idx_users_name", ["name"]]],
  );
  assert.equal(users.referenced_by[0].table, "posts");
  assert.match(users.ddl!, /CREATE TABLE users/);
  const posts = (await call("POST", `${base}/table`, { path: main, name: "posts" })).body as DbTableDetail;
  assert.deepEqual(posts.foreign_keys[0].ref_table, "users");
  assert.equal(posts.foreign_keys[0].on_delete, "CASCADE");

  const sorted = (await call("POST", `${base}/rows`, { path: main, table: "users", sort: [{ column: "name", desc: false }], offset: 0 })).body as DbQueryResult;
  assert.deepEqual(
    sorted.rows.map((r) => r[1]),
    ["a", "b", "c"],
  );
  assert.equal(sorted.truncated, false);
  // バイナリは大きさと頭だけ
  assert.deepEqual(sorted.rows[1][2], { binary: true, bytes: 2, head: "0102" });
  const page = (await call("POST", `${base}/rows`, { path: main, table: "users", sort: [], offset: 2 })).body as DbQueryResult;
  assert.equal(page.rows.length, 1);

  assert.deepEqual((await call("POST", `${base}/count`, { path: main, name: "users" })).body, { count: 3 });
  // 絞り込み（条件は AND・値は params・WHERE の文は式だけ）と、絞った数
  const filtered = (f: object) => call("POST", `${base}/rows`, { path: main, table: "users", sort: [{ column: "id", desc: false }], offset: 0, filter: f });
  const byName = { filters: [{ column: "name", op: "contains", value: "B" }], where: null };
  assert.deepEqual(((await filtered(byName)).body as DbQueryResult).rows.map((r) => r[1]), ["b"]);
  assert.deepEqual((await call("POST", `${base}/count`, { path: main, name: "users", filter: byName })).body, { count: 1 });
  const nulls = { filters: [{ column: "avatar", op: "is_null", value: "" }, { column: "id", op: "ge", value: "3" }], where: null };
  assert.deepEqual(((await filtered(nulls)).body as DbQueryResult).rows.map((r) => r[1]), ["c"]);
  assert.deepEqual(((await filtered({ filters: [], where: "name <> 'a' -- コメント" })).body as DbQueryResult).rows.map((r) => r[1]), ["b", "c"]);
  const twoStatements = await filtered({ filters: [], where: "1 = 1; delete from users" });
  assert.equal(twoStatements.status, 400);
  assert.match(twoStatements.body.error, /WHERE には式だけ/);
  assert.equal((await filtered({ filters: [{ column: "name", op: "like", value: "a" }], where: null })).status, 400);
  assert.equal(((await filtered({ filters: [], where: "no_such_column = 1" })).status), 400);
  const outline = (await call("POST", `${base}/outline`, { path: main })).body;
  assert.deepEqual(outline.find((t: { name: string }) => t.name === "posts").columns, ["id", "user_id", "title"]);
  // つないだ時刻を残す
  assert.ok((await call("GET", `/api/projects/${project.id}/db-connections`)).body[0].last_connected_at);
  // 関数・列挙型の定義: SQLite にはないので失敗を返し、種類の違うものは 400
  const definition = await call("POST", `${base}/definition`, { path: main, kind: "function", name: "f" });
  assert.equal(definition.status, 400);
  assert.match(definition.body.error, /SQLite には関数・列挙型がありません/);
  assert.equal((await call("POST", `${base}/definition`, { path: main, kind: "table", name: "users" })).status, 400);
});

test("ER 図: テーブル・ビューの構造（一意の組・外部キー）と、選んだものだけ。動かした位置は接続と場所ごとに覚えて消せる", async () => {
  const { call, project, store } = setup();
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const main = { database: "main", schema: null };

  const all = (await call("POST", `${base}/er`, { path: main, names: null })).body as DbErSchema;
  assert.deepEqual(all.names, ["posts", "user_names", "users"]);
  const posts = all.tables.find((t) => t.name === "posts")!;
  assert.deepEqual(posts.foreign_keys.map((f) => [f.columns, f.ref_table]), [[["user_id"], "users"]]);
  assert.deepEqual(posts.unique_sets, [["id"]]);
  assert.deepEqual(posts.columns[1], { name: "user_id", type: "INTEGER", nullable: true, primary_key: false });
  assert.equal(all.tables.find((t) => t.name === "user_names")!.kind, "view");

  // 選んだもの（ないものは飛ばす）
  const picked = (await call("POST", `${base}/er`, { path: main, names: ["users", "missing"] })).body as DbErSchema;
  assert.deepEqual(picked.tables.map((t) => t.name), ["users"]);
  assert.equal(picked.names.length, 3);

  const layout = `${base}/er-layout`;
  assert.deepEqual((await call("GET", `${layout}?place=main`)).body, {});
  assert.equal((await call("PUT", layout, { place: "main", positions: { users: { x: 10, y: 20.5 } } })).status, 204);
  assert.equal((await call("PUT", layout, { place: "other", positions: { posts: { x: 0, y: 0 } } })).status, 204);
  assert.deepEqual((await call("GET", `${layout}?place=main`)).body, { users: { x: 10, y: 20.5 } });
  assert.equal((await call("PUT", layout, { place: "main", positions: { users: { x: "a", y: 0 } } })).status, 400);
  assert.equal((await call("GET", layout)).status, 400);
  assert.equal((await call("DELETE", `${layout}?place=main`)).status, 204);
  assert.deepEqual((await call("GET", `${layout}?place=main`)).body, {});
  assert.deepEqual(store.dbErLayouts.get(conn.id, "other"), { posts: { x: 0, y: 0 } });
  // 接続を消すと位置も消える
  await call("DELETE", base);
  assert.deepEqual(store.dbErLayouts.get(conn.id, "other"), {});
});

test("SQL のタブ: 文を流す・トランザクションの途中の印・コミットと取り消し・閉じると取り消す", async () => {
  const { call, project } = setup();
  const file = makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const sql = (s: string, session = "tab1", write = false) => call("POST", `${base}/sql`, { session, sql: s, write });

  const selected = (await sql("select id, name from users order by id")).body as DbQueryResult;
  assert.deepEqual(
    selected.columns.map((c) => c.name),
    ["id", "name"],
  );
  assert.equal(selected.rows.length, 3);
  assert.equal(selected.in_transaction, false);

  assert.equal((await sql("begin")).body.in_transaction, true);
  const inserted = (await sql("insert into users (name) values ('d')")).body as DbQueryResult;
  assert.equal(inserted.affected, 1);
  assert.equal(inserted.in_transaction, true);
  assert.deepEqual((await call("GET", `${base}/sessions/tab1`)).body, { in_transaction: true });
  // ほかのタブ（別の接続）からはまだ見えない
  assert.equal(((await sql("select count(*) as n from users", "tab2")).body as DbQueryResult).rows[0][0], 3);
  assert.deepEqual((await call("POST", `${base}/sessions/tab1/rollback`)).body, { in_transaction: false });
  assert.equal(((await sql("select count(*) from users", "tab2")).body as DbQueryResult).rows[0][0], 3);

  await sql("begin");
  await sql("insert into users (name) values ('e')");
  assert.deepEqual((await call("POST", `${base}/sessions/tab1/commit`)).body, { in_transaction: false });
  assert.equal(((await sql("select count(*) from users", "tab2")).body as DbQueryResult).rows[0][0], 4);

  // 閉じると途中のトランザクションは取り消す
  await sql("begin");
  await sql("insert into users (name) values ('f')");
  assert.equal((await call("DELETE", `${base}/sessions/tab1`)).status, 204);
  const check = new DatabaseSync(file);
  assert.equal((check.prepare("select count(*) as n from users").get() as { n: number }).n, 4);
  check.close();

  // 失敗は文のまま 400
  const failed = await sql("select * from nope");
  assert.equal(failed.status, 400);
  assert.match(failed.body.error, /no such table/);
});

test("接続を消すと、その接続のワーカーの接続（SQL のタブの途中のトランザクションも）を閉じる", async () => {
  const { call, project, databases } = setup();
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const other = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody({ name: "ほか" }))).body as DbConnection;
  const sql = (c: DbConnection, s: string) => call("POST", `/api/projects/${project.id}/db-connections/${c.id}/sql`, { session: "tab1", sql: s, write: false });
  await sql(conn, "begin");
  await sql(other, "begin");
  assert.equal(databases.inTransaction(conn, "tab1"), true);
  await call("DELETE", `/api/projects/${project.id}/db-connections/${conn.id}`);
  await until(() => !databases.inTransaction(conn, "tab1"));
  // ほかの接続はそのまま
  assert.equal(databases.inTransaction(other, "tab1"), true);
});

test("SQL の履歴: 利用者が流した文は成功も失敗も新しい順に残り、判定で断った文は残さない", async () => {
  const { call, project, store } = setup();
  makeSqlite(project.repo_path);
  const c = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody({ read_only: true }))).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${c.id}`;
  await call("POST", `${base}/sql`, { session: "h", sql: "select count(*) from users", write: false });
  assert.equal((await call("POST", `${base}/sql`, { session: "h", sql: "select * from missing_table", write: false })).status, 400);
  assert.equal((await call("POST", `${base}/sql`, { session: "h", sql: "delete from users", write: false })).status, 400);
  await call("DELETE", `${base}/sessions/h`);
  const history = (await call("GET", `${base}/history`)).body as DbQueryHistoryEntry[];
  assert.deepEqual(
    history.map((h) => [h.sql, h.ran_by, h.row_count, h.error !== null, h.chat_title]),
    [
      ["select * from missing_table", "user", null, true, null],
      ["select count(*) from users", "user", 1, false, null],
    ],
  );
  assert.equal(((await call("GET", `${base}/history?limit=1`)).body as DbQueryHistoryEntry[]).length, 1);
  assert.equal((await call("GET", `${base}/history?limit=0`)).status, 400);
  // AI が流したものはチャットの名前も
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "調べもの", status: "completed" });
  store.dbQueryHistory.add({ connection_id: c.id, sql: "select 1", ran_by: "ai", chat_id: chat.id, duration_ms: 1, row_count: 1 });
  assert.deepEqual(((await call("GET", `${base}/history?limit=1`)).body as DbQueryHistoryEntry[]).map((h) => [h.ran_by, h.chat_title]), [["ai", "調べもの"]]);
});

test("SQL のタブ: 読み取り専用の接続は書く文を断り、「書き込む」の間だけ流せる", async () => {
  const { call, project } = setup();
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody({ environment: "production", read_only: true, ai_access: "none" }))).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  assert.equal((await call("POST", `${base}/sql`, { session: "t", sql: "select 1", write: false })).status, 200);
  const denied = await call("POST", `${base}/sql`, { session: "t", sql: "delete from users", write: false });
  assert.equal(denied.status, 400);
  assert.match(denied.body.error, /読み取り専用/);
  // 1 回に流せるのは 1 つの文だけ（後ろの文を黙って捨てない）
  const two = await call("POST", `${base}/sql`, { session: "t", sql: "select 1; delete from users", write: false });
  assert.equal(two.status, 400);
  assert.match(two.body.error, /1 つの文/);
  const written = await call("POST", `${base}/sql`, { session: "t", sql: "delete from users where name = 'c'", write: true });
  assert.equal(written.status, 200);
  assert.equal((written.body as DbQueryResult).affected, 1);
});

test("SQLite のファイルはワークツリーではその中の同じパスを開き、なければ code 付きの 404", async () => {
  const { call, project } = setup();
  gitRepo({ dir: project.repo_path, files: { "README.md": "x" } });
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const wt = await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "feature/db" });
  assert.equal(wt.status, 201, JSON.stringify(wt.body));
  const wtPath = (wt.body as { path: string; main: boolean }[]).find((w) => !w.main)!.path;
  const worktree = encodeURIComponent(wtPath);
  const missing = await call("GET", `/api/projects/${project.id}/db-connections/${conn.id}/databases?worktree=${worktree}`);
  assert.equal(missing.status, 404, JSON.stringify(missing.body));
  assert.equal(missing.body.code, "db_file_not_in_worktree");
  makeSqlite(wtPath);
  assert.equal((await call("GET", `/api/projects/${project.id}/db-connections/${conn.id}/databases?worktree=${worktree}`)).status, 200);
});

test("DB クライアントの API は、この Mac 以外からの頼みを 403 で断る", async () => {
  const { app, project } = setup();
  const lan = { incoming: { socket: { remoteAddress: "192.168.1.20" } } };
  const local = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };
  assert.equal((await app.request(`/api/projects/${project.id}/db-connections`, { headers: AUTH }, lan)).status, 403);
  assert.equal((await app.request(`/api/projects/${project.id}/db-connections/1/databases`, { headers: AUTH }, lan)).status, 403);
  assert.equal((await app.request(`/api/projects/${project.id}/db-connections`, { headers: AUTH }, local)).status, 200);
  // ほかの API は LAN からも使える
  assert.equal((await app.request(`/api/projects/${project.id}`, { headers: AUTH }, lan)).status, 200);
});

test("DB の接続: テーブルの行の変更をまとめて保存する（1 つのトランザクション・行が合わなければすべて取り消す・読み取り専用は書き込むの間だけ・履歴）", async () => {
  const { call, project } = setup();
  const file = makeSqlite(project.repo_path);
  const base = `/api/projects/${project.id}/db-connections`;
  const conn = (await call("POST", base, sqliteBody())).body as DbConnection;
  const url = `${base}/${conn.id}/edits`;
  const path = { database: "main", schema: null };
  const names = () => new DatabaseSync(file, { readOnly: true }).prepare("SELECT id, name FROM users ORDER BY id").all().map((r) => ({ ...r }));

  const saved = await call("POST", url, {
    path,
    table: "users",
    write: false,
    edits: [
      { kind: "update", key: { id: 1 }, values: { name: "B'2" } },
      { kind: "delete", key: { id: 3 } },
      { kind: "insert", values: { name: "d", avatar: null } },
    ],
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.affected, [1, 1, 1]);
  assert.deepEqual(names(), [
    { id: 1, name: "B'2" },
    { id: 2, name: "a" },
    // AUTOINCREMENT でない SQLite は、消した番号を使い直す
    { id: 3, name: "d" },
  ]);
  const [history] = (await call("GET", `${base}/${conn.id}/history`)).body as DbQueryHistoryEntry[];
  assert.match(history.sql, /UPDATE "main"\."users" SET "name" = 'B''2' WHERE "id" = 1;/);
  assert.equal(history.row_count, 3);

  // 2 つ目が行に当たらない（消えた行）→ 1 つ目も取り消す
  const missing = await call("POST", url, {
    path,
    table: "users",
    write: false,
    edits: [
      { kind: "update", key: { id: 2 }, values: { name: "x" } },
      { kind: "update", key: { id: 99 }, values: { name: "y" } },
    ],
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /2 番目の変更の行が見つかりません/);
  assert.equal((names()[1] as { name: string }).name, "a");
  // DB の失敗（NOT NULL）も、何番目かを添えてすべて取り消す
  const invalid = await call("POST", url, { path, table: "users", write: false, edits: [{ kind: "delete", key: { id: 2 } }, { kind: "insert", values: { name: null } }] });
  assert.match(invalid.body.error, /2 番目の変更で失敗しました/);
  assert.equal(names().length, 3);

  // 読み取り専用の接続は「書き込む」の間だけ
  await call("PATCH", `${base}/${conn.id}`, { read_only: true });
  const refused = await call("POST", url, { path, table: "users", write: false, edits: [{ kind: "delete", key: { id: 2 } }] });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /読み取り専用/);
  assert.equal((await call("POST", url, { path, table: "users", write: true, edits: [{ kind: "delete", key: { id: 2 } }] })).status, 200);
  assert.equal(names().length, 2);

  // 形の確かめ（キーのない更新・空の変更）
  assert.equal((await call("POST", url, { path, table: "users", write: true, edits: [{ kind: "update", key: {}, values: { name: "z" } }] })).status, 400);
  assert.equal((await call("POST", url, { path, table: "users", write: true, edits: [] })).status, 400);
});
