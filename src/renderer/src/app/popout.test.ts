import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePopout, popoutKey, popoutPath, type PopoutRoute } from "./popout";

test("popoutPath / parsePopout: 変更・ファイル・サブエージェント・子チャット・メモ・DB を行き来できる", () => {
  const routes: PopoutRoute[] = [
    { kind: "changes", chatId: 3, projectId: 1 },
    { kind: "changes", chatId: 3, projectId: 1, worktree: "/tmp/wt a", focus: "src/a.ts" },
    { kind: "file", chatId: 3, projectId: 1, path: "src/a b.ts", line: 12 },
    { kind: "file", chatId: 3, projectId: 1, worktree: "/tmp/wt", path: "README.md" },
    { kind: "subagent", chatId: 3, agentKey: "toolu_01" },
    { kind: "chat", chatId: 7 },
    { kind: "memo", projectId: 2, path: "設計/メモ 1.md" },
    { kind: "memo", projectId: 2, path: "設計/メモ 1.md", chatId: 5 },
    { kind: "database", chatId: 3, projectId: 1 },
    { kind: "database", chatId: 3, projectId: 1, worktree: "/tmp/wt" },
  ];
  for (const route of routes) assert.deepEqual(parsePopout(`#${popoutPath(route)}`), route);
});

test("parsePopout: 別ウィンドウでない・欠けているものは undefined", () => {
  assert.equal(parsePopout("#/projects/1"), undefined);
  assert.equal(parsePopout("#/popout/changes?project=1"), undefined);
  assert.equal(parsePopout("#/popout/file?chat=1&project=1"), undefined);
  assert.equal(parsePopout("#/popout/subagent?chat=1"), undefined);
  assert.equal(parsePopout("#/popout/chat?chat=x"), undefined);
  assert.equal(parsePopout("#/popout/memo?project=2"), undefined);
  assert.equal(parsePopout("#/popout/other?chat=1&project=1"), undefined);
});

test("popoutKey: 変更は移るファイルによらず同じウィンドウ", () => {
  assert.equal(popoutKey({ kind: "changes", chatId: 3, projectId: 1, focus: "a.ts" }), popoutKey({ kind: "changes", chatId: 3, projectId: 1 }));
  assert.match(popoutPath({ kind: "changes", chatId: 3, projectId: 1, focus: "a.ts" }), /&focus=a\.ts$/);
});
