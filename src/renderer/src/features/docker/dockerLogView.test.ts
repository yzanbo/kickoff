import assert from "node:assert/strict";
import { test } from "node:test";
import type { DockerCompose, DockerLogSource } from "@shared/types";
import { aroundRow, chipOf, fillTs, logChips, logLevelOf, logQuote, mergeRows, normTs, prettyJson, separatorText, type LogContainerInfo, type LogRow } from "./dockerLogView";

const line = (id: number, ts: string, text = `l${id}`, container = "c1"): LogRow => ({ id, kind: "line", container, ts, text });
const ts = (s: number) => `2026-11-13T01:00:${String(s).padStart(2, "0")}.000000000Z`;

test("normTs: 小数を 9 桁にそろえる", () => {
  assert.equal(normTs("2026-11-13T01:00:00.123Z"), "2026-11-13T01:00:00.123000000Z");
  assert.equal(normTs("2026-11-13T01:00:00Z"), "2026-11-13T01:00:00.000000000Z");
});

test("mergeRows: 新しい行は後ろへ、古い行は時刻の順に混ぜ、上限を超えたら古い行から捨てる", () => {
  const a = mergeRows([line(1, ts(1)), line(2, ts(3))], [line(3, ts(4))]);
  assert.deepEqual(a.rows.map((r) => r.id), [1, 2, 3]);
  const b = mergeRows(a.rows, [line(5, ts(3)), line(4, ts(2))]);
  assert.deepEqual(b.rows.map((r) => r.id), [1, 4, 2, 5, 3]);
  const c = mergeRows(b.rows, [line(6, ts(5))], 4);
  assert.deepEqual(c.rows.map((r) => r.id), [2, 5, 3, 6]);
  assert.deepEqual(c.dropped.map((r) => r.id), [1, 4]);
});

test("fillTs: 時刻のない行は前の行の時刻に", () => {
  assert.deepEqual(fillTs([{ ts: "" }, { ts: ts(2) }, { ts: "" }], ts(1)).map((l) => l.ts), [ts(1), ts(2), ts(2)]);
});

test("chipOf と logChips: 数を増やしたものは 1 つの札、まだ作っていないサービスも並べ、使い捨ては後ろに", () => {
  const src = (label: string, service: string): DockerLogSource => ({ container: label, service, label, running: true, exit_code: null });
  assert.equal(chipOf({ label: "app#2" }), "app");
  const compose = { services: [{ name: "db" }, { name: "app" }] } as unknown as DockerCompose;
  assert.deepEqual(logChips(compose, [src("app#1", "app"), src("app#2", "app"), src("app · 使い捨て", "app")]), ["db", "app", "app · 使い捨て"]);
});

test("logLevelOf: エラーと警告の決まり（目安）", () => {
  for (const t of ["ERROR: relation does not exist", "2026 FATAL boom", "panic: nil map", "Traceback (most recent call last):", "TypeError: x is undefined", '{"level":"error","msg":"x"}', "level=error msg=x", "[error] 12#12: open()", "\u001b[31mERROR\u001b[0m x", "Exception: boom", 'raise Exception("x")', "java.lang.NullPointerException", "Error: connect ECONNREFUSED 127.0.0.1:5432", "goroutine 1 panic"])
    assert.equal(logLevelOf(t), "error", t);
  for (const t of ["WARNING: no index", "level=warn x", '{"level":"warn"}', "[warn] conflicting server name"]) assert.equal(logLevelOf(t), "warn", t);
  for (const t of ["0 errors, 0 warnings", "ready to accept connections", "GET /error 200", "error handling enabled"]) assert.equal(logLevelOf(t), null, t);
});

test("prettyJson: オブジェクトと配列の行だけ整える", () => {
  assert.equal(prettyJson('{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(prettyJson("[1]"), "[\n  1\n]");
  assert.equal(prettyJson("{not json}"), null);
  assert.equal(prettyJson("42"), null);
});

test("separatorText: 止まった（終了コード）・起動した", () => {
  assert.match(separatorText({ id: 1, kind: "stopped", container: "c", ts: ts(10), exit_code: 1 }, "db"), /^db が止まりました（exit 1） \d\d:\d\d:10$/);
  assert.match(separatorText({ id: 1, kind: "started", container: "c", ts: ts(10) }, "db"), /^db が起動しました \d\d:\d\d:10$/);
});

test("logQuote: 文脈の頭とコードのブロック。いくつものコンテナなら札を付ける", () => {
  const compose = { worktree_path: null, branch: "main", file: "compose.yaml", project_name: "myapp" } as DockerCompose;
  const infos = new Map<string, LogContainerInfo>([
    ["c1", { label: "db", service: "db", name: "myapp-db-1" }],
    ["c2", { label: "web", service: "web", name: "myapp-web-1" }],
  ]);
  const one = logQuote(compose, [line(1, ts(3), "\u001b[31mERROR\u001b[0m x"), line(2, ts(9), "y")], infos);
  const [head, fence, first] = one.split("\n");
  assert.match(head, /^Docker のログ: 本体 \| main・compose\.yaml・db（myapp-db-1）・\d\d:\d\d:03〜\d\d:\d\d:09$/);
  assert.equal(fence, "```");
  assert.match(first, /^\d\d:\d\d:03\.000 ERROR x$/);
  const two = logQuote(compose, [line(1, ts(3)), line(2, ts(4), "```", "c2")], infos);
  assert.match(two, /db（myapp-db-1）、web（myapp-web-1）/);
  assert.match(two, /\n````\n/);
  assert.match(two, /web \| ```/);
});

test("aroundRow: 前後 n 行（端で切る）", () => {
  assert.deepEqual(aroundRow([0, 1, 2, 3, 4, 5], 1, 2), [0, 1, 2, 3]);
  assert.deepEqual(aroundRow([0, 1, 2, 3, 4, 5], 5, 2), [3, 4, 5]);
});
