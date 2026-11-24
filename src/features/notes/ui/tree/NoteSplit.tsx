import "./NoteTab.css";
import type { ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { ListRail } from "@/foundation/ui/kit/ListRail";
import { SearchField } from "@/foundation/ui/kit/SearchField";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { filesSettings } from "@/features/files/ui";
import { storage } from "@/features/notes/ui/storage";
import { NoteListHead } from "./NoteListHead";

/**
 * ノートの一覧と開いたノートの左右の枠（ノートのタブ・右サイドバーのノート・全ノートの画面で共通）: 左に見出し（取り直し・隠す）・名前で探す欄・欄の並び（children）、
 * 右に開いたノート（main）。左の一覧は隠せる（隠している間は左端の細い帯 ListRail に「一覧を表示」。どの画面でも同じ覚え）。幅はエディタ・履歴タブと同じ幅を覚える
 */
export function NoteSplit({
  refreshing,
  onRefresh,
  query,
  onQuery,
  main,
  children,
}: {
  refreshing: boolean;
  /** すべての欄を取り直す */
  onRefresh: () => void;
  query: string;
  onQuery: (query: string) => void;
  main: ReactNode;
  children: ReactNode;
}) {
  const [listHidden, setListHidden] = useSetting(storage.settings.listHidden);
  // hook が返した ref は分けて受ける（まとめた物から読むと、描く中で ref を読むとみなされる）
  const { paneRef, ...width } = useDragSize({ setting: filesSettings.listWidth, min: 200, keep: 320 });
  return (
    <div className={cx("changes", "note-tab", width.resizing && "resizing")}>
      {listHidden ? (
        // 一覧を隠している間は、左端の細い帯に戻すボタンだけを置く（ノートを開いていなくても戻せるように）
        <ListRail label="ノートの一覧を表示" onShow={() => setListHidden(false)} />
      ) : (
        <>
          <aside ref={paneRef} className={cx("changes-list", "note-list")} style={{ width: width.size }} aria-label="ノート">
            <NoteListHead refreshing={refreshing} onRefresh={onRefresh} onHide={() => setListHidden(true)} />
            <SearchField className="note-search" value={query} onChange={onQuery} placeholder="ノートを名前で探す" label="ノートを名前で探す" />
            {/* 見出しと探す欄は残し、欄だけを流す */}
            <div className="changes-scroll note-sections">{children}</div>
          </aside>
          <div className="pane-resizer" aria-label="一覧の幅を変える" {...width.handle} />
        </>
      )}
      <div className="changes-diff note-main">{main}</div>
    </div>
  );
}
