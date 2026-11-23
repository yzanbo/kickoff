import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { registerUnsaved } from "@/foundation/ui/document/unsaved";
import { setAskHost, type AskRequest } from "@/foundation/ui/kit/ask";
import { confirmLeaveView, projectViewSurface } from "./viewLeave";

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
