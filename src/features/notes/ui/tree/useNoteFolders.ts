// ノートの木の開いているフォルダ（プロジェクトごとに 1 つ。ノートのタブの木と入力欄の上の木で同じ覚えを読む）。
// 書くときはいつもいま覚えている値から（作る・開くのを待ったあとでも、待つ間に開け閉めしたものを戻さない）
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { isUnder } from "@shared/foundation/path";
import { storage } from "@/features/notes/ui/storage";

export function useNoteFolders(projectId: number) {
  const key = storage.settings.openFolders(projectId);
  const [list] = useSetting(key);
  const write = (next: (now: readonly string[]) => string[]) => writeSetting(key, next(readSetting(key)));
  return {
    open: new Set(list) as ReadonlySet<string>,
    toggle: (path: string) => write((now) => (now.includes(path) ? now.filter((p) => p !== path) : [...now, path])),
    expand: (paths: readonly string[]) => write((now) => [...new Set([...now, ...paths])]),
    /** すべて閉じる（もうないフォルダの覚えも外す） */
    closeAll: () => write(() => []),
    /** path とその中のフォルダを閉じる（ゴミ箱に入れたとき） */
    forget: (path: string) => write((now) => now.filter((p) => !isUnder(p, path))),
  };
}
