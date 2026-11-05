import { StickyNote } from "lucide-react";
import { useMemo } from "react";
import { openMemo } from "@/app/router";
import { useMemoList } from "@/stores/memos";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { RECENT_MEMOS } from "./MemoMenuItems";
import { memoTitle, parentOf, recentMemos } from "./memoPaths";
import { openMemoFromChat } from "./openMemoFrom";

/**
 * 入力欄の上の「メモ」（指示の履歴・子チャットと同じピルの列）。押すと最近変えたメモの一覧を出し、行を押すと設定の開き方（右の欄 / 別ウィンドウ）で開く。
 * プロジェクトにメモがなければ出さない
 */
export function MemoChip({ projectId, chatId }: { projectId: number; chatId: number }) {
  const list = useMemoList(projectId);
  const popover = usePopover();
  const recent = useMemo(() => recentMemos(list.data?.entries ?? [], RECENT_MEMOS), [list.data]);
  if (recent.length === 0) return null;
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          <StickyNote size={14} className="chip-icon" aria-hidden />
          メモ
        </>
      }
      title="このプロジェクトのメモ（最近変えた順。行を押すと右の欄で開く。開き方は設定の「表示」）"
      label="メモ"
      className="memo-chip-popover"
    >
      {recent.map((e) => (
        <button
          key={e.path}
          type="button"
          className="memo-chip-row"
          title={e.path}
          onClick={() => {
            popover.close();
            openMemoFromChat({ projectId, path: e.path, chatId });
          }}
        >
          <StickyNote size={12} aria-hidden />
          <span className="memo-chip-title">{memoTitle(e.path)}</span>
          {parentOf(e.path) && <span className="memo-chip-folder">{parentOf(e.path)}</span>}
        </button>
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
