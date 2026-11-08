import { List, MessagesSquare, SquareKanban, TextSearch } from "lucide-react";
import type { ReactNode } from "react";
import { openContentSearch } from "@/features/chat/chatSearch";
import { useSetting } from "@/hooks/useSetting";
import type { SettingValue } from "@/lib/storage";
import { BOARD_SPLIT, BOARD_VIEW } from "@/lib/storageKeys";
import { SearchField } from "@/ui/SearchField";
import { Segmented } from "@/ui/Segmented";
import { PanelToggle } from "@/features/panel/board/PanelToggle";
import type { PanelController } from "@/features/panel/usePanel";
import { IconButton } from "@/ui/IconButton";

/** 表示の種類: ボード（列を横に並べる）・リスト（まとまりを縦に並べる）・表（チャット 1 つが 1 行。見出しで並べ替える） */
export type BoardView = SettingValue<typeof BOARD_VIEW>;

/**
 * 表示の種類と、段（スイムレーン）に分けるか（プロジェクトのボード・全プロジェクトのボードで共通。全プロジェクトのボードで列の分け方を切り替えてもそのまま）。
 * 段の分け方（グループ・作業場所・プロジェクト）はボードとリストで共通（useKanbanLanes）で、表示を切り替えても段に分けたまま
 */
export function useBoardView() {
  const [view, setView] = useSetting(BOARD_VIEW);
  const [split, setSplit] = useSetting(BOARD_SPLIT);
  return { view, split, setView, setSplit };
}

interface Props {
  query: string;
  onQuery: (query: string) => void;
  /** 探す・絞り込むのまとまりで、検索欄の後ろに置くもの（アーカイブ・作業場所の表示） */
  filters?: ReactNode;
  /** 整えるのまとまり（表示と検索の間）。ボードの形を変えるもの（グループを作成） */
  organize?: ReactNode;
  /** 表示（feed は全プロジェクトのボードだけ。feed を渡したときだけ選択肢に出す） */
  view: BoardView | "feed";
  onView: (view: BoardView | "feed") => void;
  /** 表示の選択肢に「フィード」を出す（全プロジェクトのボード） */
  feed?: boolean;
  /** 表示のまとまりで、列の分け方の後ろに置くもの（段の分け方 LaneSelect） */
  viewOptions?: ReactNode;
  /** 表示のまとまりで、ボード / リストのすぐ右に置く、列の分け方の切り替え（グループ | 状態。利用者の依頼で、前は段の分け方の後ろだった） */
  columns?: ReactNode;
  /** 表示のまとまりのいちばん後ろに置く、並び順（と表の列）のボタン */
  sortTools?: ReactNode;
  /** 右のパネル（右端に開閉のボタンを置く。プロジェクトのボードだけ。全プロジェクトのボードはチャットをそのプロジェクトで開くので持たない） */
  panel?: PanelController;
}

/**
 * ボード（全プロジェクトのカンバン・プロジェクトのカンバン）の見出し。道具を概念ごとにまとめて並べる:
 * 左に 表示（ボード・リスト） / 整える（グループを作成） / 探す・絞り込む（検索・絞り込み・アーカイブの表示）、
 * 右に パネルの開閉（右のパネルのあるプロジェクトのボードだけ。ブラウザ・ターミナルは、パネルのタブの列の＋から開く）
 */
export function BoardHeader({ query, onQuery, filters, organize, view, onView, feed = false, viewOptions, columns, sortTools, panel }: Props) {
  return (
    <div className="board-header">
      {/* 道具のまとまり（狭いときは、まとまりごと次の行へ） */}
      <div className="board-tools">
        {/* 表示: いちばん左に ボード / リスト、続けて列の分け方・段の分け方・並び順 */}
        <div className="board-tool-group" role="group" aria-label="表示">
          <Segmented
            className="view-toggle"
            label="表示の切り替え"
            value={view}
            onChange={onView}
            options={[
              { value: "board", label: "ボード", icon: SquareKanban },
              { value: "list", label: "リスト", icon: List },
              ...(feed ? [{ value: "feed" as const, label: "フィード", icon: MessagesSquare, tip: "フィード（チャットごとの最新の返答を新しい順に）" }] : []),
            ]}
          />
          {columns}
          {viewOptions}
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

/** チャットを名前で絞り込む検索欄（⌘F でここへ。Esc で消す）。横のボタンで文言の全文検索（⌘⇧F）を開く */
function BoardSearch({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  return (
    <SearchField className="board-search" value={query} onChange={onChange} placeholder="チャット名で検索（⌘F）" label="このボードのチャットを名前で検索">
      {/* チャットの中の文言を探すときは、全文検索のパネルへ */}
      <IconButton icon={TextSearch} size={13} className="chat-search-content" label="チャットの中の文言を検索" keys="⌘⇧F" onClick={openContentSearch} />
    </SearchField>
  );
}
