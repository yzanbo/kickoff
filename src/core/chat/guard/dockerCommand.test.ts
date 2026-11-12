import assert from "node:assert/strict";
import { test } from "node:test";
import { dockerIntents } from "./dockerCommand.js";

const wt = "/r/app-worktrees/feat-x";

test("dockerIntents: docker を含まない文・聞かないコマンド（start・ps・logs・exec）は何も返さない", () => {
  assert.deepEqual(dockerIntents("npm test && git status", wt), []);
  assert.deepEqual(dockerIntents("docker ps -a; docker logs -f web; docker exec -it db psql; docker start db", wt), []);
});

test("dockerIntents: 名前で書いた相手（A）。docker container … ・オプションの値・リダイレクトを読み飛ばす", () => {
  assert.deepEqual(dockerIntents("docker stop -t 5 app-db-1 2>&1", wt), [{ kind: "containers", verb: "stop", names: ["app-db-1"] }]);
  assert.deepEqual(dockerIntents("docker --context orbstack container rm -f a b > /dev/null", wt), [{ kind: "containers", verb: "rm", names: ["a", "b"] }]);
  assert.deepEqual(dockerIntents("sudo docker kill --signal=KILL x", wt), [{ kind: "containers", verb: "kill", names: ["x"] }]);
});

test("dockerIntents: まとめて止める・消すもの（C）: $(…)・`…`・xargs・prune", () => {
  for (const cmd of ["docker stop $(docker ps -q)", "docker rm `docker ps -aq`", "docker ps -q | xargs docker stop", "docker container prune -f", "docker system prune -a --volumes", "for c in $(docker ps -q); do docker stop $c; done"]) {
    assert.equal(dockerIntents(cmd, wt)[0]?.kind, "bulk", cmd);
  }
});

test("dockerIntents: compose の前のオプション・-p・cd・行頭の環境変数・export を受ける（B）", () => {
  assert.deepEqual(dockerIntents("docker compose -f /r/app/compose.yaml --profile tools stop", wt), [
    { kind: "compose", sub: "stop", removeVolumes: false, options: ["-f", "/r/app/compose.yaml", "--profile", "tools"], project: null, cwd: wt, env: {} },
  ]);
  const [cd] = dockerIntents("cd ../../app && COMPOSE_PROJECT_NAME=app docker compose down -v", wt);
  assert.deepEqual(cd, { kind: "compose", sub: "down", removeVolumes: true, options: [], project: null, cwd: "/r/app", env: { COMPOSE_PROJECT_NAME: "app" } });
  const [p] = dockerIntents("export FOO=1; docker-compose --project-name=app up -d", wt);
  assert.deepEqual(p, { kind: "compose", sub: "up", removeVolumes: false, options: ["--project-name", "app"], project: "app", cwd: wt, env: { FOO: "1" } });
  assert.equal(dockerIntents('docker compose --project-directory "/r/app" restart', wt)[0]?.kind, "compose");
});

test("dockerIntents: 読み取れない書き方（変数の -p・-f）は見ない。cd の先が変数なら場所は null", () => {
  assert.deepEqual(dockerIntents("docker compose -p $NAME down", wt), []);
  assert.deepEqual(dockerIntents("docker compose -f $FILE stop", wt), []);
  const [i] = dockerIntents("cd $DIR && docker compose stop", wt);
  assert.equal(i?.kind === "compose" && i.cwd, null);
});

test("dockerIntents: ボリュームの削除。名前が変数ならまとめて消すもの", () => {
  assert.deepEqual(dockerIntents("docker volume rm app_pgdata other", wt), [{ kind: "volumes", names: ["app_pgdata", "other"] }]);
  assert.equal(dockerIntents("docker volume rm $(docker volume ls -q)", wt)[0]?.kind, "bulk");
  assert.equal(dockerIntents("docker volume prune", wt)[0]?.kind, "bulk");
});
