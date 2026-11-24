import assert from "node:assert/strict";
import { afterAll, test, vi } from "vitest";
import { parsePopout, popoutKey, popoutKinds, popoutPath, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { registryContributions } from "./registry";

// GitHub の本文の部品は DOMPurify（画面のもの）を読み込みで使う（登録した種類の URL の表だけを確かめる）
vi.mock("@/features/github/ui/GitHubHtml", () => ({ GitHubHtml: () => null })); // test-rules-ignore: GitHub の本文の部品は読み込みで DOMPurify を使う（表だけを見る）
// 全部の機能の部品を読み込むので、同じプロセスで続けて流れるファイルのモック（vi.mock）が効くよう、読み込んだものを捨てる
afterAll(() => vi.resetModules());

/** 11 種の行き先と、表にする前の popoutPath が作っていた URL（同じものは同じ文字になり、メインプロセスが同じウィンドウを前に出すので変えない） */
const ROUTES: [PopoutRoute, string][] = [
    [{ kind: "changes", chatId: 3, projectId: 1 }, "/popout/changes?chat=3&project=1"],
    [{ kind: "changes", chatId: 3, projectId: 1, worktree: "/tmp/wt a", focus: "src/a.ts" }, "/popout/changes?chat=3&project=1&worktree=%2Ftmp%2Fwt+a&focus=src%2Fa.ts"],
    [{ kind: "file", chatId: 3, projectId: 1, path: "src/a b.ts", line: 12 }, "/popout/file?chat=3&project=1&path=src%2Fa+b.ts&line=12"],
    [{ kind: "file", chatId: 3, projectId: 1, worktree: "/tmp/wt", path: "README.md" }, "/popout/file?chat=3&project=1&worktree=%2Ftmp%2Fwt&path=README.md"],
    [{ kind: "subagent", chatId: 3, agentKey: "toolu_01" }, "/popout/subagent?chat=3&agent=toolu_01"],
    [{ kind: "chat", chatId: 7 }, "/popout/chat?chat=7"],
    [{ kind: "note", projectId: 2, path: "設計/ノート 1.md" }, "/popout/note?project=2&path=%E8%A8%AD%E8%A8%88%2F%E3%83%8E%E3%83%BC%E3%83%88+1.md"],
    [{ kind: "note", projectId: 2, path: "設計/ノート 1.md", chatId: 5 }, "/popout/note?project=2&path=%E8%A8%AD%E8%A8%88%2F%E3%83%8E%E3%83%BC%E3%83%88+1.md&chat=5"],
    [{ kind: "database", chatId: 3, projectId: 1 }, "/popout/database?chat=3&project=1"],
    [{ kind: "database", chatId: 3, projectId: 1, worktree: "/tmp/wt" }, "/popout/database?chat=3&project=1&worktree=%2Ftmp%2Fwt"],
    [{ kind: "sidebar" }, "/popout/sidebar"],
    [{ kind: "side" }, "/popout/side"],
    [{ kind: "browser", panel: "side:1", key: "browser:1", url: "https://example.com/a?b=1#c", title: "例", projectId: 1 }, "/popout/browser?panel=side%3A1&key=browser%3A1&project=1&title=%E4%BE%8B&url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%23c"],
    [{ kind: "browser", panel: "bottom:all", key: "browser:2", url: "about:blank", title: "", projectId: null }, "/popout/browser?panel=bottom%3Aall&key=browser%3A2&title=&url=about%3Ablank"],
    [{ kind: "chats", panel: "kanban:1", key: "chat:7", chatId: 7, projectId: 1 }, "/popout/chats?panel=kanban%3A1&key=chat%3A7&project=1&chat=7"],
    [{ kind: "chats", panel: "kanban:1", key: "new:1:abc", projectId: 1 }, "/popout/chats?panel=kanban%3A1&key=new%3A1%3Aabc&project=1"],
    [{ kind: "terminal", panel: "side:1", key: "term:1", cwd: "/repo/a b", label: "p1", projectId: 1 }, "/popout/terminal?panel=side%3A1&key=term%3A1&project=1&cwd=%2Frepo%2Fa+b&label=p1"],
    [{ kind: "terminal", panel: "bottom:1", key: "term:2", cwd: "/repo", label: "p1", projectId: 1, command: "docker compose exec web sh", title: "web", env: { A: "1" } }, "/popout/terminal?panel=bottom%3A1&key=term%3A2&project=1&cwd=%2Frepo&label=p1&command=docker+compose+exec+web+sh&title=web&env=%7B%22A%22%3A%221%22%7D"],
];

test("popoutPath / parsePopout: 11 種を表にする前と同じ URL にし、読み戻すと同じ行き先", () => {
  useTestContributions(registryContributions());
  for (const [route, path] of ROUTES) {
    assert.equal(popoutPath(route), path);
    assert.deepEqual(parsePopout(`#${path}`), route);
  }
});

test("parsePopout: 別ウィンドウでない・知らない種類・欠けているものは undefined", () => {
  useTestContributions(registryContributions());
  assert.equal(parsePopout("#/projects/1"), undefined);
  assert.equal(parsePopout("#/popout/changes?project=1"), undefined);
  assert.equal(parsePopout("#/popout/file?chat=1&project=1"), undefined);
  assert.equal(parsePopout("#/popout/subagent?chat=1"), undefined);
  assert.equal(parsePopout("#/popout/chat?chat=x"), undefined);
  assert.equal(parsePopout("#/popout/note?project=2"), undefined);
  assert.equal(parsePopout("#/popout/other?chat=1&project=1"), undefined);
  assert.equal(parsePopout("#/popout/browser?panel=side:1&key=b"), undefined);
  assert.equal(parsePopout("#/popout/terminal?panel=side:1&key=t&cwd=/a&label=p"), undefined);
  // 環境変数が読めなければ付けない・ブラウザの名前がなければ空
  assert.deepEqual(parsePopout("#/popout/terminal?panel=side:1&key=t&project=1&cwd=/a&label=p&env=%5B1%5D"), { kind: "terminal", panel: "side:1", key: "t", projectId: 1, cwd: "/a", label: "p" });
  assert.deepEqual(parsePopout("#/popout/browser?panel=p&key=b&url="), { kind: "browser", panel: "p", key: "b", url: "", title: "", projectId: null });
});

test("popoutKey: 変更は移るファイルによらず同じウィンドウ（移るファイルは URL のいちばん後ろ）", () => {
  useTestContributions(registryContributions());
  assert.equal(popoutKey({ kind: "changes", chatId: 3, projectId: 1, focus: "a.ts" }), popoutKey({ kind: "changes", chatId: 3, projectId: 1 }));
  assert.match(popoutPath({ kind: "changes", chatId: 3, projectId: 1, focus: "a.ts" }), /&focus=a\.ts$/);
  assert.equal(popoutKey({ kind: "file", chatId: 3, projectId: 1, path: "a.ts", line: 2 }), "/popout/file?chat=3&project=1&path=a.ts&line=2");
});

test("別ウィンドウの種類: 11 種を持ち主が 1 つずつ登録し、どれも札と中身を持つ。戻し方のないのは右サイドバー（欄ごと戻す）だけ", () => {
  useTestContributions(registryContributions());
  const kinds = popoutKinds.items();
  assert.deepEqual(kinds.map((k) => k.kind).sort(), [...new Set(ROUTES.map(([r]) => r.kind))].sort());
  assert.equal(new Set(kinds.map((k) => k.label)).size, kinds.length);
  assert.deepEqual(kinds.filter((k) => !k.dock).map((k) => k.kind), ["side"]);
});
