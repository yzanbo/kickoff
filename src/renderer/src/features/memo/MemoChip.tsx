import { StickyNote } from "lucide-react";
import { useMemo } from "react";
import { canPopout } from "@/app/popout";
import { openMemo } from "@/app/router";
import { useSetting } from "@/hooks/useSetting";
import { MEMO_OPEN_IN, memoOpenFolders } from "@/lib/storageKeys";
import { useMemoList } from "@/stores/memos";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { DefaultOpenPlace } from "@/features/chat/composer/OpenPlaceControls";
import { attachMemoToChat } from "./attachMemo";
import { MemoChipTree } from "./MemoChipTree";
import { buildMemoFileTree } from "./memoPaths";
import { openMemoFromChat } from "./openMemoFrom";

/**
 * 入力欄の上の「メモ」（指示の履歴・子チャットと同じピルの列）。押すとメモのフォルダの木（メモのタブと同じ並び・同じ開いているフォルダ。
 * メモの入っていないフォルダは出さない）を出し、メモの行を押すと設定の開き方（右の欄 / 別ウィンドウ）で開く。
 * 行の右のボタンで、メモを開かずにこのチャットの入力欄に添付する・設定によらずその場所に開ける。一覧の上で、行を押したときの開き方（設定）を変えられる。
 * プロジェクトにメモがなければ出さない
 */
export function MemoChip({ projectId, chatId }: { projectId: number; chatId: number }) {
  const list = useMemoList(projectId);
  const popover = usePopover();
  const [openIn, setOpenIn] = useSetting(MEMO_OPEN_IN);
  const tree = useMemo(() => buildMemoFileTree(list.data?.entries ?? []), [list.data]);
  // 開いているフォルダは、メモのタブの木と同じものを覚える（どちらで開け閉めしても、もう一方も同じになる）
  const [openList, setOpenList] = useSetting(memoOpenFolders(projectId));
  const openFolders = useMemo(() => new Set(openList), [openList]);
  if (tree.length === 0) return null;
  const toggleFolder = (path: string) => setOpenList(openFolders.has(path) ? openList.filter((p) => p !== path) : [...openList, path]);
  // 別ウィンドウは Mac のアプリだけ
  const places = canPopout() ? (["side", "window"] as const) : (["side"] as const);
  const open = (path: string, place?: "side" | "window") => {
    popover.close();
    openMemoFromChat({ projectId, path, chatId, place });
  };
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          <StickyNote size={14} className="chip-icon" aria-hidden />
          メモ
        </>
      }
      title="このプロジェクトのメモ（メモのタブと同じフォルダの木）"
      label="メモ"
      className="memo-chip-popover"
    >
      {places.length > 1 && <DefaultOpenPlace places={places} value={openIn} onChange={setOpenIn} />}
      <MemoChipTree
        nodes={tree}
        open={openFolders}
        onToggle={toggleFolder}
        onOpen={open}
        onAttach={(path) => {
          popover.close();
          attachMemoToChat(chatId, path);
        }}
        places={places}
      />
      <button
        type="button"
        className="memo-chip-row more"
        onClick={() => {
          popover.close();
          openMemo(projectId);
        }}
      >
        メモのタブで探す・作る
      </button>
    </ComposerChip>
  );
}
