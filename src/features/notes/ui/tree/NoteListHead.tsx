import { cx } from "@/foundation/ui/lib/cx";
import { RefreshButton } from "@/foundation/ui/kit/IconButton";
import { ListHideButton } from "@/foundation/ui/kit/ListRail";

/**
 * ノートのタブの左の一覧のいちばん上の見出し（題名「ノート」・すべての欄の取り直し・一覧を隠す）。作る・整理するなどの操作は欄ごとの見出し（NoteSectionTools）にある
 */
export function NoteListHead({ refreshing, onRefresh, onHide }: { refreshing: boolean; onRefresh: () => void; onHide: () => void }) {
  return (
    <header className={cx("changes-head bar", "note-list-head")}>
      <span className="changes-branch">ノート</span>
      <span className="spacer" />
      <RefreshButton label="ノートの一覧を取り直す" busy={refreshing} onClick={onRefresh} />
      <ListHideButton label="ノートの一覧を隠す" onHide={onHide} />
    </header>
  );
}
