import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { folderPaths } from "@/foundation/ui/kit/list/treeModel";
import type { OpenPlace } from "@/features/chat/ui";
import { useNoteList } from "@/features/notes/ui/store";
import { buildNoteFileTree } from "@/features/notes/ui/notePaths";
import { confirmLeaveNotesUnder } from "@/features/notes/ui/noteLeave";
import { noteListDropProps } from "@/features/notes/ui/tree/noteDrag";
import { NoteChipTree } from "@/features/notes/ui/tree/NoteChipTree";
import { dropNotes } from "@/features/notes/ui/tree/noteTransfer";
import type { NoteDragData } from "@/features/notes/ui/tree/noteMoveModel";
import { followMovedNote, useNoteActions } from "@/features/notes/ui/tree/useNoteActions";
import { useNoteFolders } from "@/features/notes/ui/tree/useNoteFolders";

/**
 * 入力欄の上の「ノート」の一覧の欄 1 つ（共通のノートか、このチャットのプロジェクト）。名前と「フォルダをすべて開く / 閉じる」の見出しと、ノートのフォルダの木（ノートの入っていないフォルダは出さない）。
 * 開いているフォルダはノートのタブの木と同じ覚え。行をドラッグしてフォルダ（欄の空いている所なら根）へ落とすと動かし、ほかの欄から落とすとノートのチャットごと移す（ノートのタブと同じ）。
 * ノートがなければ出さない
 */
export function NoteChipSection({
  projectId,
  title,
  places,
  onOpen,
  onAttach,
}: {
  projectId: number;
  title: string;
  places: readonly OpenPlace[];
  /** ノートを開く（place を省けば設定の開き方） */
  onOpen: (projectId: number, path: string, place?: "side" | "window") => void;
  /** ノートを開かずに、このチャットの入力欄に追加する */
  onAttach: (projectId: number, path: string) => void;
}) {
  const list = useNoteList(projectId);
  const tree = buildNoteFileTree(list.data?.entries ?? []);
  // 開いているフォルダは、ノートのタブの木と同じものを覚える（どちらで開け閉めしても、もう一方も同じになる）
  const folders = useNoteFolders(projectId);
  // ドラッグを重ねている落とす先のフォルダ（"" は根 = 欄ごと示す。null は重ねていない）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 動かすのはノートのタブと同じ操作（開いているノートの書きかけは動かす前に聞き、ノートのタブで選んでいるノート・開いているフォルダを付け替える）
  const actions = useNoteActions(projectId, {
    beforeChange: (path) => confirmLeaveNotesUnder(projectId, path),
    onMoved: (from, to) => followMovedNote(projectId, from, to),
  });
  const dropInto = (drag: NoteDragData, folder: string) => dropNotes(projectId, actions.moveAllInto, drag, folder);
  const dirs = folderPaths(tree);
  if (tree.length === 0) return null;
  const allOpen = dirs.every((d) => folders.open.has(d));
  const anyOpen = dirs.some((d) => folders.open.has(d));
  return (
    <div className={cx("note-chip-list", dropTarget === "" && "drop-target")} {...noteListDropProps({ projectId, onDropInto: dropInto, onDropTarget: setDropTarget })}>
      <div className="note-chip-section-head">
        <span className="note-chip-section-name">{title}</span>
        {dirs.length > 0 && (
          <span className="note-chip-folds">
            <IconButton type="button" icon={ChevronsUpDown} iconSize={14} label={`フォルダをすべて開く（${title}）`} disabled={allOpen} onClick={() => folders.expand(dirs)} />
            {/* ノートのタブの「フォルダをすべて閉じる」と同じく、ノートのタブの木だけにあるフォルダ（ノートの入っていないもの）も閉じる */}
            <IconButton type="button" icon={ChevronsDownUp} iconSize={14} label={`フォルダをすべて閉じる（${title}）`} disabled={!anyOpen} onClick={folders.closeAll} />
          </span>
        )}
      </div>
      <NoteChipTree
        projectId={projectId}
        nodes={tree}
        open={folders.open}
        onToggle={folders.toggle}
        onExpand={(path) => folders.expand([path])}
        onDropInto={dropInto}
        dropTarget={dropTarget}
        onDropTarget={setDropTarget}
        onOpen={(path, place) => onOpen(projectId, path, place)}
        onAttach={(path) => onAttach(projectId, path)}
        places={places}
      />
    </div>
  );
}
