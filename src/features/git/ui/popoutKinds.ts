// git の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { openInRootSide } from "@/features/chat/ui";
import { changesTab, openTab, reopenOf } from "@/features/panel/ui";
import { ChangesPopoutPage } from "./ChangesPopoutPage";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** 作業場所のコミットしていない変更（focus のファイルの位置へ移る） */
    changes: { chatId: number; projectId: number; worktree?: string; focus?: string };
  }
}

export const changesPopout: PopoutKind<"changes"> = {
  kind: "changes",
  // 移るファイルはいちばん後ろ（同じウィンドウかは focus を除いて見る）
  fields: { chatId: { kind: "number", param: "chat" }, projectId: { kind: "number", param: "project" }, worktree: "string?", focus: "string?" },
  keyIgnores: ["focus"],
  label: "変更",
  Page: ChangesPopoutPage,
  // 結びついたチャット（子チャットなら、いちばん上の親）の右の欄に開き直す
  dock: (route) =>
    void openInRootSide(route.chatId, (rootId, side) => {
      const tab = changesTab({ chatId: rootId, projectId: route.projectId, ...(route.worktree ? { worktree: route.worktree } : {}), focus: route.focus });
      openTab(side, tab, reopenOf(tab));
    }),
};
