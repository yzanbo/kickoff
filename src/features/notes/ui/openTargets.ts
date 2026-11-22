// ノートを開く行き先（open({ kind: "note" })。右サイドバーがノートを見せていればそこで、なければノートのタブで開く。開いているチャットは右のパネルに残る）。
// どのチャットから開いたか（fromChatId）を渡すと、設定の開き方（そのチャットの右の欄 / 別ウィンドウ）で開く（openNoteFromChat）
import { trySideOpen } from "@/features/projects/ui";
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate } from "@/foundation/ui/navigation/router";
import { openNoteFromChat } from "./openNoteFrom";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** プロジェクトのノート（path はノートのフォルダからの相対。line はそのノートで移る行） */
    note: { projectId: number; path: string; line?: number };
  }
}

export const noteTarget: OpenTargetHandler<"note"> = {
  kind: "note",
  open({ projectId, path, line }, { replace, fromChatId }) {
    if (fromChatId != null && !line) {
      openNoteFromChat({ projectId, path, chatId: fromChatId });
      return true;
    }
    if (trySideOpen(projectId, { kind: "note", path, ...(line ? { line } : {}) })) return true;
    navigate({ name: "project", id: projectId, tab: "notes", note: path, ...(line ? { noteLine: line } : {}) }, { replace });
    return true;
  },
};
