import { List, Rows2, Rows4, SquareKanban, Table2, TextSearch } from "lucide-react";
import type { ReactNode } from "react";
import { openContentSearch } from "@/features/chat/chatSearch";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { BOARD_LIST_COMPACT, BOARD_SPLIT, BOARD_VIEW } from "@/lib/storageKeys";
import { SearchField } from "@/ui/SearchField";
import { Segmented } from "@/ui/Segmented";
import { PanelToggle } from "@/features/panel/board/PanelToggle";
import type { PanelController } from "@/features/panel/usePanel";
import { IconButton } from "@/ui/IconButton";

/** 表示の種類: ボード（列を横に並べる）・リスト（まとまりを縦に並べる）・表（チャット 1 つが 1 行。見出しで並べ替える） */
export type BoardView = SettingValue<typeof BOARD_VIEW>;

/**
 * 表示の種類と、段（スイムレーン）に分けるか（列を状態で分けるカンバン・グループのボード・全プロジェクトのボードで共通。列の分け方を切り替えてもそのまま）。
 * 段の分け方（グループ・作業場所・プロジェクト）はボードとリストで共通（useKanbanLanes）で、表示を切り替えても段に分けたまま
 */
export function useBoardView() {
  const [view, setView] = useSetting(BOARD_VIEW);
  const [split, setSplit] = useSetting(BOARD_SPLIT);
  return { view, split, setView, setSplit };
}

/**
 * リスト表示の行を 1 行にまとめるか（1 行 = 名前の後ろに作業場所・状態を並べる / 2 行 = 名前の下に並べる。初めは 2 行）。
 * すべてのボード（カンバン・グループ・全プロジェクト）で共通で、見出しの切り替えと行の描き方（useBoardCards）でそろう
 */
export function useBoardListCompact() {
  return useSetting(BOARD_LIST_COMPACT);
}

interface Props {
  /** 見出し（アイコン・名前・件数）。プロジェクトのタブでは、タブの名前と重なるので出さない（全プロジェクトの画面だけ渡す） */
  heading?: { icon: ReactNode; title: string; count: number };
  query: string;
  onQuery: (query: string) => void;
  /** 探す・絞り込むのまとまりで、検索欄の後ろに置くもの（アーカイブ・作業場所の表示） */
  filters?: ReactNode;
  /** 整えるのまとまり（表示と検索の間）。ボードの形を変えるもの（グループを作成） */
  organize?: ReactNode;
  /** いちばん左に置く主な操作（新規）。見出しがあれば、その後ろ */
  primary?: ReactNode;
  view: BoardView;
  onView: (view: BoardView) => void;
  /** 表示のまとまりで、表示の切り替え（とリストの行）の後ろ・列の分け方の前に置くもの（段の分け方 LaneSelect） */
  viewOptions?: ReactNode;
  /** 表示のまとまりで、段の分け方の後ろに置く、列の分け方の切り替え（プロジェクトのボード: 状態 / グループ、全プロジェクトのボード: 状態 / グループ / 分けない） */
  columns?: ReactNode;
  /** 表示のまとまりのいちばん後ろに置く、並び順（と表の列）のボタン */
  sortTools?: ReactNode;
  /** 右のパネル（右端に開閉のボタンを置く。プロジェクトのボードだけ。全プロジェクトのボードはチャットをそのプロジェクトで開くので持たない） */
  panel?: PanelController;
}

/**
 * ボード（全プロジェクトのカンバン・プロジェクトのカンバン・グループ）の見出し。道具を概念ごとにまとめて並べる:
 * 左に 主な操作（新規） / 表示（ボード・リスト） / 整える（グループを作成） / 探す・絞り込む（検索・絞り込み・アーカイブの表示）、
 * 右に パネルの開閉（右のパネルのあるプロジェクトのボードだけ。ブラウザ・ターミナルは、パネルのタブの列の＋から開く）
 */
export function BoardHeader({ heading, query, onQuery, filters, organize, primary, view, onView, viewOptions, columns, sortTools, panel }: Props) {
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
        {/* 表示: 新規のすぐ右に ボード / リスト / 表（とリストの行）、続けて段の分け方・列の分け方・並び順（と表の列） */}
        <div className="board-tool-group" role="group" aria-label="表示">
          <Segmented
            className="view-toggle"
            label="表示の切り替え"
            value={view}
            onChange={onView}
            options={[
              { value: "board", label: "ボード", icon: SquareKanban },
              { value: "list", label: "リスト", icon: List },
              { value: "table", label: "表", icon: Table2 },
            ]}
          />
          {view === "list" && <ListRowsToggle />}
          {viewOptions}
          {columns}
          {sortTools}
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
      {panel && (
        <div className="board-tools board-tools-end">
          <div className="board-tool-group">
            <PanelToggle panel={panel} />
          </div>
        </div>
      )}
    </div>
  );
}

/** リスト表示の行の高さ（1 行 / 2 行）の切り替え。リストのときだけ、表示の切り替えのすぐ後ろに置く */
function ListRowsToggle() {
  const [compact, setCompact] = useBoardListCompact();
  return (
    <Segmented
      className="view-toggle"
      label="リストの行"
      value={compact ? "1" : "2"}
      onChange={(v) => setCompact(v === "1")}
      options={[
        { value: "2", label: "2 行（名前の下に作業場所・状態）", icon: Rows2, iconOnly: true },
        { value: "1", label: "1 行（名前の後ろに作業場所・状態）", icon: Rows4, iconOnly: true },
      ]}
    />
  );
}

/** チャットを名前で絞り込む検索欄（⌘F でここへ。Esc で消す）。横のボタンで文言の全文検索（⌘⇧F）を開く */
function BoardSearch({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  return (
    <SearchField className="board-search" value={query} onChange={onChange} placeholder="チャット名で検索（⌘F）" label="このボードのチャットを名前で検索">
      {/* チャットの中の文言を探すときは、全文検索のパネルへ */}
      <IconButton icon={TextSearch} size={13} className="chat-search-content" label="チャットの中の文言を検索" keys="⌘⇧F" onClick={openContentSearch} />
    </SearchField>
  );
}
