// ノートを開く行き先（open({ kind: "note" })。開き方は openNote.ts が決める: どのチャットから開いたか（fromChatId）か場所（place）を渡せば
// 設定の開き方（そのチャットの右の欄 / 別ウィンドウ）で、なければ右サイドバーがノートを見せていればそこ、なければノートのタブ（開いているチャットは右のパネルに残る）
import type { ChatVisual } from "@shared/visuals/aiVisual";
import { errorMessage } from "@shared/foundation/errors";
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { openNoteFromChat, showInNoteTab } from "./openNote";
import { saveVisualToNote } from "@/features/notes/ui/links/saveVisualNote";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** プロジェクトのノート（path はノートのフォルダからの相対。line はそのノートで移る行） */
    note: { projectId: number; path: string; line?: number; place?: "side" | "window" };
    /** AI が描いた図をノートに保存して開く（名前は作った日付と題名。開き方はチャットからノートを開くときと同じ。失敗は onError に文で返す） */
    noteFromVisual: { projectId: number; visual: ChatVisual; onError: (message: string) => void };
  }
}

export const noteTarget: OpenTargetHandler<"note"> = {
  kind: "note",
  open({ projectId, path, line, place }, { replace, fromChatId }) {
    if ((fromChatId != null || place) && !line) openNoteFromChat({ projectId, path, chatId: fromChatId ?? null, place });
    else showInNoteTab(projectId, path, { line, replace });
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
