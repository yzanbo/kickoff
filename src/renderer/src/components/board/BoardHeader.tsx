import { List, Rows3, SquareKanban, TextSearch } from "lucide-react";
import type { ReactNode } from "react";
import { openContentSearch } from "../../chatSearch";
import { SearchField } from "../SearchField";
import { Segmented } from "../Segmented";
import { PanelToggle } from "../sidePanel/SidePanel";
import type { SidePanelController } from "../sidePanel/useSidePanel";

/** 表示の種類: ボード（状態の列）・リスト・スイムレーン（段ごとに状態の列。カンバンだけ） */
export type BoardView = "board" | "list" | "lanes";

interface Props {
  /** 見出し（アイコン・名前・件数）。プロジェクトのタブでは、タブの名前と重なるので出さない（全プロジェクトの画面だけ渡す） */
  heading?: { icon: ReactNode; title: string; count: number };
  query: string;
  onQuery: (query: string) => void;
  /** 探す・絞り込むのまとまりで、検索欄の後ろに置くもの（プロジェクト・セクション・アーカイブの表示） */
  filters?: ReactNode;
  /** 整えるのまとまり（表示と検索の間）。ボードの形を変えるもの（グループを作成） */
  organize?: ReactNode;
  /** いちばん左に置く主な操作（新規）。見出しがあれば、その後ろ */
  primary?: ReactNode;
  view: BoardView;
  onView: (view: BoardView) => void;
  /** スイムレーンも選べるか（カンバンだけ） */
  lanesView?: boolean;
  /** 表示のまとまりで、表示の切り替えの後ろに置くもの（スイムレーンの段の分け方） */
  viewOptions?: ReactNode;
  panel: SidePanelController;
}

/**
 * ボード（全プロジェクトのカンバン・プロジェクトのカンバン・グループ）の見出し。道具を概念ごとにまとめて並べる:
 * 左に 主な操作（新規） / 表示（ボード・リスト） / 整える（グループを作成） / 探す・絞り込む（検索・絞り込み・アーカイブの表示）、
 * 右に パネルの開閉（ブラウザ・ターミナルは、パネルのタブの列の＋から開く）
 */
export function BoardHeader({ heading, query, onQuery, filters, organize, primary, view, onView, lanesView = false, viewOptions, panel }: Props) {
  return (
    <div className="board-header">
      {heading && (
        <>
          {heading.icon}
          <span className="board-title">{heading.title}</span>
          <span className="muted small">{heading.count} 件</span>
        </>
      )}
      {/* 道具のまとまり（狭いときは、まとまりごと次の行へ） */}
      <div className="board-tools">
        {primary && <div className="board-tool-group">{primary}</div>}
        <div className="board-tool-group" role="group" aria-label="表示">
          <Segmented
            className="view-toggle"
            label="表示の切り替え"
            value={view}
            onChange={onView}
            options={[
              { value: "board", label: "ボード", icon: SquareKanban },
              { value: "list", label: "リスト", icon: List },
              ...(lanesView ? [{ value: "lanes" as const, label: "スイムレーン", icon: Rows3 }] : []),
            ]}
          />
          {viewOptions}
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
