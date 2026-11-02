import type { Run } from "../../core/types";
import { api } from "./api";
import { chatTitle } from "./chatTitle";
import { confirmDialog } from "./dialogs";

/** 確かめてから、チャットをアーカイブする（アーカイブ済みなら戻す。どちらも確かめる。やめたら false） */
export async function toggleArchiveRun(run: Pick<Run, "id" | "title" | "archived_at">): Promise<boolean> {
  const name = chatTitle(run.title);
  const ok = await confirmDialog(
    run.archived_at
      ? { title: `チャット「${name}」をアーカイブから戻しますか？`, message: "一覧に、また出るようになります。", confirmLabel: "戻す" }
      : {
          title: `チャット「${name}」をアーカイブしますか？`,
          message: "一覧から隠れます。会話の記録は残ります。サイドバーの「チャット」の行の「アーカイブ」を「表示」にすると出せ、右クリックのメニューから戻せます。",
          confirmLabel: "アーカイブ",
        },
  );
  if (ok) await api.archiveRun(run.id, !run.archived_at);
  return ok;
}

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
