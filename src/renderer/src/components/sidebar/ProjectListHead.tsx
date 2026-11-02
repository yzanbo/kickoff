import { Archive, ChevronsDownUp, ChevronsUpDown, GalleryHorizontal, Rows3 } from "lucide-react";
import { cx } from "../../cx";
import { IconButton } from "../IconButton";
import { Segmented } from "../Segmented";

/** slide: 1 プロジェクトずつ横にスライド / stack: すべてのプロジェクトを縦に並べる */
export type NavLayout = "slide" | "stack";

/**
 * プロジェクト一覧の上の見出しの行（VS Code のエクスプローラーの見出しと同じ形）。左に「プロジェクト」、右に表示方法の操作を常に出す:
 * すべて閉じる / 開く（縦並びのとき）・アーカイブしたプロジェクトを出すか（あるとき）・並べ方。
 * 下の行は主な操作（新しいプロジェクト・プロジェクトの丸）だけにして、狭くても折り返さないようにする
 */
export function ProjectListHead({
  layout,
  onLayout,
  fold,
  archivedCount,
  showArchived,
  onShowArchived,
}: {
  layout: NavLayout;
  onLayout: (layout: NavLayout) => void;
  /** 縦並びのとき: すべてのプロジェクトのチャット一覧をまとめて閉じる・開く */
  fold?: { allCollapsed: boolean; set: (collapsed: boolean) => void };
  /** しまった（アーカイブした）プロジェクトの数（0 なら切り替えを置かない） */
  archivedCount: number;
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
}) {
  return (
    <div className="project-list-head">
      <span className="project-list-title">プロジェクト</span>
      {/* 開いているものがあれば閉じる、すべて閉じていれば開く */}
      {fold && (
        <IconButton
          icon={fold.allCollapsed ? ChevronsUpDown : ChevronsDownUp}
          label={fold.allCollapsed ? "すべてのプロジェクトを開く" : "すべてのプロジェクトを閉じる"}
          title={fold.allCollapsed ? "すべて開く" : "すべて閉じる"}
          onClick={() => fold.set(!fold.allCollapsed)}
        />
      )}
      {archivedCount > 0 && (
        <IconButton
          icon={Archive}
          className={cx(showArchived && "active")}
          label={showArchived ? "アーカイブしたプロジェクトを隠す" : `アーカイブしたプロジェクトを表示（${archivedCount}）`}
          aria-pressed={showArchived}
          onClick={() => onShowArchived(!showArchived)}
        />
      )}
      <Segmented
        className="sidebar-layout-toggle"
        label="プロジェクトの並べ方"
        value={layout}
        onChange={onLayout}
        options={[
          { value: "slide", label: "1 プロジェクトずつ横にスライド", icon: GalleryHorizontal, iconOnly: true },
          { value: "stack", label: "すべてのプロジェクトを縦に並べる", icon: Rows3, iconOnly: true },
        ]}
      />
    </div>
  );
}
