import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { registerUnsaved } from "@/foundation/ui/document/unsaved";
import { setAskHost, type AskRequest } from "@/foundation/ui/kit/ask";
import type { Route } from "@/foundation/ui/navigation/router";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { projectViews, type ProjectViewDef } from "./projectViews";
import { confirmLeaveView, leaveProjectView, projectViewSurface } from "./viewLeave";

const view = (id: string, more: Partial<ProjectViewDef> = {}): ProjectViewDef =>
  ({ id, label: id, icon: (() => null) as unknown as ProjectViewDef["icon"], group: "code", order: 0, places: ["center"], Page: () => null, ...more });

test("置き場所の名前: 真ん中・右サイドバーはプロジェクトごと、チャットの右の欄はチャットごと、画面ごとに分かれる", () => {
  assert.equal(projectViewSurface({ place: "center", projectId: 3, view: "db" }), "project-view:center-3:db");
  assert.equal(projectViewSurface({ place: "rightSidebar", projectId: 3, view: "db" }), "project-view:rightSidebar-3:db");
  assert.equal(projectViewSurface({ place: "chatSide", projectId: 3, chatId: 9, view: "db" }), "project-view:chat-9:db");
  assert.notEqual(projectViewSurface({ place: "center", projectId: 3, view: "db" }), projectViewSurface({ place: "center", projectId: 3, view: "files" }));
});

test("離れる前の確かめ: その画面の書きかけだけを聞き、「保存しない」なら捨てて離れてよい", async () => {
  const asked: AskRequest[] = [];
  setAskHost((req) => {
    asked.push(req);
    if (req.kind === "choice") req.resolve("discard", false, []);
  });
  onTestFinished(() => setAskHost(undefined));
  let dirty = true;
  const surface = projectViewSurface({ place: "center", projectId: 3, view: "db" });
  onTestFinished(registerUnsaved({ key: "a", surface, title: "users", dirty: () => dirty, save: async () => true, discard: () => (dirty = false) }));
  assert.equal(await confirmLeaveView(projectViewSurface({ place: "rightSidebar", projectId: 3, view: "db" }), "x"), true);
  assert.equal(asked.length, 0);
  assert.equal(await confirmLeaveView(surface, "画面を切り替えます。"), true);
  assert.ok(asked[0].kind === "choice" && asked[0].message === "画面を切り替えます。保存しないと、変更は消えます。");
  assert.equal(dirty, false);
});

test("ルーターの確かめ: 真ん中の画面が替わる・外れる（チャット・別のプロジェクト・全プロジェクトへ移る）ときだけ、その画面の書きかけを聞く", async () => {
  useTestContributions([view("board"), view("chats", { onlyWhenSeparate: { into: "board" } }), view("files"), view("notes")].map((v) => projectViews.item(v)));
  const asked: AskRequest[] = [];
  setAskHost((req) => {
    asked.push(req);
    if (req.kind === "choice") req.resolve(null, false, []);
  });
  onTestFinished(() => setAskHost(undefined));
  const files: Route = { name: "project", id: 3, tab: "files" };
  // ファイル・ノート・DB の表のどれでも、置き場所の名前が同じなら同じ聞き方
  for (const v of ["files", "notes"]) {
    const off = registerUnsaved({ key: `k-${v}`, surface: projectViewSurface({ place: "center", projectId: 3, view: v }), title: `t-${v}`, dirty: () => true, save: async () => true });
    const from: Route = { name: "project", id: 3, tab: v };
    for (const to of [{ name: "chat", projectId: 3, chatId: 5 }, { name: "project", id: 4, tab: v }, { name: "allProjects" }, { name: "newChat", projectId: 3 }] satisfies Route[])
      assert.equal(await leaveProjectView(from, to), false);
    off();
  }
  assert.equal(asked.length, 8);
  assert.ok(asked[0].kind === "choice" && asked[0].title === "「t-files」への変更を保存しますか？" && asked[0].message === "画面を切り替えます。保存しないと、変更は消えます。");
  // 書きかけがない・同じ画面のまま（開くファイルを URL から外す）なら聞かない
  assert.equal(leaveProjectView(files, { name: "chat", projectId: 3, chatId: 5 }), null);
  onTestFinished(registerUnsaved({ key: "k", surface: projectViewSurface({ place: "center", projectId: 3, view: "files" }), title: "t", dirty: () => true, save: async () => true }));
  assert.equal(leaveProjectView({ ...files, file: { path: "a.ts" } }, files), null);
  assert.equal(leaveProjectView({ name: "allProjects" }, files), null);
  assert.equal(asked.length, 8);
});
