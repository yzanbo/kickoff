import "./NoteTrashDialog.css";
import { Dialog } from "@/foundation/ui/kit/Dialog";
import { DialogActions } from "@/foundation/ui/kit/DialogActions";
import { TrashTab } from "@/features/trash/ui";

/**
 * 欄のゴミ箱（共通のノートの欄の「…」から）。共通のノートには「ゴミ箱」タブのあるプロジェクトの画面がないので、
 * プロジェクトの「ゴミ箱」タブと同じ部品を、欄のプロジェクト（見えないプロジェクト）の id でダイアログに出す。dir は欄のフォルダ（元の場所をそこからの場所で出す）
 */
export function NoteTrashDialog({ projectId, dir, title, onClose }: { projectId: number; dir: string; title: string; onClose: () => void }) {
  return (
    <Dialog label={`${title}のゴミ箱`} className="note-trash-dialog" size={760} onClose={onClose} actions={<DialogActions onCancel={onClose} cancelLabel="閉じる" />}>
      <div className="note-trash-body">
        <TrashTab projectId={projectId} repoPath={dir} title={`${title}のゴミ箱`} />
      </div>
    </Dialog>
  );
}
