import type { Run } from "../../core/types";
import { api } from "./api";
import { chatTitle } from "./chatTitle";
import { alertDialog, confirmDialog } from "./dialogs";
import { errorMessage } from "./errors";
import { chatDraftKey } from "./storageKeys";

/**
 * 確かめてから、チャットをアーカイブする（アーカイブ済みなら戻す。どちらも確かめる。やめたら false）。
 * アーカイブ・戻すはどこから押しても必ず確かめる（確かめずにアーカイブする操作は置かない）
 */
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

/** チャットを削除する（消したチャットの入力欄の書きかけの文も、localStorage に残さない） */
export async function deleteRun(runId: number) {
  await api.deleteRun(runId);
  localStorage.removeItem(chatDraftKey(runId));
}

/** 確かめてから、チャットを削除する（やめたら false） */
export async function confirmDeleteRun(run: Pick<Run, "id" | "title">): Promise<boolean> {
  const ok = await confirmDialog({
    title: `チャット「${chatTitle(run.title)}」を削除しますか？`,
    message: "会話の記録も消えます。残しておきたいときはアーカイブを使ってください。",
    confirmLabel: "削除",
    danger: true,
  });
  if (ok) await deleteRun(run.id);
  return ok;
}

/** チャットをまとめて操作する（1 件ずつ送り、断られたもの（作業中など）は最後にまとめて知らせる） */
async function eachRun(runs: Run[], action: string, fn: (run: Run) => Promise<unknown>) {
  const failures: string[] = [];
  for (const run of runs) {
    try {
      await fn(run);
    } catch (e) {
      failures.push(`「${chatTitle(run.title)}」: ${errorMessage(e)}`);
    }
  }
  if (failures.length > 0) await alertDialog(`${failures.length} 件は${action}できませんでした`, failures.slice(0, 5).join("\n"));
}

/** 確かめてから、まとめてアーカイブする（どれもアーカイブ済みなら、まとめて戻す。やめたら false） */
export async function confirmArchiveRuns(runs: Run[]): Promise<boolean> {
  const restore = runs.every((r) => r.archived_at);
  const targets = restore ? runs : runs.filter((r) => !r.archived_at);
  const ok = await confirmDialog(
    restore
      ? { title: `${targets.length} 件のチャットをアーカイブから戻しますか？`, message: "一覧に、また出るようになります。", confirmLabel: "戻す" }
      : {
          title: `${targets.length} 件のチャットをアーカイブしますか？`,
          message: "一覧から隠れます。会話の記録は残ります。作業中のチャットはアーカイブできません。",
          confirmLabel: "アーカイブ",
        },
  );
  if (ok) await eachRun(targets, restore ? "戻す" : "アーカイブ", (r) => api.archiveRun(r.id, !restore));
  return ok;
}

/** 確かめてから、まとめて削除する（やめたら false） */
export async function confirmDeleteRuns(runs: Run[]): Promise<boolean> {
  const ok = await confirmDialog({
    title: `${runs.length} 件のチャットを削除しますか？`,
    message: "会話の記録も消えます。残しておきたいときはアーカイブを使ってください。作業中のチャットは削除できません。",
    confirmLabel: "削除",
    danger: true,
  });
  if (ok) await eachRun(runs, "削除", (r) => deleteRun(r.id));
  return ok;
}

/** まとめて既読にする（未読の印を消す。印のないものはそのまま） */
export const markRunsSeen = (runs: Run[]) => eachRun(runs.filter((r) => r.attention), "既読に", (r) => api.markSeen(r.id));

/** まとめてグループへ移す（null はグループなし。同じプロジェクトのチャットだけ） */
export const moveRunsToGroup = (runs: Run[], groupId: number | null) => eachRun(runs, "移動", (r) => api.setRunGroup(r.id, groupId));

/** 失敗をお知らせのダイアログで知らせる（操作の catch に渡す） */
export const reportFailure = (title: string) => (e: unknown) => alertDialog(title, errorMessage(e));
