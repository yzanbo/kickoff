// API のテスト: ワークツリーの実行環境（ポートの帯・組の名前・.env の書き換え・消すときの片付け）。compose の設定は偽の docker、使用中の番号は偽の lsof
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { GitWorktree, Project, WorktreeEnvSetupResult } from "@shared/types";
import { gitIn, gitRepo } from "../testing/gitRepo.js";
import { setup, until } from "../testing/testServer.js";

const COMPOSE_CONFIG = JSON.stringify({
  name: "myapp",
  services: {
    db: { image: "postgres:16", ports: [{ mode: "ingress", target: 5432, published: "5432", protocol: "tcp" }] },
    redis: { image: "redis:7", ports: [{ mode: "ingress", target: 6379, published: "6379", protocol: "tcp" }] },
  },
});

const LSOF_HEAD = "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n";
const lsofLine = (port: number) => `node 4242 me 20u IPv4 0x1 0t0 TCP 127.0.0.1:${port} (LISTEN)\n`;

/** compose.yaml と、Git で無視している .env を持つリポジトリ */
function withRepo(s: ReturnType<typeof setup>, files: Record<string, string> = {}) {
  gitRepo({ dir: s.project.repo_path, files: { "compose.yaml": "services: {}\n", ".gitignore": ".env\n", "package.json": '{"scripts":{"dev":"next dev"}}\n', ...files } });
  fs.writeFileSync(path.join(s.project.repo_path, ".env"), "DATABASE_URL=postgres://app:app@localhost:5432/app\nREDIS_PORT=6379\nNEXTAUTH_URL=http://localhost:3000\n");
  s.dockerFake.set([{ match: "config --format json", stdout: COMPOSE_CONFIG }]);
}

const create = async (s: ReturnType<typeof setup>, branch: string) => {
  const res = await s.call("POST", `/api/projects/${s.project.id}/git/worktrees`, { branch });
  assert.equal(res.status, 201);
  return (res.body as GitWorktree[]).find((w) => w.branch === branch)!;
};

test("ワークツリーを作ると、空いている帯を割り当てて .env と上書きファイルに書く（Git の変更には出さない）", async () => {
  const s = setup();
  withRepo(s);
  // 20100 の帯の中で待ち受けているものがあれば飛ばす
  s.portsFake.lsof = LSOF_HEAD + lsofLine(20105) + lsofLine(5432);
  const wt = await create(s, "feat/x");
  const env = wt.env!;
  assert.equal(env.band, 20200);
  assert.equal(env.host, "feat-x.localhost");
  assert.equal(env.app_url, "http://feat-x.localhost:20200");
  assert.deepEqual(
    env.slots.map((x) => [x.kind, x.service, x.original, x.port]),
    [
      ["dev", null, null, 20200],
      ["docker", "db", 5432, 20201],
      ["docker", "redis", 6379, 20202],
    ],
  );
  assert.deepEqual(env.compose_names, [{ dir: "", name: "myapp-feat-x" }]);
  assert.deepEqual(env.rewritten, [".env の DATABASE_URL", ".env の REDIS_PORT"]);
  assert.equal(env.blocked, null);
  assert.ok(env.issues.some((i) => i.includes("NEXTAUTH_URL")));

  const dotenv = fs.readFileSync(path.join(wt.path, ".env"), "utf8");
  assert.match(dotenv, /^DATABASE_URL=postgres:\/\/app:app@localhost:20201\/app$/m);
  assert.match(dotenv, /^REDIS_PORT=20202$/m);
  assert.match(dotenv, /^# >>> Kickoff（ワークツリーの実行環境。帯 20200〜20299）$/m);
  assert.match(dotenv, /^# 開発サーバー PORT → 20200 ／ db 5432 → 20201 ／ redis 6379 → 20202$/m);
  assert.match(dotenv, /^COMPOSE_PROJECT_NAME=myapp-feat-x$/m);
  assert.match(dotenv, /^COMPOSE_FILE=compose.yaml:.kickoff\/compose.worktree.yaml$/m);
  // 本体の .env は変えない
  assert.match(fs.readFileSync(path.join(s.project.repo_path, ".env"), "utf8"), /localhost:5432/);
  const override = fs.readFileSync(path.join(wt.path, ".kickoff/compose.worktree.yaml"), "utf8");
  assert.match(override, /"db":\n {4}ports: !override \["20201:5432"\]/);
  assert.match(override, /"redis":\n {4}ports: !override \["20202:6379"\]/);
  // .kickoff/ は exclude で無視させ、ワークツリーの Git の変更には何も出ない
  assert.match(fs.readFileSync(path.join(s.project.repo_path, ".git/info/exclude"), "utf8"), /^\.kickoff\/$/m);
  assert.equal(gitIn(wt.path)("status", "--porcelain").trim(), "");

  // 一覧にも付く。2 つ目は次の帯
  const list = (await s.call("GET", `/api/projects/${s.project.id}/git/worktrees`)).body as GitWorktree[];
  assert.equal(list.find((w) => w.main)?.env, null);
  assert.equal(list.find((w) => w.branch === "feat/x")?.env?.band, 20200);
  assert.equal((await create(s, "fix/y")).env?.band, 20300);

  // ターミナル・チャットの AI に渡す PORT（ワークツリーの中のフォルダでも）
  assert.deepEqual(s.worktreeEnvs.envFor(path.join(wt.path, "src")), { PORT: "20200" });
  assert.deepEqual(s.worktreeEnvs.envFor(s.project.repo_path), {});
});

test("消すとき: 選ばれたら組の名前で docker compose down -v を流し、帯を空ける", async () => {
  const s = setup();
  withRepo(s);
  const wt = await create(s, "feat/x");
  const removed = await s.call("POST", `/api/projects/${s.project.id}/git/worktrees/remove`, { path: wt.path, down_volumes: true });
  assert.equal(removed.status, 200);
  assert.ok(s.dockerFake.calls().some((c) => c.args.join(" ") === "compose -p myapp-feat-x down -v --remove-orphans"));
  assert.equal(s.store.worktreeEnvs.get(wt.path), undefined);
  // 空いた帯をまた使う
  assert.equal((await create(s, "feat/z")).env?.band, 20100);
  // 選ばなければ流さない
  const before = s.dockerFake.calls().length;
  const z = (await s.call("GET", `/api/projects/${s.project.id}/git/worktrees`)).body.find((w: GitWorktree) => w.branch === "feat/z");
  await s.call("POST", `/api/projects/${s.project.id}/git/worktrees/remove`, { path: z.path });
  assert.equal(s.dockerFake.calls().slice(before).filter((c) => c.args.includes("down")).length, 0);
});

test("Git で管理している .env があれば、書かずに分けられない理由を返す", async () => {
  const s = setup();
  gitRepo({ dir: s.project.repo_path, files: { "compose.yaml": "services: {}\n", ".env": "DB_PORT=5432\n" } });
  s.dockerFake.set([{ match: "config --format json", stdout: COMPOSE_CONFIG }]);
  const wt = await create(s, "feat/x");
  assert.equal(wt.env?.band, null);
  assert.match(wt.env?.blocked ?? "", /\.env を Git で管理しているので、ポートを分けられません/);
  assert.equal(fs.readFileSync(path.join(wt.path, ".env"), "utf8"), "DB_PORT=5432\n");
  assert.equal(fs.existsSync(path.join(wt.path, ".kickoff")), false);
});

test("帯を使い切ったら、分けずに作って知らせる。docker がなければ開発サーバーだけ分けて、整えきれていない所に出す", async () => {
  const s = setup();
  withRepo(s);
  const other: Project = s.store.projects.create({ name: "other", repo_path: "/tmp/other", provider: "claude" });
  for (let band = 20100; band <= 29900; band += 100) {
    s.store.worktreeEnvs.put({ path: `/tmp/other-wt/${band}`, project_id: other.id, band, host: null, slots: [], compose_names: [], rewritten: [], issues: [], blocked: null });
  }
  const full = await create(s, "feat/full");
  assert.equal(full.env?.band, null);
  assert.equal(full.env?.blocked, "ポートの帯を使い切りました。使っていないワークツリーを消してください");
  // ほかのプロジェクトの覚えは、このプロジェクトの一覧では消さない
  assert.equal(s.store.worktreeEnvs.list(other.id).length, 99);

  s.store.worktreeEnvs.remove("/tmp/other-wt/20100");
  s.dockerFake.missing = true;
  const wt = await create(s, "feat/nodocker");
  assert.equal(wt.env?.band, 20100);
  assert.deepEqual(wt.env?.slots.map((x) => x.kind), ["dev"]);
  assert.ok(wt.env?.issues.some((i) => i.startsWith("compose の設定を読めませんでした")));
});

test("［AI で整える］: この機能より前に作ったワークツリーは先に手順を流し、Git で管理していないファイルだけを書ける新しいチャットを始める", async () => {
  const s = setup();
  withRepo(s);
  const wt = await create(s, "feat/old");
  // この機能より前に作ったワークツリー（覚えがない）にする
  s.store.worktreeEnvs.remove(wt.path);
  const res = await s.call("POST", `/api/projects/${s.project.id}/git/worktrees/env-setup`, { path: wt.path });
  assert.equal(res.status, 201);
  const { chat, worktrees } = res.body as WorktreeEnvSetupResult;
  assert.equal(worktrees.find((w) => w.path === wt.path)?.env?.band, 20100);
  assert.equal(chat.title, "実行環境を整える（feat/old）");
  assert.equal(chat.worktree_path, wt.path);
  assert.equal(chat.untracked_only, true);
  await until(() => s.store.chats.get(chat.id)?.status === "completed");
  assert.equal(s.provider.lastUntrackedOnly, true);
  assert.equal(s.provider.lastCwd, wt.path);
  const prompt = s.provider.prompts.at(-1)!;
  assert.match(prompt, /帯: 20100〜20199/);
  assert.match(prompt, /db 5432 → 20101/);
  assert.match(prompt, /NEXTAUTH_URL/);
  assert.match(prompt, /docker compose config/);
  // 本体・知らないフォルダは断る
  assert.equal((await s.call("POST", `/api/projects/${s.project.id}/git/worktrees/env-setup`, { path: s.project.repo_path })).status, 400);
  // ふつうのチャットは書き込みを守らない
  const plain = await s.call("POST", `/api/projects/${s.project.id}/chats`, { text: "hi", worktree_path: wt.path });
  await until(() => s.store.chats.get(plain.body.id)?.status === "completed");
  assert.equal(s.provider.lastUntrackedOnly, false);
});

test("消すとき: drop_db_connections なら、このワークツリーの DB から作った接続も消す。選ばなければ結び付きだけ外す", async () => {
  const s = setup();
  withRepo(s);
  const a = await create(s, "feat/a");
  const b = await create(s, "feat/b");
  const body = { name: "db", engine: "postgres", environment: "local", host: "localhost", port: 20101, database: "app", username: "app", file_path: null, ssl: null, read_only: false, ai_access: "allow" } as const;
  const connA = s.store.dbConnections.create(s.project.id, body, a.path);
  const connB = s.store.dbConnections.create(s.project.id, { ...body, port: 20201 }, b.path);
  const other = s.store.dbConnections.create(s.project.id, { ...body, port: 5432 });
  assert.equal(connA.worktree_path, a.path);
  await s.call("POST", `/api/projects/${s.project.id}/git/worktrees/remove`, { path: a.path, drop_db_connections: true });
  assert.equal(s.store.dbConnections.get(connA.id), undefined);
  await s.call("POST", `/api/projects/${s.project.id}/git/worktrees/remove`, { path: b.path });
  assert.equal(s.store.dbConnections.get(connB.id)?.worktree_path, null);
  assert.equal(s.store.dbConnections.get(other.id)?.worktree_path, null);
});
