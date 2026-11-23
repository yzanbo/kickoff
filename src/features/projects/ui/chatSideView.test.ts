import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { registerUnsaved } from "@/foundation/ui/document/unsaved";
import { setAskHost, type AskRequest } from "@/foundation/ui/kit/ask";
import { projectViews, type ProjectViewDef } from "./projectViews";
import { projectViewTab, projectViewTabKind } from "./chatSideView";
import { projectViewSurface } from "./viewLeave";

const view = (id: string, more: Partial<ProjectViewDef> = {}): ProjectViewDef =>
  ({ id, label: id.toUpperCase(), icon: (() => null) as unknown as ProjectViewDef["icon"], group: "code", order: 0, places: ["center", "chatSide"], Page: () => null, ...more });

const install = () =>
  useTestContributions(
    [
      view("files", { followsWorkplace: true }),
      view("db", { followsWorkplace: true, chatSide: { hint: (where) => `DB（${where}）`, popout: (at, where) => ({ route: { kind: "database", ...at }, title: `DB — ${where}` }) } }),
      view("trash"),
    ].map((v) => projectViews.item(v)),
  );

test("右の欄のプロジェクトの画面のタブ: 画面ごとに欄に 1 つ・名前と説明は画面の表から・別ウィンドウは表に行き先がある画面だけ", () => {
  install();
  const files = projectViewTab({ chatId: 1, projectId: 2, view: "files", worktree: "/wt/a" });
  assert.equal(files.key, "project-view:files");
  assert.equal(projectViewTabKind.label(files), "FILES");
  assert.equal(projectViewTabKind.hint?.(files), "プロジェクトの「FILES」（ワークツリー aから）");
  assert.equal(projectViewTabKind.popout?.(files, "agents:1"), undefined);
  const db = projectViewTab({ chatId: 1, projectId: 2, view: "db" });
  assert.equal(projectViewTabKind.hint?.(db), "DB（本体）");
  assert.deepEqual(projectViewTabKind.popout?.(db, "agents:1"), { route: { kind: "database", chatId: 1, projectId: 2 }, title: "DB — 本体" });
});

test("作業場所を移したら、作業場所に付く画面だけ新しい作業場所へ付け替える", () => {
  install();
  const move = { chatId: 1, from: { projectId: 2, worktree: null }, to: { projectId: 2, worktree: "/wt/b" } };
  assert.deepEqual(projectViewTabKind.repoint?.(projectViewTab({ chatId: 1, projectId: 2, view: "files" }), move, "agents:1"), projectViewTab({ chatId: 1, projectId: 2, view: "files", worktree: "/wt/b" }));
  assert.equal(projectViewTabKind.repoint?.(projectViewTab({ chatId: 1, projectId: 2, view: "trash" }), move, "agents:1"), null);
});

test("右の欄の画面のタブを閉じる前に、中の書きかけ（DB の表の変更など）を聞き、やめたら閉じない。ほかの画面の書きかけでは聞かない", async () => {
  install();
  const asked: AskRequest[] = [];
  setAskHost((req) => {
    asked.push(req);
    if (req.kind === "choice") req.resolve(null, false, []);
  });
  onTestFinished(() => setAskHost(undefined));
  const surface = projectViewSurface({ place: "chatSide", projectId: 2, chatId: 1, view: "db" });
  onTestFinished(registerUnsaved({ key: "chat-1:t1", surface, title: "users", dirty: () => true, save: async () => true }));
  const close = (view: string) => projectViewTabKind.confirmClose?.(projectViewTab({ chatId: 1, projectId: 2, view }), "agents:1") ?? Promise.resolve(true);
  assert.equal(await close("db"), false);
  assert.equal(asked.length, 1);
  assert.ok(asked[0].kind === "choice" && asked[0].title === "「users」への変更を保存しますか？");
  assert.equal(await close("files"), true);
  assert.equal(asked.length, 1);
});
