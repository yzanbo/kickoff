import { Globe, List, Search, SquareKanban, TextSearch, X } from "lucide-react";
import type { ReactNode } from "react";
import { openContentSearch } from "../../chatSearch";
import { PanelToggle, type SidePanelController } from "../SidePanel";

export type BoardView = "board" | "list";

interface Props {
  icon: ReactNode;
  title: string;
  count: number;
  query: string;
  onQuery: (query: string) => void;
  /** 検索欄の後ろ・「ブラウザ」の前（絞り込みなど） */
  filters?: ReactNode;
  /** 「ブラウザ」の後ろ（新規など） */
  actions?: ReactNode;
  view: BoardView;
  onView: (view: BoardView) => void;
  /** 「ボード／リスト」とパネルの開閉の間（アーカイブの表示など） */
  extra?: ReactNode;
  panel: SidePanelController;
}

/** ボード（カンバン・グループ）の見出し: 名前・件数・検索・絞り込み・操作・表示の切り替え・パネルの開閉 */
export function BoardHeader({ icon, title, count, query, onQuery, filters, actions, view, onView, extra, panel }: Props) {
  return (
    <div className="board-header">
      {icon}
      <span className="board-title">{title}</span>
      <span className="muted small">{count} 件</span>
      {/* 操作のまとまり（狭いときは、まとめて次の行の右側へ） */}
      <div className="board-tools">
        <BoardSearch query={query} onChange={onQuery} />
        {filters}
        <button className="btn btn-sm" onClick={panel.openBrowser} title="開発中のアプリやドキュメントを右側で開く">
          <Globe size={13} /> <span className="btn-label">ブラウザ</span>
        </button>
        {actions}
        <div className="board-tools-end">
          <div className="view-toggle" role="group" aria-label="表示の切り替え">
            <button className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => onView("board")}>
              <SquareKanban size={13} /> <span className="btn-label">ボード</span>
            </button>
            <button className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => onView("list")}>
              <List size={13} /> <span className="btn-label">リスト</span>
            </button>
          </div>
          {extra}
          <PanelToggle panel={panel} />
        </div>
      </div>
    </div>
  );
}

/** チャットを名前で絞り込む検索欄（⌘F でここへ。Esc で消す）。横のボタンで文言の全文検索（⌘⇧F）を開く */
function BoardSearch({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  return (
    <div className="chat-search board-search">
      <Search size={13} className="muted" aria-hidden />
      <input
        type="text"
        value={query}
        placeholder="チャット名で検索（⌘F）"
        aria-label="このボードのチャットを名前で検索"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            // パネルを閉じる Esc より先に、検索語を消す
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onChange("");
          }
        }}
      />
      {query && (
        <button className="chat-search-clear" aria-label="検索を解除" onClick={() => onChange("")}>
          <X size={12} />
        </button>
      )}
      {/* チャットの中の文言を探すときは、全文検索のパネルへ */}
      <button className="chat-search-content" title="チャットの中の文言を検索（⌘⇧F）" aria-label="チャットの中の文言を検索" onClick={openContentSearch}>
        <TextSearch size={13} />
      </button>
    </div>
  );
}
