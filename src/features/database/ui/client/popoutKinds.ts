// database の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { openInRootSide } from "@/features/chat/ui";
import { openTab } from "@/features/panel/ui";
import { projectViewTab } from "@/features/projects/ui";
import { DatabasePopoutPage } from "./DatabasePopoutPage";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** DB クライアント（右の欄の DB のタブ。worktree は SQLite のファイルを開く作業場所） */
    database: { chatId: number; projectId: number; worktree?: string };
  }
}

export const databasePopout: PopoutKind<"database"> = {
  kind: "database",
  fields: { chatId: { kind: "number", param: "chat" }, projectId: { kind: "number", param: "project" }, worktree: "string?" },
  label: "DB",
  Page: DatabasePopoutPage,
  // 結びついたチャット（子チャットなら、いちばん上の親）の右の欄のプロジェクトの画面（DB）に開き直す
  dock: (route) =>
    void openInRootSide(route.chatId, (rootId, side) => openTab(side, projectViewTab({ chatId: rootId, projectId: route.projectId, view: "db", ...(route.worktree ? { worktree: route.worktree } : {}) }))),
};
