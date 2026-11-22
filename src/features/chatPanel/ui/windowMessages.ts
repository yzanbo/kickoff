// チャットのパネルのウィンドウ間の知らせ（WindowMessageMap に足す。受けるのはメインのウィンドウの @/app/renderer/mainWindowMessages.ts）
import type { Attachment, GitHubLink } from "@shared/chat/types";
import type { WorkplaceChoice } from "@/foundation/ui/workplace/workplace";
import type { SplitDir } from "@/features/panel/ui";
import type { DraftRef } from "./drafts/panelDrafts";

/** 別ウィンドウ（サイドバーなど）から頼む、メインのウィンドウのパネルを変える操作 */
export type PanelOp =
  | { op: "openDraft"; draft: DraftRef }
  | { op: "openDraftSplit"; draft: DraftRef; dir: SplitDir }
  | { op: "setDraftTitle"; draft: DraftRef; title: string }
  | { op: "moveDraftToProject"; draft: DraftRef; projectId: number }
  | { op: "setDraftGroup"; draft: DraftRef; group: number | undefined; groupName: string | undefined }
  | { op: "togglePinDraft"; draft: DraftRef; pinned: boolean }
  | { op: "discardDraft"; draft: DraftRef }
  | { op: "openChatSplit"; chat: { id: number; project_id: number }; dir: SplitDir };

declare module "@/foundation/ui/navigation/windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウのプロジェクトのチャットのパネルに、文と添付を入れた新しいチャットのタブを開く（別ウィンドウの「AI に渡す」の「新しいチャットで始める」。openSeededChat） */
    openSeededChat: { projectId: number; place: WorkplaceChoice; text: string; attachments: Attachment[]; link: GitHubLink | null };
    /** サイドバーの別ウィンドウからの、メインのウィンドウのパネルを変える操作（下書き・チャットを分けて開く。@/features/panel/ui/state/panelMirror.ts の forwardPanelOp） */
    panelOp: PanelOp;
  }
}
