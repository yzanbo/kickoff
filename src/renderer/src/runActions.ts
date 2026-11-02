import type { Run } from "../../core/types";
import { api } from "./api";
import { chatTitle } from "./chatTitle";
import { confirmDialog } from "./dialogs";

/** チャットをアーカイブする（アーカイブ済みなら戻す） */
export const toggleArchiveRun = (run: Pick<Run, "id" | "archived_at">) => api.archiveRun(run.id, !run.archived_at);

/** チャットをサイドバーのプロジェクトの上に固定する（固定していればやめる） */
export const togglePinRun = (run: Pick<Run, "id" | "pinned">) => api.pinRun(run.id, !run.pinned);

/** 確かめてから、チャットを削除する（やめたら false） */
export async function confirmDeleteRun(run: Pick<Run, "id" | "title">): Promise<boolean> {
  const ok = await confirmDialog({
    title: `チャット「${chatTitle(run.title)}」を削除しますか？`,
    message: "会話の記録も消えます。残しておきたいときはアーカイブを使ってください。",
    confirmLabel: "削除",
    danger: true,
  });
  if (ok) await api.deleteRun(run.id);
  return ok;
}
