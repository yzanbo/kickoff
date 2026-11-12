import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDockerList, composeKeyOf, sharedVictims, type ComposeEntry, type Workplace } from "./listing.js";
import type { ComposeConfig, RawContainer } from "./parse.js";

const main: Workplace = { path: "/r/app", worktree_path: null, branch: "main" };
const wt: Workplace = { path: "/r/app-worktrees/feat", worktree_path: "/r/app-worktrees/feat", branch: "feat" };

const config = (name: string, services: string[], profiled: string[] = []): ComposeConfig => ({
  name,
  services: [...services.map((s) => ({ name: s, image: s === "db" ? "postgres:16" : `${s}:1`, profiles: [], published: s === "db" ? [5432] : [] })), ...profiled.map((s) => ({ name: s, image: `${s}:1`, profiles: ["tools"], published: [] }))],
});

const entry = (wp: Workplace, file: string, cfg: ComposeConfig | null, extra: Partial<ComposeEntry> = {}): ComposeEntry => ({
  workplace: wp.path,
  file: `${wp.path}/${file}`,
  upFiles: [`${wp.path}/${file}`],
  filesExist: true,
  config: cfg,
  error: null,
  hashes: null,
  discovered: true,
  ...extra,
});

const container = (over: Partial<RawContainer>): RawContainer => ({
  id: "c1",
  name: "app-db-1",
  image: "postgres:16",
  state: "running",
  status: "Up 1 hour",
  ports: "0.0.0.0:5432->5432/tcp",
  project: "app",
  service: "db",
  dir: "/r/app",
  files: ["/r/app/compose.yaml"],
  oneoff: false,
  number: 1,
  hash: null,
  ...over,
});

test("buildDockerList: 作ったものと作っていないものを作業場所ごとに見出しにし、profiles の札付きも並べる", () => {
  const list = buildDockerList(
    [main, wt],
    [container({})],
    [entry(main, "compose.yaml", config("app", ["db", "redis"], ["adminer"])), entry(wt, "compose.yaml", config("app-feat", ["db", "redis"], ["adminer"]))],
  );
  assert.equal(list.composes.length, 2);
  const [m, w] = list.composes;
  assert.equal(m.created, true);
  assert.equal(m.file, "compose.yaml");
  assert.deepEqual(
    m.services.map((s) => [s.name, s.mark, s.profiles]),
    [
      ["adminer", "none", ["tools"]],
      ["db", "running", []],
      ["redis", "none", []],
    ],
  );
  assert.equal(m.services[1].db_kind, "postgres");
  assert.equal(w.created, false);
  assert.equal(w.worktree_path, wt.path);
  assert.deepEqual(w.shares, []);
  assert.equal(list.owner.get("c1"), m.key);
});

test("buildDockerList: 数を増やしたサービスは 1 行に、使い捨ては oneoffs に。ほかのプロジェクトの動いているものは others", () => {
  const list = buildDockerList(
    [main],
    [
      container({ id: "w2", name: "app-worker-2", service: "worker", number: 2, state: "exited", status: "Exited (0) 1 minute ago", ports: "" }),
      container({ id: "w1", name: "app-worker-1", service: "worker", number: 1, ports: "" }),
      container({ id: "r1", name: "app-db-run-1", oneoff: true }),
      container({ id: "x1", name: "other-db-1", project: "other", dir: "/elsewhere", ports: "0.0.0.0:6000->5432/tcp" }),
      container({ id: "x2", name: "solo", project: null, dir: null, state: "exited", ports: "" }),
    ],
    [entry(main, "compose.yaml", config("app", ["db", "worker"]))],
  );
  const svc = list.composes[0].services;
  const worker = svc.find((s) => s.name === "worker");
  assert.deepEqual(
    worker?.containers.map((c) => c.id),
    ["w1", "w2"],
  );
  assert.equal(worker?.running, 1);
  assert.equal(worker?.mark, "running");
  assert.deepEqual(
    svc.find((s) => s.name === "db")?.oneoffs.map((c) => c.id),
    ["r1"],
  );
  assert.deepEqual(list.others, [{ name: "other-db-1", ports: [6000] }]);
});

test("buildDockerList: ファイルが消えた組もラベルから出し、すべて起動は押せない理由を付ける", () => {
  const list = buildDockerList([main], [container({ files: ["/r/app/gone/compose.yaml"], dir: "/r/app/gone" })], []);
  const [c] = list.composes;
  assert.equal(c.file, "gone/compose.yaml");
  assert.match(c.start_blocked ?? "", /見つかりません/);
  assert.deepEqual(
    c.services.map((s) => s.name),
    ["db"],
  );
});

test("buildDockerList: 設定が読めなければ ⚠ と押せない理由。設定の指紋が違えば config_changed", () => {
  const broken = buildDockerList([main], [], [entry(main, "compose.yaml", null, { error: "yaml: line 3: bad" })]);
  assert.equal(broken.composes[0].config_error, "yaml: line 3: bad");
  assert.ok(broken.composes[0].start_blocked);

  const hashes = new Map([["db", "new"]]);
  const changed = buildDockerList([main], [container({ hash: "old" })], [entry(main, "compose.yaml", config("app", ["db"]), { hashes })]);
  assert.equal(changed.composes[0].config_changed, true);
  const same = buildDockerList([main], [container({ hash: "new" })], [entry(main, "compose.yaml", config("app", ["db"]), { hashes })]);
  assert.equal(same.composes[0].config_changed, false);
});

test("buildDockerList: 本体とワークツリーが同じ組の名前なら両方に ⚠（作業場所）。ほかのプロジェクトの同じ名前の組も", () => {
  const list = buildDockerList(
    [main, wt],
    [container({ id: "o1", project: "app", dir: "/other/app", name: "x" })],
    [entry(main, "compose.yaml", config("app", ["db"])), entry(wt, "compose.yaml", config("app", ["db"]))],
  );
  const [m, w] = list.composes;
  assert.deepEqual(m.shares, [
    { kind: "workplace", worktree_path: wt.path, branch: "feat", file: null, other: null },
    { kind: "workplace", worktree_path: null, branch: null, file: null, other: "app" },
  ]);
  assert.equal(w.shares[0].worktree_path, null);
  assert.equal(w.shares[0].branch, "main");
});

test("buildDockerList: 同じ作業場所の 2 つの compose が同じ組の名前なら見出しを分け、コンテナはファイルで振り分け、片付けは押せない", () => {
  const list = buildDockerList(
    [main],
    [container({ id: "a", files: ["/r/app/compose.yaml"] }), container({ id: "b", name: "app-e2e-1", service: "e2e", files: ["/r/app/compose.e2e.yaml"] })],
    [entry(main, "compose.yaml", config("app", ["db"])), entry(main, "compose.e2e.yaml", config("app", ["e2e"]))],
  );
  const [base, e2e] = list.composes;
  assert.equal(list.owner.get("a"), base.key);
  assert.equal(list.owner.get("b"), e2e.key);
  assert.equal(base.shares[0].kind, "file");
  assert.equal(base.shares[0].file, "compose.e2e.yaml");
  assert.ok(base.down_blocked);
  // 起動すると作り直される相手は、もう片方の見出しのコンテナ
  const all = [container({ id: "a", files: ["/r/app/compose.yaml"] }), container({ id: "b", service: "e2e", files: ["/r/app/compose.e2e.yaml"] })];
  assert.deepEqual(
    sharedVictims(base.key, "app", all, list.owner).map((c) => c.id),
    ["b"],
  );
});

test("sharedVictims: 自分の見出しのコンテナと、ほかの組の名前は数えない", () => {
  const key = composeKeyOf("/r/app", "app", "/r/app/compose.yaml");
  const owner = new Map([["a", key]]);
  const all = [container({ id: "a" }), container({ id: "z", project: "zzz" }), container({ id: "o", dir: "/other/app" })];
  assert.deepEqual(
    sharedVictims(key, "app", all, owner).map((c) => c.id),
    ["o"],
  );
  assert.deepEqual(sharedVictims(key, null, all, owner), []);
});
