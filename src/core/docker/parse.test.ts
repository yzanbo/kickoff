import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeFilesFromEnv,
  parseLogLine,
  dbKindOf,
  deepestWorkplace,
  isAltComposeName,
  overrideNamesFor,
  parseComposeConfig,
  parseConfigHashes,
  parsePorts,
  parsePs,
  parseStatus,
  serviceMark,
  starterOf,
} from "./parse.js";

test("parsePs: 1 行 1 JSON を読み、ラベルのないもの・読めない行も扱う", () => {
  const out = [
    JSON.stringify({ id: "a1", name: "app-db-1", image: "postgres:16", state: "running", status: "Up 2 hours", ports: "0.0.0.0:5432->5432/tcp", project: "app", service: "db", dir: "/r/app", files: "/r/app/compose.yaml,/r/app/compose.override.yaml", oneoff: "False", number: "1", hash: "h1" }),
    "これは JSON ではない",
    JSON.stringify({ id: "b2", name: "solo", image: "redis", state: "exited", status: "Exited (0) 1 hour ago", ports: "", project: "", service: "", dir: "", files: "", oneoff: "", number: "", hash: "" }),
  ].join("\n");
  const [a, b] = parsePs(out);
  assert.deepEqual(a.files, ["/r/app/compose.yaml", "/r/app/compose.override.yaml"]);
  assert.equal(a.oneoff, false);
  assert.equal(a.hash, "h1");
  assert.equal(b.project, null);
  assert.equal(b.number, 1);
  assert.deepEqual(b.files, []);
  assert.equal(parsePs(out).length, 2);
});

test("parsePorts: Mac に出しているものだけ。IPv4 と IPv6 の同じ番号は 1 つ、範囲は 1 つずつ", () => {
  assert.deepEqual(parsePorts("0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp, 6379/tcp"), [{ host_ip: "0.0.0.0", host_port: 5432, container_port: 5432, protocol: "tcp" }]);
  assert.deepEqual(parsePorts("127.0.0.1:8080->80/tcp"), [{ host_ip: "127.0.0.1", host_port: 8080, container_port: 80, protocol: "tcp" }]);
  assert.deepEqual(
    parsePorts("0.0.0.0:8000-8001->9000-9001/tcp").map((p) => [p.host_port, p.container_port]),
    [
      [8000, 9000],
      [8001, 9001],
    ],
  );
  assert.deepEqual(parsePorts(":::3000->3000/tcp")[0].host_ip, "::");
  assert.deepEqual(parsePorts(""), []);
});

test("parseStatus: 終了コードとヘルスチェック", () => {
  assert.deepEqual(parseStatus("Exited (1) 3 minutes ago"), { exitCode: 1, health: null });
  assert.deepEqual(parseStatus("Up 2 hours (unhealthy)"), { exitCode: null, health: "unhealthy" });
  assert.deepEqual(parseStatus("Up 5 seconds (health: starting)"), { exitCode: null, health: "starting" });
  assert.deepEqual(parseStatus("Created"), { exitCode: null, health: null });
});

test("parseComposeConfig: 組の名前・サービス・profiles・published（文字の番号も）", () => {
  const config = parseComposeConfig(
    JSON.stringify({
      name: "app",
      services: {
        redis: { image: "redis:7", ports: [{ target: 6379, published: "6379" }] },
        db: { image: "postgres:16", ports: [{ target: 5432, published: "5432" }, { target: 5432, published: "5432", host_ip: "::" }] },
        adminer: { image: "adminer", profiles: ["tools"] },
        web: { build: { context: "." } },
      },
    }),
  );
  assert.equal(config?.name, "app");
  assert.deepEqual(
    config?.services.map((s) => [s.name, s.image, s.profiles, s.published]),
    [
      ["adminer", "adminer", ["tools"], []],
      ["db", "postgres:16", [], [5432]],
      ["redis", "redis:7", [], [6379]],
      ["web", null, [], []],
    ],
  );
  assert.equal(parseComposeConfig("not json"), null);
  assert.equal(parseComposeConfig("{}"), null);
});

test("parseConfigHashes: サービス名と指紋", () => {
  assert.deepEqual([...parseConfigHashes("db abc123\nredis def456\n\n")], [
    ["db", "abc123"],
    ["redis", "def456"],
  ]);
});

test("serviceMark: 一時停止 → 起動中 → 異常 → 動いている → 未起動 → 止まっている", () => {
  const c = (state: "running" | "exited" | "created" | "paused" | "restarting", exitCode: number | null = null, health: string | null = null) => ({ state, exitCode, health });
  assert.equal(serviceMark([]), "none");
  assert.equal(serviceMark([c("running"), c("paused")]), "paused");
  assert.equal(serviceMark([c("restarting")]), "starting");
  assert.equal(serviceMark([c("running", null, "starting")]), "starting");
  assert.equal(serviceMark([c("exited", 1)]), "failed");
  assert.equal(serviceMark([c("running", null, "unhealthy")]), "failed");
  assert.equal(serviceMark([c("running"), c("exited", 0)]), "running");
  assert.equal(serviceMark([c("created")]), "created");
  assert.equal(serviceMark([c("exited", 0)]), "stopped");
});

test("starterOf: context の名前から開くアプリ・コピーするコマンド", () => {
  assert.deepEqual(starterOf("orbstack"), { kind: "open", app: "OrbStack", label: "OrbStack を開く" });
  assert.deepEqual(starterOf("desktop-linux"), { kind: "open", app: "Docker", label: "Docker Desktop を開く" });
  assert.deepEqual(starterOf("colima"), { kind: "copy", command: "colima start" });
  assert.deepEqual(starterOf("colima-dev"), { kind: "copy", command: "colima start --profile dev" });
  assert.equal(starterOf("default"), null);
  assert.equal(starterOf(null), null);
});

test("deepestWorkplace: いちばん深い作業場所。末尾の / や似た名前のフォルダで間違えない", () => {
  const wps = [{ path: "/r/app" }, { path: "/r/app/.wt/feat" }, { path: "/r/app-2" }];
  assert.equal(deepestWorkplace("/r/app/sub", wps)?.path, "/r/app");
  assert.equal(deepestWorkplace("/r/app/.wt/feat", wps)?.path, "/r/app/.wt/feat");
  assert.equal(deepestWorkplace("/r/app-2/x", wps)?.path, "/r/app-2");
  assert.equal(deepestWorkplace("/r/application", wps), undefined);
});

test("isAltComposeName / overrideNamesFor: 別名は出し、override は出さない。override は決まった名前にだけ重ねる", () => {
  assert.equal(isAltComposeName("compose.e2e.yaml"), true);
  assert.equal(isAltComposeName("docker-compose.test.yml"), true);
  assert.equal(isAltComposeName("compose.override.yaml"), false);
  assert.equal(isAltComposeName("compose.yaml"), false);
  assert.deepEqual(overrideNamesFor("/r/compose.yaml"), ["compose.override.yaml", "compose.override.yml"]);
  assert.deepEqual(overrideNamesFor("/r/docker-compose.yml"), ["docker-compose.override.yaml", "docker-compose.override.yml"]);
  assert.deepEqual(overrideNamesFor("/r/compose.e2e.yaml"), []);
});

test("composeFilesFromEnv: COMPOSE_FILE の並びに見つけたファイルがあればその並び（区切りは COMPOSE_PATH_SEPARATOR）", () => {
  assert.deepEqual(composeFilesFromEnv("COMPOSE_FILE=compose.yaml:compose.dev.yaml\n", "/r/compose.yaml"), ["/r/compose.yaml", "/r/compose.dev.yaml"]);
  assert.deepEqual(composeFilesFromEnv('COMPOSE_PATH_SEPARATOR=;\nCOMPOSE_FILE="compose.yaml;x/y.yaml"', "/r/compose.yaml"), ["/r/compose.yaml", "/r/x/y.yaml"]);
  assert.equal(composeFilesFromEnv("COMPOSE_FILE=other.yaml", "/r/compose.yaml"), null);
  assert.equal(composeFilesFromEnv("FOO=1", "/r/compose.yaml"), null);
});

test("dbKindOf: postgres・mysql・mariadb のイメージ", () => {
  assert.equal(dbKindOf("postgres:16"), "postgres");
  assert.equal(dbKindOf("docker.io/library/mariadb:11"), "mysql");
  assert.equal(dbKindOf("redis:7"), null);
  assert.equal(dbKindOf(null), null);
});

test("parseLogLine: 時刻の小数を 9 桁にそろえ、時刻のない行はそのまま", () => {
  assert.deepEqual(parseLogLine("2026-11-13T03:01:02.12345Z hello world"), { ts: "2026-11-13T03:01:02.123450000Z", text: "hello world" });
  assert.deepEqual(parseLogLine("2026-11-13T03:01:02Z  indented\r"), { ts: "2026-11-13T03:01:02.000000000Z", text: " indented" });
  assert.deepEqual(parseLogLine("no timestamp"), { ts: "", text: "no timestamp" });
});
