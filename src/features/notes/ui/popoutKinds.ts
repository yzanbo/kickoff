// notes の別ウィンドウの種類（URL の項目・中身・戻し方。ui/contributes.ts が popoutKinds に入れる）
import type { PopoutKind } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { knownChat, openInRootSide, rootChatOf, shownChatIds } from "@/features/chat/ui";
import { noteTab, openTab } from "@/features/panel/ui";
import { flushDrafts } from "@/foundation/ui/document/unsaved";
import { NotePopoutPage } from "./NotePopoutPage";

declare module "@/foundation/ui/navigation/popout" {
  interface PopoutParamsMap {
    /**
     * プロジェクトのノート（path はノートのフォルダからの相対）。chatId は開いたチャット（ノートをそのチャットの入力欄に添付する先。
     * チャットごとに別のウィンドウ）。ノートのタブなど、チャットの外から開いたものはなし
     */
    note: { projectId: number; path: string; chatId?: number };
  }
}

export const notePopout: PopoutKind<"note"> = {
  kind: "note",
  fields: { projectId: { kind: "number", param: "project" }, path: "string", chatId: { kind: "number?", param: "chat" } },
  label: "ノート",
  Page: NotePopoutPage,
  // 書きかけは残してから閉じる（右の欄で未保存のまま続きを書ける）
  beforeDock: flushDrafts,
  dock: (route) => {
    // 開いたチャット（なければ、いま見えているチャットのうち、そのプロジェクトのもの。子チャットなら、いちばん上の親）の右の欄。チャットが見えていなければノートのタブ
    const shown =
      (route.chatId !== undefined ? knownChat(route.chatId) : undefined) ??
      shownChatIds()
        .map((id) => knownChat(id))
        .find((c) => c?.project_id === route.projectId);
    const root = shown && rootChatOf(shown, knownChat);
    if (!root || !openInRootSide(root.id, (rootId, side) => openTab(side, noteTab({ chatId: rootId, projectId: route.projectId, path: route.path })))) openTarget({ kind: "note", projectId: route.projectId, path: route.path });
  },
};
