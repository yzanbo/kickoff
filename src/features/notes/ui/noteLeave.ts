// まだ保存していないノートを離れるときの確かめ（別のノートへ移る・右の欄のノートのタブを閉じる・名前を変える / 動かす / ゴミ箱に入れる前）。
// 開いているノート（useNoteDocument）は土台の未保存の登録簿に出ているので、ここはその中から選んで聞くだけ
import { confirmLeave } from "@/foundation/ui/document/unsaved";
import { isUnder } from "@shared/foundation/path";

/** 開いているノートの見分け（未保存の登録簿の key・書きかけの保存のキー） */
export const noteDocKey = (projectId: number, path: string) => `${projectId}:${path}`;

/** 未保存の登録簿の file.root（作業場所のファイルと混ざらない名前） */
export const noteFileRoot = (projectId: number) => `notes:${projectId}`;

/** そのノートを離れてよいか（どこで開いていても。書きかけがあれば保存するかを聞く。なければ聞かずに true） */
export const confirmLeaveNote = (projectId: number, path: string | null | undefined): Promise<boolean> =>
  path ? confirmLeave((e) => e.key === noteDocKey(projectId, path)) : Promise.resolve(true);

/** folder（ノート・フォルダ。"" はすべて）の中の、開いているノートを離れてよいか（名前を変える・動かす・ゴミ箱に入れる前） */
export const confirmLeaveNotesUnder = (projectId: number, folder: string): Promise<boolean> =>
  confirmLeave((e) => e.file?.root === noteFileRoot(projectId) && isUnder(e.file.path, folder));
