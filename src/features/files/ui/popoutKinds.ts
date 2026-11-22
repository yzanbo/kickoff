// files の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { openInRootSide } from "@/features/chat/ui";
import { fileTab, openTab, reopenOf } from "@/features/panel/ui";
import { FilePopoutPage } from "./PopoutFiles";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /** 作業場所のファイルの中身（line を目立たせる） */
    file: { chatId: number; projectId: number; worktree?: string; path: string; line?: number };
  }
}

export const filePopout: PopoutKind<"file"> = {
  kind: "file",
  fields: { chatId: { kind: "number", param: "chat" }, projectId: { kind: "number", param: "project" }, worktree: "string?", path: "string", line: "number?" },
  label: "ファイル",
  Page: FilePopoutPage,
  // 結びついたチャット（子チャットなら、いちばん上の親）の右の欄に開き直す
  dock: (route) =>
    void openInRootSide(route.chatId, (rootId, side) => {
      const tab = fileTab({ chatId: rootId, projectId: route.projectId, ...(route.worktree ? { worktree: route.worktree } : {}), path: route.path, line: route.line });
      openTab(side, tab, reopenOf(tab));
    }),
};
