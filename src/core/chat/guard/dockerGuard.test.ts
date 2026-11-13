import assert from "node:assert/strict";
import { test } from "node:test";
import type { RawContainer } from "../../docker/parse.js";
import { judgeDockerCommand, type DockerGuardFacts } from "./dockerGuard.js";

const main = "/r/app";
const wt = "/r/app-worktrees/feat-x";
const workplaces = [
  { path: main, worktree_path: null, branch: "main" },
  { path: wt, worktree_path: wt, branch: "feat-x" },
];
const ctr = (over: Partial<RawContainer>): RawContainer => ({
  id: "aaaaaaaaaaaa",
  name: "x",
  image: "img",
  state: "running",
  status: "",
  ports: "",
  project: null,
  service: null,
  dir: null,
  files: [],
  oneoff: false,
  number: 1,
  hash: null,
  ...over,
});

function facts(over: Partial<DockerGuardFacts> & { list?: RawContainer[] } = {}): DockerGuardFacts {
  const { list = [], ...rest } = over;
  return {
    workdir: wt,
    workplaces: async () => workplaces,
    containers: async () => list,
    composeProject: async () => null,
    volumes: async () => [],
    composeNames: async () => [],
    ...rest,
  };
}

const mainDb = ctr({ id: "111111111111", name: "app-db-1", project: "app", service: "db", dir: main });
const myDb = ctr({ id: "222222222222", name: "feat-x-db-1", project: "feat-x", service: "db", dir: wt });
const loose = ctr({ id: "333333333333", name: "kickoff-dbtest-pg" });

test("judgeDockerCommand: 別の作業場所（本体）のコンテナを名前で止めるなら聞き、自分のもの・compose の外のものは通す", async () => {
  const f = facts({ list: [mainDb, myDb, loose] });
  const ask = await judgeDockerCommand("docker stop app-db-1", f);
  assert.equal(ask?.title, "app-db-1 は別の作業場所（本体 | main）のコンテナです。止めようとしています");
  assert.equal(await judgeDockerCommand("docker stop feat-x-db-1 && docker rm -f kickoff-dbtest-pg", f), null);
  // ID の頭でも引く
  assert.match((await judgeDockerCommand("docker rm 1111", f))?.title ?? "", /消そうとしています/);
});

test("judgeDockerCommand: まとめて止める・消すものは相手を見ずにいつも聞く", async () => {
  const ask = await judgeDockerCommand("docker ps -q | xargs docker stop", facts({ containers: async () => null }));
  assert.match(ask?.title ?? "", /まとめて止める・消すコマンド/);
});

test("judgeDockerCommand: compose は -p か compose が答える組の名前で相手を決める（-f <本体> stop・同じ組の up）", async () => {
  const f = facts({ list: [mainDb], composeProject: async (i) => (i.options.includes(`${main}/compose.yaml`) ? "app" : "feat-x") });
  assert.match((await judgeDockerCommand(`docker compose -f ${main}/compose.yaml stop`, f))?.title ?? "", /組（app）には別の作業場所（本体 \| main）のコンテナがあります。止めようとしています/);
  assert.equal(await judgeDockerCommand("docker compose stop", f), null);
  // 本体と同じ組の名前のワークツリーで起動すると、本体のコンテナが作り直される
  const same = facts({ list: [mainDb], composeProject: async () => "app" });
  assert.equal((await judgeDockerCommand("docker compose up -d", same))?.title, "本体（main）と同じ組（app）です。起動すると本体（main）のコンテナが作り直されます");
  assert.match((await judgeDockerCommand("docker compose -p app down", facts({ list: [mainDb] })))?.title ?? "", /消そうとしています/);
});

test("judgeDockerCommand: ボリュームは、その組の名前を使う作業場所が自分だけなら通し、共有・持ち主の分からないものは聞く。ラベルのないものは通す", async () => {
  const volumes = async () => [
    { name: "app_pgdata", project: "app" },
    { name: "feat-x_pgdata", project: "feat-x" },
    { name: "else_data", project: "else" },
    { name: "anon", project: null },
  ];
  const composeNames = async () => [
    { path: main, name: "app" },
    { path: wt, name: "feat-x" },
  ];
  const f = facts({ volumes, composeNames });
  assert.equal(await judgeDockerCommand("docker volume rm feat-x_pgdata anon", f), null);
  assert.equal((await judgeDockerCommand("docker volume rm app_pgdata", f))?.title, "本体（main）と共有の組（app）のボリューム app_pgdata を消そうとしています。消すと本体（main）のデータも消え、戻せません");
  assert.match((await judgeDockerCommand("docker volume rm else_data", f))?.title ?? "", /このチャットの作業場所の組のものではありません/);
  // 名前が分かれたワークツリーの自分の down -v は通す。同じ組の名前（共有）なら聞く
  assert.equal(await judgeDockerCommand("docker compose down -v", facts({ volumes, composeNames, composeProject: async () => "feat-x" })), null);
  const shared = facts({ volumes, composeNames: async () => [{ path: main, name: "app" }, { path: wt, name: "app" }], composeProject: async () => "app" });
  assert.match((await judgeDockerCommand("docker compose down -v", shared))?.title ?? "", /共有の組（app）のボリューム app_pgdata/);
});

test("judgeDockerCommand: 共有の組（同じ組の名前をほかの作業場所の compose も使う）なら、ラベルが自分の作業場所のコンテナを止める・down するときも聞く（本体の側でも）", async () => {
  // ワークツリーで起動し直したので、共有の組のコンテナのラベルはワークツリー
  const sharedDb = ctr({ id: "444444444444", name: "app-db-1", project: "app", service: "db", dir: wt });
  const composeNames = async () => [
    { path: main, name: "app" },
    { path: wt, name: "app" },
  ];
  const f = facts({ list: [sharedDb], composeNames, composeProject: async () => "app" });
  assert.equal((await judgeDockerCommand("docker stop app-db-1", f))?.title, "本体（main）と共有の組（app）のコンテナ app-db-1 を止めようとしています。本体（main）も同じコンテナを使っています");
  assert.equal((await judgeDockerCommand("docker compose down", f))?.title, "本体（main）と共有の組（app）を消そうとしています。本体（main）も同じコンテナを使っています");
  assert.match((await judgeDockerCommand("docker compose stop", f))?.title ?? "", /共有の組（app）を止めようとしています/);
  // 本体の側の AI が、本体のラベルの共有の組を止めるときも聞く
  const mainSide = facts({ workdir: main, list: [{ ...sharedDb, dir: main }], composeNames, composeProject: async () => "app" });
  assert.equal((await judgeDockerCommand("docker compose down", mainSide))?.title, "WT（feat-x）と共有の組（app）を消そうとしています。WT（feat-x）も同じコンテナを使っています");
  // 名前が分かれていれば（自分だけが使う組）通す
  const own = facts({ list: [myDb], composeNames: async () => [{ path: main, name: "app" }, { path: wt, name: "feat-x" }], composeProject: async () => "feat-x" });
  assert.equal(await judgeDockerCommand("docker stop feat-x-db-1 && docker compose down", own), null);
});

test("judgeDockerCommand: Docker が答えない（ps が取れない）ときは、まとめてでなければ通す", async () => {
  const f = facts({ containers: async () => null, composeProject: async () => "app" });
  assert.equal(await judgeDockerCommand("docker stop app-db-1 && docker compose down", f), null);
});
