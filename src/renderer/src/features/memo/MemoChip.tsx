import { ChevronsDownUp, ChevronsUpDown, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";
import { canPopout } from "@/app/popout";
import { openMemo } from "@/app/router";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { MEMO_OPEN_IN, memoOpenFolders } from "@/lib/storageKeys";
import { useMemoList } from "@/stores/memos";
import { usePopover } from "@/ui/Popover";
import { IconButton } from "@/ui/IconButton";
import { folderPaths } from "@/features/editor/treeModel";
import { ChipWord, ComposerChip } from "@/features/chat/composer/ComposerChip";
import { DefaultOpenPlace } from "@/features/chat/composer/OpenPlaceControls";
import { useMainChat } from "@/features/chat/pane/mainChatContext";
import { attachMemoToChat } from "./attachMemo";
import { memoListDropProps } from "./memoDrag";
import { confirmLeaveMemosUnder } from "./memoGuards";
import { MemoChipTree } from "./MemoChipTree";
import { buildMemoFileTree } from "./memoPaths";
import { openMemoFromChat } from "./openMemoFrom";
import { followMovedMemo, useMemoActions } from "./useMemoActions";

/**
 * 入力欄の上の「メモ」（指示の履歴・子チャットと同じピルの列）。押すとメモのフォルダの木（メモのタブと同じ並び・同じ開いているフォルダ。
 * メモの入っていないフォルダは出さない）を出し、メモの行を押すと設定の開き方（右の欄 / 別ウィンドウ）で開く。
 * 行の右のボタンで、メモを開かずにこのチャットの入力欄に添付する・設定によらずその場所に開ける。一覧の上で、行を押したときの開き方（設定）を変えられ、
 * 右端の「フォルダをすべて開く / すべて閉じる」で木のフォルダをまとめて開閉する（利用者の依頼）。開閉はプロジェクトごとに 1 つ（memoOpenFolders）なので、
 * 同じプロジェクトのどのチャットのピルでも、メモのタブの木でも同じになる
 * 行をドラッグしてフォルダ（一覧の空いている所なら直下）へ落とすと動かす（メモのタブの木と同じ）。
 * プロジェクトにメモがなければ出さない。
 * 送る前のチャット（新しいチャット・新しい子チャット）では chatId が null で、「このチャットに添付」は onAttach でその入力欄に足し、開く場所はチャットのないときの決まり（openMemoFromChat）
 */
export function MemoChip({ projectId, chatId, onAttach }: { projectId: number; chatId: number | null; onAttach?: (path: string) => void }) {
  const list = useMemoList(projectId);
  const popover = usePopover();
  const mainChat = useMainChat();
  const [openIn, setOpenIn] = useSetting(MEMO_OPEN_IN);
  const tree = useMemo(() => buildMemoFileTree(list.data?.entries ?? []), [list.data]);
  // 開いているフォルダは、メモのタブの木と同じものを覚える（どちらで開け閉めしても、もう一方も同じになる）
  const [openList, setOpenList] = useSetting(memoOpenFolders(projectId));
  const openFolders = useMemo(() => new Set(openList), [openList]);
  // ドラッグを重ねている落とす先のフォルダ（"" は直下 = 一覧ごと示す。null は重ねていない）
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 動かすのはメモのタブと同じ操作（開いているメモの書きかけは動かす前に聞き、メモのタブで選んでいるメモ・開いているフォルダを付け替える）
  const actions = useMemoActions(projectId, {
    beforeChange: (path) => confirmLeaveMemosUnder(projectId, path),
    onMoved: (from, to) => followMovedMemo(projectId, from, to),
  });
  const dropInto = (path: string, folder: string) => void actions.moveInto(path, folder);
  // 木のフォルダ（メモの入ったものだけ）。すべて開く・すべて閉じるに使う
  const dirs = useMemo(() => folderPaths(tree), [tree]);
  if (tree.length === 0) return null;
  const allOpen = dirs.every((d) => openFolders.has(d));
  const anyOpen = dirs.some((d) => openFolders.has(d));
  const toggleFolder = (path: string) => setOpenList(openFolders.has(path) ? openList.filter((p) => p !== path) : [...openList, path]);
  // 別ウィンドウは Mac のアプリだけ
  const places = canPopout() ? (["side", "window"] as const) : (["side"] as const);
  const open = (path: string, place?: "side" | "window") => {
    popover.close();
    // 右の欄・別ウィンドウの中（メモのタブの中のメモのチャットなど）では、その右の欄を持つチャットの右の欄に新しいタブで開く
    // （前はメモのチャット自身の右の欄を探し、メモのチャットをチャットのパネルに開いていた）
    openMemoFromChat({ projectId, path, chatId: mainChat ?? chatId, place });
  };
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          <StickyNote size={14} className="chip-icon" aria-hidden />
          <ChipWord>メモ</ChipWord>
        </>
      }
      title="このプロジェクトのメモ（メモのタブと同じフォルダの木。行をドラッグしてフォルダへ動かせる）"
      label="メモ"
      className="memo-chip-popover"
    >
      {(places.length > 1 || dirs.length > 0) && (
        <div className="memo-chip-head">
          {places.length > 1 && <DefaultOpenPlace places={places} value={openIn} onChange={setOpenIn} />}
          {dirs.length > 0 && (
            <span className="memo-chip-folds">
              <IconButton
                type="button"
                icon={ChevronsUpDown}
                size={14}
                label="フォルダをすべて開く"
                disabled={allOpen}
                onClick={() => setOpenList([...new Set([...openList, ...dirs])])}
              />
              {/* メモのタブの「フォルダをすべて閉じる」と同じく、メモのタブの木だけにあるフォルダ（メモの入っていないもの）も閉じる */}
              <IconButton type="button" icon={ChevronsDownUp} size={14} label="フォルダをすべて閉じる" disabled={!anyOpen} onClick={() => setOpenList([])} />
            </span>
          )}
        </div>
      )}
      {/* 一覧の空いている所へ落とすと、いちばん上（直下）へ動かす */}
      <div className={cx("memo-chip-list", dropTarget === "" && "drop-target")} {...memoListDropProps({ onDropInto: dropInto, onDropTarget: setDropTarget })}>
      <MemoChipTree
        nodes={tree}
        open={openFolders}
        onToggle={toggleFolder}
        onExpand={(path) => !openFolders.has(path) && setOpenList([...openList, path])}
        onDropInto={dropInto}
        dropTarget={dropTarget}
        onDropTarget={setDropTarget}
        onOpen={open}
        onAttach={(path) => {
          popover.close();
          if (chatId !== null) attachMemoToChat(chatId, path);
          else onAttach?.(path);
        }}
        places={places}
      />
      </div>
      <button
        type="button"
        className="memo-chip-row more"
        onClick={() => {
          popover.close();
          openMemo(projectId);
        }}
      >
        メモのタブを開く
      </button>
    </ComposerChip>
  );
}
