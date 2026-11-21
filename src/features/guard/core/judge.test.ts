import assert from "node:assert/strict";
import { test } from "vitest";
import { judgeCall } from "./judge";
import type { GuardName, GuardRule, GuardVerdict } from "./rules";

const call = { name: "Bash", input: { command: "x" }, cwd: "/w" };
const ask: GuardVerdict = { kind: "ask", title: "聞く", description: "", deniedReason: "断られた" };

/** 当てた順を seen に残す守り */
function rules(seen: string[], defs: Array<[GuardName, "deny" | "ask", GuardVerdict, boolean?]>): GuardRule[] {
  return defs.map(([name, kind, verdict, sees = true]) => ({ name, kind, sees: () => sees, check: async () => (seen.push(name), verdict) }));
}

test("judgeCall: 並べた順によらず GUARD_ORDER の順に、断る守りを全部見てから聞く守りを見る（断る守りが断れば聞かない）", async () => {
  const seen: string[] = [];
  const list = rules(seen, [["docker", "ask", ask], ["gitHook", "deny", { kind: "deny", reason: "フック" }], ["self", "deny", { kind: "pass" }]]);
  assert.deepEqual(await judgeCall(list, call), { kind: "deny", reason: "フック" });
  assert.deepEqual(seen, ["self", "gitHook"]);
});

test("judgeCall: 断る守りがどれも言わなければ最初の聞く守り、見ない呼び出しの守りは当てない、何もなければ pass", async () => {
  const seen: string[] = [];
  const list = rules(seen, [["writeScope", "ask", ask], ["delete", "deny", { kind: "deny", reason: "消す" }, false], ["docker", "ask", { kind: "pass" }]]);
  assert.deepEqual(await judgeCall(list, call), ask);
  assert.deepEqual(seen, ["docker", "writeScope"]);
  assert.deepEqual(await judgeCall([], call), { kind: "pass" });
});
