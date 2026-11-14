// Kickoff のゴミ箱の操作（元に戻す・ゴミ箱に入れた直後の「元に戻す」の知らせ）。プロジェクトの「ゴミ箱」タブ・会話の中の kickoff-trash の行・
// ゴミ箱のプロジェクト・ファイル / メモ / チャット / プロジェクトを消したあとの知らせで共通に使う
import { TRASH_RESTORE_EXISTS } from "@shared/types";
import { api, ApiError } from "@/api";
import { confirmDialog, reportFailure } from "@/ui/dialogs";
import { showToast } from "@/ui/toast";

/**
 * 元に戻す。元の場所に同じ名前があれば、上書きせずに「別の名前で戻すか」を聞く。戻せたら知らせて true（やめた・失敗したら false。失敗はお知らせ）
 */
export async function restoreFromTrash(item: { id: string; label: string }): Promise<boolean> {
  try {
    const result = await api.restoreTrash(item.id).catch(async (e: unknown) => {
      if (!(e instanceof ApiError) || e.code !== TRASH_RESTORE_EXISTS) throw e;
      const ok = await confirmDialog({
        title: `元の場所に「${item.label}」があります`,
        message: "上書きせずに、「名前 2」のような別の名前で戻しますか？",
        confirmLabel: "別の名前で戻す",
      });
      return ok ? api.restoreTrash(item.id, true) : null;
    });
    if (!result) return false;
    showToast(result.path && !result.path.endsWith(`/${item.label}`) ? `「${item.label}」を別の名前で戻しました: ${result.path}` : `「${item.label}」を元に戻しました`);
    return true;
  } catch (e) {
    await reportFailure("元に戻せませんでした")(e);
    return false;
  }
}

/** ゴミ箱に入れた直後の知らせ（「元に戻す」で、その場で戻せる） */
export function showTrashedToast(trashId: string, label: string) {
  showToast(`「${label}」をゴミ箱に入れました（3 日は元に戻せます）`, { label: "元に戻す", run: () => void restoreFromTrash({ id: trashId, label }) });
}
