// ノートを開く行き先（open({ kind: "note" })。右サイドバーがノートを見せていればそこで、なければノートのタブで開く。開いているチャットは右のパネルに残る）。
// どのチャットから開いたか（fromChatId）を渡すと、設定の開き方（そのチャットの右の欄 / 別ウィンドウ）で開く（openNoteFromChat）
import type { ChatVisual } from "@shared/visuals/aiVisual";
import { errorMessage } from "@shared/foundation/errors";
import { trySideOpen } from "@/features/projects/ui";
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate } from "@/foundation/ui/navigation/router";
import { openNoteFromChat } from "./openNoteFrom";
import { saveVisualToNote } from "@/features/notes/ui/links/saveVisualNote";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** プロジェクトのノート（path はノートのフォルダからの相対。line はそのノートで移る行） */
    note: { projectId: number; path: string; line?: number };
    /** AI が描いた図をノートに保存して開く（名前は作った日付と題名。開き方はチャットからノートを開くときと同じ。失敗は onError に文で返す） */
    noteFromVisual: { projectId: number; visual: ChatVisual; onError: (message: string) => void };
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

export const noteFromVisualTarget: OpenTargetHandler<"noteFromVisual"> = {
  kind: "noteFromVisual",
  open({ projectId, visual, onError }, { fromChatId }) {
    saveVisualToNote(visual, fromChatId ?? null, projectId).catch((e: unknown) => onError(errorMessage(e)));
    return true;
  },
};
