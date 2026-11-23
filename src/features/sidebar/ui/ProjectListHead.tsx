import "./ProjectListHead.css";
import { ChevronsDownUp, ChevronsUpDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { NamedViewTabs } from "@/features/chatList/ui";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { Popover } from "@/foundation/ui/kit/Popover";
import { createCell, useCell } from "@/foundation/ui/store/cell";
import { SidebarViewTuner } from "./SidebarViewTuner";
import { TagFilterRow } from "./TagFilterRow";
import type { ProjectNavController } from "./useProjectNav";
import { useSidebarViews } from "./useSidebarViews";
import { sameSidebarViewState, SIDEBAR_REMOVE_NOTE } from "./viewFields";

/**
 * ⚙ の窓（サイドバーの見え方）を開いているか。見出しは並べ方（縦並び・スライド）ごとに別の部品の中に描くので、
 * 窓の中で並べ方を変えて見出しが作り直されても、開いたままにする（窓の中でいろいろ変えて、終わったら × で閉じる）
 */
const tunerOpenCell = createCell(false);

/** ドラッグで運ぶビューの種類（ほかのドラッグと見分ける） */
const VIEW_DRAG_TYPE = "application/x-kickoff-sidebar-view";

/**
 * プロジェクト一覧の上の見出し（縦の幅を取らないよう、ビューのタブ 1 行）。
 * 左からビューのタブ（押すとその見え方を当てる。入らない分は ▾ のメニューに。右クリックで名前の変更・上書き・削除、ドラッグで並べ替え（▾ のメニューの中・タブの行との間も））、
 * すべて閉じる / 開く、⚙（いまの 3 行を窓で出して細かく変える・ビューに残す）。要対応の数は出さない（数は一覧の「要対応」の見出しと ⚙ の窓の「要対応」の行にある）。
 * その下に、タグがあるときだけタグの絞り込みの行（その場の絞り込みなのでビューに入れない）
 */
export function ProjectListHead({ nav }: { nav: ProjectNavController }) {
  const { fold } = nav;
  const views = useSidebarViews();
  const tunerOpen = useCell(tunerOpenCell);
  const tunerAnchor = useRef<HTMLButtonElement>(null);
  const closeTuner = () => tunerOpenCell.set(false);

  // まだ一度もビューを選んでいなければ、最初のビュー（初めは標準）を当てて選んだ状態にする
  useEffect(() => {
    if (!views.neverSelected) return;
    const first = views.views[0];
    if (first) views.apply(first);
    // 初めて開いたときだけ
  }, [views.neverSelected]);

  return (
    <div className="sidebar-head">
      <div className="sidebar-view-bar">
        <NamedViewTabs
          views={views.views}
          activeId={views.active?.id}
          modifiedId={views.active ? undefined : views.selected?.id}
          look="sidebar-view"
          listClass="sidebar-view-tabs"
          label="サイドバーのビュー"
          dragType={VIEW_DRAG_TYPE}
          overflow
          tabTitle={(modified) =>
            modified
              ? "このビューから見え方を変えています（押すとビューの見え方に戻す。⚙ で上書きできる）"
              : "押すとこのビューの見え方にする（ダブルクリック・Enter・右クリックで名前の変更。ドラッグで並べ替え・右クリックで上書き・削除）"
          }
          texts={{ overwrite: "いまの見え方で上書き", same: "いまの見え方と同じです", removeNote: SIDEBAR_REMOVE_NOTE }}
          same={(view) => sameSidebarViewState(view.state, views.current)}
          onApply={views.apply}
          onRename={views.rename}
          onOverwrite={views.overwrite}
          onRemove={views.remove}
          onMove={views.move}
        />
        {/* 開いているものがあれば閉じる、すべて閉じていれば開く（すべてのプロジェクトと中のまとまり） */}
        <IconButton
          icon={fold.allCollapsed ? ChevronsUpDown : ChevronsDownUp}
          label={fold.allCollapsed ? "すべてのプロジェクトを開く" : "すべてのプロジェクトを閉じる"}
          title={fold.allCollapsed ? "すべてのプロジェクトと中のまとまりを開く" : "すべてのプロジェクトと中のまとまりを閉じる"}
          iconSize={14}
          className="sidebar-view-icon"
          onClick={() => fold.set(!fold.allCollapsed)}
        />
        <IconButton
          ref={tunerAnchor}
          icon={SlidersHorizontal}
          label="見え方を調整"
          title="プロジェクト・チャット・要対応の見え方を細かく変える（変えたものはビューに上書き・今のビューを新規保存できる）"
          iconSize={14}
          className="sidebar-view-icon" active={tunerOpen}
          aria-expanded={tunerOpen}
          onClick={() => tunerOpenCell.set(!tunerOpen)}
        />
      </div>
      {tunerOpen && (
        <Popover anchor={tunerAnchor} align="end" label="サイドバーの見え方" title="サイドバーの見え方" className="sidebar-view-popover" onClose={closeTuner}>
          <SidebarViewTuner views={views} archivedCount={nav.archived.length} waitingCount={nav.waitingCount} />
        </Popover>
      )}
      {/* タグがあるときだけ、タグでの絞り込みの行（押すたびに付け外し） */}
      <TagFilterRow />
    </div>
  );
}
