import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../../../core/types";
import { groupEvents } from "./timelineItems";
import { changesOf, lineDelta } from "./turnFileChanges";

let id = 0;
const ev = (type: RunEvent["type"], data: object): RunEvent => ({ id: ++id, run_id: 1, type, data, created_at: "2026-11-04T00:00:00Z" }) as unknown as RunEvent;
const call = (key: string, name: string, input: object, result: object = { content: "ok" }, parent?: string) => [
  ev("tool_use", { id: key, name, input, ...(parent ? { parent } : {}) }),
  ev("tool_result", { tool_use_id: key, is_error: false, ...result, ...(parent ? { parent } : {}) }),
];

test("ターンの変更: 置き換えの前後で、足した行と消した行（同じ行は数えない）", () => {
  assert.deepEqual(lineDelta("a\nb\nc", "a\nB\nc"), { added: 1, removed: 1 });
  assert.deepEqual(lineDelta("a\nb", "a\nb\nc\nd"), { added: 2, removed: 0 });
  assert.deepEqual(lineDelta("a\nb\nc", "c"), { added: 0, removed: 2 });
  assert.deepEqual(lineDelta("", "x\n"), { added: 1, removed: 0 });
  // 並べ替え（共通部分列で数える）
  assert.deepEqual(lineDelta("1\n2\n3\n4", "2\n1\n3\n4"), { added: 1, removed: 1 });
});

test("ターンの変更: ファイルごとにまとめ、失敗したものは数えない。Write は新規・書き直しを分ける", () => {
  const events = [
    ...call("e1", "Edit", { file_path: "/r/a.ts", old_string: "x", new_string: "y\nz" }),
    ...call("e2", "MultiEdit", { file_path: "/r/a.ts", edits: [{ old_string: "p", new_string: "" }] }),
    ...call("w1", "Write", { file_path: "/r/new.md", content: "1\n2\n3\n" }, { content: "File created successfully at: /r/new.md" }),
    ...call("w2", "Write", { file_path: "/r/old.md", content: "1\n" }, { content: "The file /r/old.md has been updated." }),
    ...call("bad", "Edit", { file_path: "/r/b.ts", old_string: "a", new_string: "b" }, { is_error: true, content: "String not found" }),
  ];
  const calls = [];
  for (let i = 0; i < events.length; i += 2) calls.push({ use: events[i], result: events[i + 1] });
  assert.deepEqual(changesOf(calls), [
    { path: "/r/a.ts", added: 2, removed: 2 },
    { path: "/r/new.md", added: 3, removed: 0, write: "created" },
    { path: "/r/old.md", added: 1, removed: 0, write: "rewritten" },
  ]);
  // 結果がまだないものは数えない
  assert.deepEqual(changesOf([{ use: events[0] }]), []);
});

test("ターンの変更: タイムラインの作業の終わりに、その作業で変えたファイルを付ける（サブエージェントの変更も含める）", () => {
  const items = groupEvents([
    ev("user", { text: "直して" }),
    ...call("e1", "Edit", { file_path: "/r/a.ts", old_string: "x", new_string: "y" }),
    ...call("s1", "Write", { file_path: "/r/sub.ts", content: "a" }, { content: "File created successfully" }, "agent1"),
    ev("result", { status: "completed" }),
    ev("user", { text: "質問だけ" }),
    ev("text", { text: "答え" }),
    ev("result", { status: "completed" }),
  ]);
  const ends = items.filter((i) => i.kind === "event" && i.event.type === "result");
  assert.deepEqual(
    ends.map((i) => (i.kind === "event" ? i.turnChanges?.map((f) => f.path) : null)),
    [["/r/a.ts", "/r/sub.ts"], undefined],
  );
});
