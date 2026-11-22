import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { closeWhenDocked, DOCK_WAIT_MS, parsePopout, popoutKey, popoutKinds, popoutPath, type PopoutKind } from "./popout";

// 項目の読み書きを確かめるための表（本物の表は持ち主の機能の ui/popoutKinds.ts。札と中身は使わない）
const look = { label: "", Page: () => null };
const note: PopoutKind<"note"> = { kind: "note", fields: { projectId: { kind: "number", param: "project" }, path: "string", chatId: { kind: "number?", param: "chat" } }, ...look };
const changes: PopoutKind<"changes"> = { kind: "changes", fields: { chatId: "number", projectId: "number", worktree: "string?", focus: "string?" }, keyIgnores: ["focus"], ...look };
const browser: PopoutKind<"browser"> = {
  kind: "browser",
  fields: { panel: "string", key: "string", projectId: "number|null", title: { kind: "text", fallback: "" }, url: "text" },
  ...look,
};
const terminal: PopoutKind<"terminal"> = {
  kind: "terminal",
  fields: { panel: "string", key: "string", projectId: "number", cwd: "text", label: "text", command: "string?", title: "string?", env: "strings?" },
  ...look,
};
const sidebar: PopoutKind<"sidebar"> = { kind: "sidebar", fields: {}, ...look };
const install = () => useTestContributions([note, changes, browser, terminal, sidebar].map((k) => popoutKinds.item(k)));

test("popoutPath: 表の順に param の名前で書き、なくてよい項目は空なら書かない。parsePopout で同じ行き先に戻る", () => {
  install();
  assert.equal(popoutPath({ kind: "note", projectId: 2, path: "a b.md" }), "/popout/note?project=2&path=a+b.md");
  assert.equal(popoutPath({ kind: "note", projectId: 2, path: "a.md", chatId: 5 }), "/popout/note?project=2&path=a.md&chat=5");
  assert.equal(popoutPath({ kind: "sidebar" }), "/popout/sidebar");
  assert.equal(popoutPath({ kind: "browser", panel: "p", key: "k", url: "", title: "", projectId: null }), "/popout/browser?panel=p&key=k&title=&url=");
  for (const route of [{ kind: "note", projectId: 2, path: "a.md", chatId: 5 }, { kind: "sidebar" }, { kind: "terminal", panel: "p", key: "k", projectId: 1, cwd: "", label: "l", env: { A: "1" } }] as const) {
    assert.deepEqual(parsePopout(`#${popoutPath(route)}`), route);
  }
});

test("parsePopout: 要る項目が欠けた・空・1 以上でないなら undefined。number|null はなければ null、text は fallback、strings? は読めなければ付けない", () => {
  install();
  assert.equal(parsePopout("#/projects/1"), undefined);
  assert.equal(parsePopout("#/popout/other"), undefined);
  assert.equal(parsePopout("#/popout/note?project=2&path="), undefined);
  assert.equal(parsePopout("#/popout/note?project=0&path=a.md"), undefined);
  assert.equal(parsePopout("#/popout/browser?panel=p&key=k"), undefined);
  assert.deepEqual(parsePopout("#/popout/browser?panel=p&key=k&url=u"), { kind: "browser", panel: "p", key: "k", url: "u", title: "", projectId: null });
  assert.deepEqual(parsePopout("#/popout/terminal?panel=p&key=k&projectId=1&cwd=c&label=l&env=%5B1%5D"), { kind: "terminal", panel: "p", key: "k", projectId: 1, cwd: "c", label: "l" });
});

test("popoutKey: keyIgnores の項目を外して見分ける", () => {
  install();
  assert.equal(popoutKey({ kind: "changes", chatId: 3, projectId: 1, focus: "a.ts" }), "/popout/changes?chatId=3&projectId=1");
  assert.equal(popoutKey({ kind: "note", projectId: 2, path: "a.md" }), "/popout/note?project=2&path=a.md");
});

/** 閉じた回数を数える窓（デスクトップアプリの closeSelf） */
function stubWindow() {
  const closed = vi.fn();
  vi.stubGlobal("window", { kickoff: { windows: { closeSelf: closed } } });
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  return closed;
}

test("closeWhenDocked: 自分の key の docked が届いたら閉じ、ほかの key では閉じない", () => {
  const closed = stubWindow();
  let deliver: (m: { key: string }) => void = () => {};
  closeWhenDocked("/popout/side", DOCK_WAIT_MS, (handler) => ((deliver = handler), () => {}));
  deliver({ key: "/popout/sidebar" });
  assert.equal(closed.mock.calls.length, 0);
  deliver({ key: "/popout/side" });
  assert.equal(closed.mock.calls.length, 1);
  // 届いたあとは時間がたっても閉じ直さない
  vi.advanceTimersByTime(DOCK_WAIT_MS);
  assert.equal(closed.mock.calls.length, 1);
});

test("closeWhenDocked: docked が来なくても waitMs たったら閉じる（メインのウィンドウが応えないとき）", () => {
  const closed = stubWindow();
  closeWhenDocked("/popout/side", 500, () => () => {});
  vi.advanceTimersByTime(499);
  assert.equal(closed.mock.calls.length, 0);
  vi.advanceTimersByTime(1);
  assert.equal(closed.mock.calls.length, 1);
});
