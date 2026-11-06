// まだ保存していないメモを離れるときの確かめ（別のメモへ移る・右の欄のメモのタブを閉じる）。
// 開いているメモ（useMemoDocument）が自分の様子と操作をここに知らせ、離れる側が confirmLeaveMemo で聞く
import { choiceDialog } from "@/ui/dialogs";
import { baseName } from "./memoPaths";

interface MemoGuard {
  /** まだ保存していない書きかけがあるか */
  dirty: () => boolean;
  /** 保存する（保存できたか。ほかで変わっていた・失敗したら false） */
  save: () => Promise<boolean>;
  /** 書きかけを捨てる */
  discard: () => void;
  /** 書きかけを待たずに残す（ウィンドウを閉じる前。開き直すと未保存のまま戻る） */
  flush: () => void;
}

/** 開いているメモ（キーは「プロジェクト:メモのパス」。同じメモを 2 か所で開いていれば、どれも） */
const guards = new Map<string, Set<MemoGuard>>();

/** 開いているメモを知らせる（やめるときは返り値を呼ぶ） */
export function registerMemoGuard(key: string, guard: MemoGuard): () => void {
  const set = guards.get(key) ?? new Set();
  guards.set(key, set.add(guard));
  return () => {
    set.delete(guard);
    if (set.size === 0) guards.delete(key);
  };
}

/**
 * そのメモを離れてよいか。まだ保存していなければ「保存 / 保存しない / キャンセル」を聞く（保存できなければ離れない。
 * 保存しないなら書きかけを捨てる）。保存していない書きかけがなければ、聞かずに true
 */
export async function confirmLeaveMemo(projectId: number, path: string | null | undefined): Promise<boolean> {
  if (!path) return true;
  const dirty = [...(guards.get(`${projectId}:${path}`) ?? [])].filter((g) => g.dirty());
  if (dirty.length === 0) return true;
  const picked = await choiceDialog({
    title: `メモ「${baseName(path)}」はまだ保存していません`,
    message: "保存してから移りますか？　保存しないと、書いたものは消えます。",
    choices: [
      { value: "discard", label: "保存しない" },
      { value: "save", label: "保存", primary: true },
    ],
  });
  if (picked === null) return false;
  if (picked === "discard") {
    dirty.forEach((g) => g.discard());
    return true;
  }
  for (const g of dirty) if (!(await g.save())) return false;
  return true;
}

/** 開いているメモの書きかけを、待たずに残す（別ウィンドウを閉じて右の欄で開き直す前） */
export function flushMemoDrafts() {
  for (const set of guards.values()) for (const g of set) g.flush();
}
