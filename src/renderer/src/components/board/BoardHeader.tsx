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
  /** 探す・絞り込むのまとまりで、検索欄の後ろに置くもの（プロジェクト・セクション・アーカイブの表示） */
  filters?: ReactNode;
  /** 整えるのまとまり（表示と検索の間）。ボードの形を変えるもの（グループを作成） */
  organize?: ReactNode;
  /** 作る・開くのまとまりで、「ブラウザ」の前に置くもの（新規・グループを作成） */
  actions?: ReactNode;
  view: BoardView;
  onView: (view: BoardView) => void;
  panel: SidePanelController;
}

/**
 * ボード（全プロジェクトのカンバン・プロジェクトのカンバン・グループ）の見出し。道具を概念ごとにまとめて並べる:
 * 左（名前の右）に 表示（ボード・リスト） / 整える（グループを作成） / 探す・絞り込む（検索・絞り込み・アーカイブの表示）、
 * 右に 作る・開く（新規・ブラウザ。右のパネルに新しいタブを開く） / パネルの開閉
 */
export function BoardHeader({ icon, title, count, query, onQuery, filters, organize, actions, view, onView, panel }: Props) {
  return (
    <div className="board-header">
      {icon}
      <span className="board-title">{title}</span>
      <span className="muted small">{count} 件</span>
      {/* 道具のまとまり（狭いときは、まとまりごと次の行へ） */}
      <div className="board-tools">
        <div className="board-tool-group" role="group" aria-label="表示">
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
        </div>
        {organize && (
          <div className="board-tool-group" role="group" aria-label="整える">
            {organize}
          </div>
        )}
        <div className="board-tool-group" role="group" aria-label="探す・絞り込む">
          <BoardSearch query={query} onChange={onQuery} />
          {filters}
        </div>
      </div>
      <div className="board-tools board-tools-end">
        <div className="board-tool-group" role="group" aria-label="作る・開く">
          {actions}
          <button className="btn btn-sm" onClick={() => panel.openBrowser()} title="開発中のアプリやドキュメントを右側で開く">
            <Globe size={13} /> <span className="btn-label">ブラウザ</span>
          </button>
        </div>
        <div className="board-tool-group">
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
