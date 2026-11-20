import assert from "node:assert/strict";
import { test } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { popoutKinds } from "./popout";
import { forwardedNavigation } from "./popoutNavigation";

test("forwardedNavigation: 別ウィンドウの行き先でなくなったらメインのウィンドウで開き、別ウィンドウの URL に戻す", () => {
  // 別ウィンドウの種類（本物の表は持ち主の機能の ui/popoutKinds.ts）
  useTestContributions([
    popoutKinds.item({ kind: "sidebar", fields: {} }),
    popoutKinds.item({ kind: "note", fields: { projectId: { kind: "number", param: "project" }, path: "string", chatId: { kind: "number?", param: "chat" } } }),
  ]);
  const route = { kind: "sidebar" } as const;
  // 別ウィンドウの行き先のまま（ノートの名前を変えたなど）は何もしない
  assert.equal(forwardedNavigation("#/popout/sidebar", "", route), null);
  // リンク・location.hash（変わる前の URL が分かる）: 変わる前の URL に戻す
  assert.deepEqual(forwardedNavigation("#/projects/1/chats/2", "#/popout/note?project=1&path=a.md", { kind: "note", projectId: 1, path: "b.md" }), {
    hash: "#/projects/1/chats/2",
    restore: "#/popout/note?project=1&path=a.md",
  });
  // navigate の replace（変わる前の URL が分からない）: 開いたときの行き先に戻す
  assert.deepEqual(forwardedNavigation("#/projects/3/new", "", route), { hash: "#/projects/3/new", restore: "#/popout/sidebar" });
});
