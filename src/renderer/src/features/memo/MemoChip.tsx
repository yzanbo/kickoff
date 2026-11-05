import { StickyNote } from "lucide-react";
import { useMemo } from "react";
import { canPopout } from "@/app/popout";
import { openMemo } from "@/app/router";
import { useSetting } from "@/hooks/useSetting";
import { MEMO_OPEN_IN } from "@/lib/storageKeys";
import { useMemoList } from "@/stores/memos";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { DefaultOpenPlace, OpenPlaceButtons } from "@/features/chat/composer/OpenPlaceControls";
import { RECENT_MEMOS } from "./MemoMenuItems";
import { memoTitle, parentOf, recentMemos } from "./memoPaths";
import { openMemoFromChat } from "./openMemoFrom";

/**
 * 入力欄の上の「メモ」（指示の履歴・子チャットと同じピルの列）。押すと最近変えたメモの一覧を出し、行を押すと設定の開き方（右の欄 / 別ウィンドウ）で開く。
 * 行の右のボタンで、設定によらずその場所に開ける。一覧の上で、行を押したときの開き方（設定）を変えられる。プロジェクトにメモがなければ出さない
 */
export function MemoChip({ projectId, chatId }: { projectId: number; chatId: number }) {
  const list = useMemoList(projectId);
  const popover = usePopover();
  const [openIn, setOpenIn] = useSetting(MEMO_OPEN_IN);
  const recent = useMemo(() => recentMemos(list.data?.entries ?? [], RECENT_MEMOS), [list.data]);
  if (recent.length === 0) return null;
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
      title="このプロジェクトのメモ（最近変えた順）"
      label="メモ"
      className="memo-chip-popover"
    >
      {places.length > 1 && <DefaultOpenPlace places={places} value={openIn} onChange={setOpenIn} />}
      {recent.map((e) => (
        <div
          key={e.path}
          role="button"
          tabIndex={0}
          className="memo-chip-row"
          title={e.path}
          onClick={() => open(e.path)}
          onKeyDown={(k) => k.key === "Enter" && open(e.path)}
        >
          <StickyNote size={12} aria-hidden />
          <span className="memo-chip-title">{memoTitle(e.path)}</span>
          {parentOf(e.path) && <span className="memo-chip-folder">{parentOf(e.path)}</span>}
          <OpenPlaceButtons places={places} onOpen={(place) => open(e.path, place === "window" ? "window" : "side")} />
        </div>
      ))}
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
