import { ChevronsDownUp, ChevronsUpDown, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";
import { canPopout } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { cx } from "@/foundation/ui/lib/cx";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "./storage";
import { NOTE_OPEN_IN } from "@/foundation/ui/storage/storageKeys";
import { useNoteList } from "@/features/notes/ui/stores/notes";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { folderPaths } from "@/foundation/ui/kit/list/treeModel";
import { ChipWord, ComposerChip } from "@/features/chat/ui/parts/ChatPill";
import { DefaultOpenPlace } from "@/features/chat/ui/parts/OpenPlaceControls";
import { useMainChat } from "@/features/chat/ui/screen/mainChat";
import { attachNoteToChat } from "./attachNote";
import { noteListDropProps } from "./noteDrag";
import { confirmLeaveNotesUnder } from "./noteGuards";
import { NoteChipTree } from "./NoteChipTree";
import { buildNoteFileTree } from "./notePaths";
import { openNoteFromChat } from "./openNoteFrom";
import { useDraftSide } from "@/features/chatPanel/ui/agents/draftSide";
import { followMovedNote, useNoteActions } from "./useNoteActions";

/**
 * 入力欄の上の「ノート」（指示の履歴・子チャットと同じピルの列）。押すとノートのフォルダの木（ノートのタブと同じ並び・同じ開いているフォルダ。
 * ノートの入っていないフォルダは出さない）を出し、ノートの行を押すと設定の開き方（右の欄 / 別ウィンドウ）で開く。
 * 行の右のボタンで、ノートを開かずにこのチャットの入力欄に追加する（押した時点の写しの札。一覧は閉じず、続けていくつも足せる）・設定によらずその場所に開ける。一覧の上で、行を押したときの開き方（設定）を変えられ、
 * 右端の「フォルダをすべて開く / すべて閉じる」で木のフォルダをまとめて開閉する。開閉はプロジェクトごとに 1 つ（storage.settings.openFolders）なので、
 * 同じプロジェクトのどのチャットのピルでも、ノートのタブの木でも同じになる
 * 行をドラッグしてフォルダ（一覧の空いている所なら直下）へ落とすと動かす（ノートのタブの木と同じ）。
 * プロジェクトにノートがなければ出さない。
 * 送る前のチャット（新しいチャット・新しい子チャット）では chatId が null で、「このチャットに追加」は onAttach でその入力欄に足す。
 * 開く場所は、新しいチャットならそのタブの右の欄（useDraftSide）、新しい子チャットなら親の右の欄（useMainChat）
 */
export function NoteChip({ projectId, chatId, onAttach }: { projectId: number; chatId: number | null; onAttach?: (path: string) => void }) {
  const list = useNoteList(projectId);
  const popover = usePopover();
  const mainChat = useMainChat();
  // 送る前の新しいチャットなら、そのタブの右の欄
  const draftSide = useDraftSide();
  const [openIn, setOpenIn] = useSetting(NOTE_OPEN_IN);
  const tree = useMemo(() => buildNoteFileTree(list.data?.entries ?? []), [list.data]);
  // 開いているフォルダは、ノートのタブの木と同じものを覚える（どちらで開け閉めしても、もう一方も同じになる）
  const [openList, setOpenList] = useSetting(storage.settings.openFolders(projectId));
  const openFolders = useMemo(() => new Set(openList), [openList]);
  // ドラッグを重ねている落とす先のフォルダ（"" は直下 = 一覧ごと示す。null は重ねていない）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 動かすのはノートのタブと同じ操作（開いているノートの書きかけは動かす前に聞き、ノートのタブで選んでいるノート・開いているフォルダを付け替える）
  const actions = useNoteActions(projectId, {
    beforeChange: (path) => confirmLeaveNotesUnder(projectId, path),
    onMoved: (from, to) => followMovedNote(projectId, from, to),
  });
  const dropInto = (paths: string[], folder: string) => void actions.moveAllInto(paths, folder);
  // 木のフォルダ（ノートの入ったものだけ）。すべて開く・すべて閉じるに使う
  const dirs = useMemo(() => folderPaths(tree), [tree]);
  if (tree.length === 0) return null;
  const allOpen = dirs.every((d) => openFolders.has(d));
  const anyOpen = dirs.some((d) => openFolders.has(d));
  const toggleFolder = (path: string) => setOpenList(openFolders.has(path) ? openList.filter((p) => p !== path) : [...openList, path]);
  // 別ウィンドウは Mac のアプリだけ
  const places = canPopout() ? (["side", "window"] as const) : (["side"] as const);
  const open = (path: string, place?: "side" | "window") => {
    popover.close();
    // 右の欄・別ウィンドウの中（ノートのタブの中のノートのチャットなど）では、その右の欄を持つチャットの右の欄に新しいタブで開く
    // （ノートのチャット自身の右の欄を探すと、ノートのチャットをチャットのパネルに開いてしまう）
    openNoteFromChat({ projectId, path, chatId: mainChat ?? chatId, place, draftSide });
  };
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          <StickyNote size={14} className="chip-icon" aria-hidden />
          <ChipWord>ノート</ChipWord>
        </>
      }
      title="このプロジェクトのノート（ノートのタブと同じフォルダの木。行をドラッグしてフォルダへ動かせる）"
      label="ノート"
      className="note-chip-popover"
    >
      {() => (
        <>
            {(places.length > 1 || dirs.length > 0) && (
              <div className="note-chip-head">
                {places.length > 1 && <DefaultOpenPlace places={places} value={openIn} onChange={setOpenIn} />}
                {dirs.length > 0 && (
                  <span className="note-chip-folds">
                    <IconButton
                      type="button"
                      icon={ChevronsUpDown}
                      iconSize={14}
                      label="フォルダをすべて開く"
                      disabled={allOpen}
                      onClick={() => setOpenList([...new Set([...openList, ...dirs])])}
                    />
                    {/* ノートのタブの「フォルダをすべて閉じる」と同じく、ノートのタブの木だけにあるフォルダ（ノートの入っていないもの）も閉じる */}
                    <IconButton type="button" icon={ChevronsDownUp} iconSize={14} label="フォルダをすべて閉じる" disabled={!anyOpen} onClick={() => setOpenList([])} />
                  </span>
                )}
              </div>
            )}
            {/* 一覧の空いている所へ落とすと、いちばん上（直下）へ動かす */}
            <div className={cx("note-chip-list", dropTarget === "" && "drop-target")} {...noteListDropProps({ onDropInto: dropInto, onDropTarget: setDropTarget })}>
            <NoteChipTree
              nodes={tree}
              open={openFolders}
              onToggle={toggleFolder}
              onExpand={(path) => !openFolders.has(path) && setOpenList([...openList, path])}
              onDropInto={dropInto}
              dropTarget={dropTarget}
              onDropTarget={setDropTarget}
              onOpen={open}
              onAttach={(path) => {
                // 続けていくつも足せるよう、一覧は閉じない
                if (chatId !== null) attachNoteToChat(chatId, projectId, path);
                else onAttach?.(path);
              }}
              places={places}
            />
            </div>
            <button
              type="button"
              className="note-chip-row more"
              onClick={() => {
                popover.close();
                openTarget({ kind: "projectView", projectId: projectId, view: "notes" });
              }}
            >
              ノートのタブを開く
            </button>
        </>
      )}
    </ComposerChip>
  );
}
