import { Globe, List, SquareKanban, TextSearch } from "lucide-react";
import type { ReactNode } from "react";
import { openContentSearch } from "../../chatSearch";
import { SearchField } from "../SearchField";
import { Segmented } from "../Segmented";
import { PanelToggle } from "../sidePanel/SidePanel";
import type { SidePanelController } from "../sidePanel/useSidePanel";

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
          <Segmented
            className="view-toggle"
            label="表示の切り替え"
            value={view}
            onChange={onView}
            options={[
              { value: "board", label: "ボード", icon: SquareKanban },
              { value: "list", label: "リスト", icon: List },
            ]}
          />
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
    <SearchField className="board-search" value={query} onChange={onChange} placeholder="チャット名で検索（⌘F）" label="このボードのチャットを名前で検索">
      {/* チャットの中の文言を探すときは、全文検索のパネルへ */}
      <button className="chat-search-content" title="チャットの中の文言を検索（⌘⇧F）" aria-label="チャットの中の文言を検索" onClick={openContentSearch}>
        <TextSearch size={13} />
      </button>
    </SearchField>
  );
}
