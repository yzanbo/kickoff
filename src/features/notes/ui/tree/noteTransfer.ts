// ノート・フォルダを別の欄（共通のノート・ほかのプロジェクト）へ動かす（ドラッグと右クリックの「〜へ移す」で共通。ノートのチャットもコアが一緒に移す）
import { errorMessage } from "@shared/foundation/errors";
import { alert } from "@/foundation/ui/kit/ask";
import { notesApi } from "@/features/notes/ui/api";
import { notesStore } from "@/features/notes/ui/store";
import { confirmLeaveNotesUnder } from "@/features/notes/ui/noteLeave";
import { whileNoteMoves } from "@/features/notes/ui/noteMoving";
import { crossMoves, type NoteDragData } from "./noteMoveModel";
import { followMovedNote } from "./useNoteActions";

/**
 * fromProjectId の欄の paths を、toProjectId の欄のフォルダ folder（"" は根）へ 1 つずつ順に動かす。動かす前に、開いているノートの書きかけを
 * 保存するか聞き（やめたらそこで止める）、動かしたら開いているタブ・別ウィンドウ・選んでいるノート・開いているフォルダを行き先へ付け替える。
 * 断られたら（作業中のノートのチャット・同じ名前など。409 の文はそのまま見せられる）そこで止めて理由を出す（残りは動かさない。続けると同じ理由で断られやすいため）
 */
export async function transferNotes(fromProjectId: number, paths: readonly string[], toProjectId: number, folder: string): Promise<void> {
  try {
    for (const { from, to } of crossMoves(paths, folder)) {
      if (!(await confirmLeaveNotesUnder(fromProjectId, from))) return;
      // 付け替えより前に届く元の欄の知らせで、開いているノートが元の場所を読み直さないよう、動かしている途中にする
      const failure = await whileNoteMoves(fromProjectId, from, async () => {
        await notesApi("POST /api/projects/:projectId/notes/move", { params: { projectId: fromProjectId }, body: { from, to, to_project_id: toProjectId } });
        followMovedNote(fromProjectId, from, to, toProjectId);
      }).then(
        () => null,
        (e: unknown) => errorMessage(e),
      );
      if (failure !== null) {
        await alert("動かせませんでした", failure);
        return;
      }
    }
  } finally {
    // 知らせを待たずに両方の欄を取り直す
    notesStore.invalidate(fromProjectId);
    notesStore.invalidate(toProjectId);
  }
}

/** 欄（projectId）のフォルダ folder へノートを落とした（ノートのタブの欄と入力欄の上の一覧で共通）: 同じ欄なら moveAllInto で動かし、ほかの欄からならノートのチャットごと移す */
export function dropNotes(projectId: number, moveAllInto: (paths: readonly string[], folder: string) => Promise<void>, drag: NoteDragData, folder: string): void {
  if (drag.projectId === projectId) void moveAllInto(drag.paths, folder);
  else void transferNotes(drag.projectId, drag.paths, projectId, folder);
}
