// Docker タブの「DB で開く」から取り込みの画面を開いたとき、その DB の案を選んだ形で並べる（純粋な関数）
import { sameLocalServer } from "@shared/database/dbServer";
import type { DbImportCandidate } from "@shared/types";

/**
 * プロジェクトから見つけた案に、Docker タブの案を入れる: 同じ DB（この Mac の中の同じサーバー・同じ DB の名前）の案があればその位置で置き換え、
 * なければ（ワークツリーの db など）最後に足す。同じサーバーでも DB の名前が違う案は残す
 */
export function withPreselect(list: readonly DbImportCandidate[], preselect: DbImportCandidate): DbImportCandidate[] {
  const same = (c: DbImportCandidate) => c.key === preselect.key || (sameLocalServer(c, preselect) && (c.database ?? null) === (preselect.database ?? null));
  const at = list.findIndex(same);
  const rest = list.filter((c) => !same(c));
  if (at < 0) return [...rest, preselect];
  // 置き換える案より前にあるものは同じでないので、at はそのまま rest の位置になる
  return [...rest.slice(0, at), preselect, ...rest.slice(at)];
}
