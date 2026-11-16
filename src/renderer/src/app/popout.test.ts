import assert from "node:assert/strict";
import { test } from "vitest";
import { parsePopout, popoutKey, popoutPath, type PopoutRoute } from "./popout";

test("popoutPath / parsePopout: 変更・ファイル・サブエージェント・子チャット・メモ・DB・サイドバーを行き来できる", () => {
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
    { kind: "sidebar" },
    { kind: "side" },
    { kind: "browser", panel: "side:1", key: "browser:1", url: "https://example.com/a?b=1#c", title: "例", projectId: 1 },
    { kind: "browser", panel: "bottom:all", key: "browser:2", url: "about:blank", title: "", projectId: null },
    { kind: "terminal", panel: "side:1", key: "term:1", cwd: "/repo/a b", label: "p1", projectId: 1 },
    { kind: "terminal", panel: "bottom:1", key: "term:2", cwd: "/repo", label: "p1", projectId: 1, command: "docker compose exec web sh", title: "web", env: { A: "1" } },
  ];
  for (const route of routes) assert.deepEqual(parsePopout(`#${popoutPath(route)}`), route);
  // サイドバーはアプリに 1 つ（同じ文字になり、もう開いていれば前に出す）
  assert.equal(popoutPath({ kind: "sidebar" }), "/popout/sidebar");
});

test("parsePopout: 別ウィンドウでない・欠けているものは undefined", () => {
  assert.equal(parsePopout("#/projects/1"), undefined);
  assert.equal(parsePopout("#/popout/changes?project=1"), undefined);
  assert.equal(parsePopout("#/popout/file?chat=1&project=1"), undefined);
  assert.equal(parsePopout("#/popout/subagent?chat=1"), undefined);
  assert.equal(parsePopout("#/popout/chat?chat=x"), undefined);
  assert.equal(parsePopout("#/popout/memo?project=2"), undefined);
  assert.equal(parsePopout("#/popout/other?chat=1&project=1"), undefined);
  assert.equal(parsePopout("#/popout/browser?panel=side:1&key=b"), undefined);
  assert.equal(parsePopout("#/popout/terminal?panel=side:1&key=t&cwd=/a&label=p"), undefined);
  // 環境変数が読めなければ付けない
  assert.deepEqual(parsePopout("#/popout/terminal?panel=side:1&key=t&project=1&cwd=/a&label=p&env=%5B1%5D"), { kind: "terminal", panel: "side:1", key: "t", projectId: 1, cwd: "/a", label: "p" });
});

test("popoutKey: 変更は移るファイルによらず同じウィンドウ", () => {
  assert.equal(popoutKey({ kind: "changes", chatId: 3, projectId: 1, focus: "a.ts" }), popoutKey({ kind: "changes", chatId: 3, projectId: 1 }));
  assert.match(popoutPath({ kind: "changes", chatId: 3, projectId: 1, focus: "a.ts" }), /&focus=a\.ts$/);
});
