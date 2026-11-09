import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Pencil, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import { isRenameKey } from "@/lib/keys";
import { viewNameTaken } from "@/lib/namedViews";
import { confirmDialog } from "@/ui/dialogs";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import { Popover } from "@/ui/Popover";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { useViewTabDrag } from "@/ui/useViewTabDrag";
import { sameSidebarViewState, type SidebarView } from "./sidebarViews";
import { SidebarViewTuner, type TunerProps } from "./SidebarViewTuner";
import { TagFilterRow } from "./TagFilterRow";
import { waitingAxes } from "./waitingAxes";
import { useSidebarViews, type SidebarViews } from "./useSidebarViews";

/**
 * ⚙ の窓（サイドバーの見え方）を開いているか。見出しは並べ方（縦並び・スライド）ごとに別の部品の中に描くので、
 * 窓の中で並べ方を変えて見出しが作り直されても、開いたままにする（利用者の依頼。窓の中でいろいろ変えて、終わったら × で閉じる）
 */
let tunerOpen = false;
const tunerListeners = new Set<() => void>();
function setTunerOpen(open: boolean) {
  if (tunerOpen === open) return;
  tunerOpen = open;
  for (const listener of tunerListeners) listener();
}
function useTunerOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      tunerListeners.add(listener);
      return () => void tunerListeners.delete(listener);
    },
    () => tunerOpen,
  );
}

interface Props extends TunerProps {
  /** すべてのプロジェクトのチャット一覧（と中のまとまり）をまとめて閉じる・開く（縦並び・横スライドのどちらでも） */
  fold: { allCollapsed: boolean; set: (collapsed: boolean) => void };
}

/**
 * プロジェクト一覧の上の見出し（利用者の依頼で、縦の幅を取っていた 3 行（プロジェクト・チャット・要対応のボタン）を、ビューのタブ 1 行にした）。
 * 左からビューのタブ（押すとその見え方を当てる。入らない分は ▾ のメニューに。右クリックで名前の変更・上書き・削除、ドラッグで並べ替え）、
 * すべて閉じる / 開く、要対応の数（一覧に要対応の数が出ていないときだけ）、⚙（いまの 3 行を窓で出して細かく変える・ビューに残す）。
 * その下に、タグがあるときだけタグの絞り込みの行（その場の絞り込みなのでビューに入れない）
 */
export function ProjectListHead({ fold, ...tuner }: Props) {
  const views = useSidebarViews();
  const tunerOpen = useTunerOpen();
  const tunerAnchor = useRef<HTMLButtonElement>(null);
  const closeTuner = () => setTunerOpen(false);
  const count = tuner.waiting.count;
  // 要対応の数は 1 か所だけに出す（利用者の依頼。前は要対応の入ったビューのタブごとに同じ数を出し、一覧の「要対応 n」とも重なっていた）。
  // 一覧の上・プロジェクト内にまとめているときは、そのまとまりの見出しに数があるので、見出しの行には出さない
  const listShowsCount = tuner.waiting.on && waitingAxes(tuner.waiting.view).scope !== "only";

  // まだ一度もビューを選んでいなければ、最初のビュー（初めはコンパクト）を当てて選んだ状態にする（利用者の依頼。前はいまの見え方に合うビューを選んでいて、初めの見え方の標準になった）
  useEffect(() => {
    if (!views.neverSelected) return;
    const first = views.views[0];
    if (first) views.apply(first);
    // 初めて開いたときだけ
  }, [views.neverSelected]);

  return (
    <div className="sidebar-head">
      <div className="sidebar-view-bar">
        <SidebarViewTabs views={views} />
        {/* 開いているものがあれば閉じる、すべて閉じていれば開く（すべてのプロジェクトと中のまとまり） */}
        <IconButton
          icon={fold.allCollapsed ? ChevronsUpDown : ChevronsDownUp}
          label={fold.allCollapsed ? "すべてのプロジェクトを開く" : "すべてのプロジェクトを閉じる"}
          title={fold.allCollapsed ? "すべてのプロジェクトと中のまとまりを開く" : "すべてのプロジェクトと中のまとまりを閉じる"}
          size={14}
          className="sidebar-view-icon"
          onClick={() => fold.set(!fold.allCollapsed)}
        />
        {!listShowsCount && count > 0 && (
          <span className="count-badge sidebar-view-count" title={`要対応のチャット ${count} 件`}>
            {count}
          </span>
        )}
        <IconButton
          ref={tunerAnchor}
          icon={SlidersHorizontal}
          label="見え方を調整"
          title="プロジェクト・チャット・要対応の見え方を細かく変える（変えたものはビューに上書き・新しいビューとして保存できる）"
          size={14}
          className={cx("sidebar-view-icon", tunerOpen && "active")}
          aria-expanded={tunerOpen}
          onClick={() => setTunerOpen(!tunerOpen)}
        />
      </div>
      {tunerOpen && (
        <Popover anchor={tunerAnchor} align="end" label="サイドバーの見え方" title="サイドバーの見え方" className="sidebar-view-popover" onClose={closeTuner}>
          <SidebarViewTuner {...tuner} views={views} />
        </Popover>
      )}
      {/* タグがあるときだけ、タグでの絞り込みの行（押すたびに付け外し） */}
      <TagFilterRow />
    </div>
  );
}

/**
 * ビューのタブ。1 行に並べ、入らないタブは折り返した先を隠して ▾ のメニューに出す（実際に折り返したかで決める）。
 * いまの見え方に合うタブを選択中に、合うものがなければ最後に選んだタブを「変えている」印（点線の枠）で見せる
 */
function SidebarViewTabs({ views }: { views: SidebarViews }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [renaming, setRenaming] = useState<string>();
  const menu = useContextMenu<SidebarView>();
  const more = useContextMenu({ align: "end" });
  const drag = useViewTabDrag(views.views, views.move, "sidebar-view");

  // 折り返して 2 行目より下に行ったタブ（隠れる）を数える。幅・タブが変わるたびに測り直す
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const tabs = [...list.querySelectorAll<HTMLElement>("[data-view-id]")];
      const top = tabs[0]?.offsetTop ?? 0;
      const next = tabs.filter((t) => t.offsetTop > top).map((t) => t.dataset.viewId ?? "");
      setHidden((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [views.views, renaming]);

  const remove = async (view: SidebarView) => {
    if (await confirmDialog({ title: `ビュー「${view.name}」を削除しますか？`, message: "サイドバーの見え方はいまのまま残ります。", confirmLabel: "削除", danger: true })) views.remove(view.id);
  };

  return (
    <>
      <div ref={listRef} className="sidebar-view-tabs" role="tablist" aria-label="サイドバーのビュー">
        {views.views.map((view) =>
          renaming === view.id ? (
            <span key={view.id} data-view-id={view.id} className="sidebar-view-rename">
              <InlineName
                className="sidebar-view-name"
                initial={view.name}
                validate={(name) => (viewNameTaken(views.views, name, view.id) ? `「${name}」というビューはもうあります` : null)}
                onSubmit={(name) => {
                  views.rename(view.id, name);
                  setRenaming(undefined);
                }}
                onCancel={() => setRenaming(undefined)}
              />
            </span>
          ) : (
            <button
              key={view.id}
              type="button"
              role="tab"
              data-view-id={view.id}
              aria-selected={views.active?.id === view.id}
              tabIndex={hidden.includes(view.id) ? -1 : undefined}
              {...drag.tabProps(view.id)}
              className={cx(
                "sidebar-view-tab",
                views.active?.id === view.id && "active",
                !views.active && views.selected?.id === view.id && "modified",
                hidden.includes(view.id) && "overflowed",
                drag.tabClass(view.id),
              )}
              title={
                !views.active && views.selected?.id === view.id
                  ? "このビューから見え方を変えています（押すとビューの見え方に戻す。⚙ で上書きできる）"
                  : "押すとこのビューの見え方にする（ドラッグで並べ替え・右クリック・Enter で名前の変更。右クリックで上書き・削除）"
              }
              onClick={() => views.apply(view)}
              onContextMenu={(e) => menu.open(e, view)}
              onDoubleClick={() => setRenaming(view.id)}
              // ピントがあるときの Enter で名前を変える（チャットの行・タグと同じ。押すのは Space）
              onKeyDown={(e) => {
                if (!isRenameKey(e)) return;
                e.preventDefault();
                setRenaming(view.id);
              }}
            >
              {view.name}
            </button>
          ),
        )}
      </div>
      {hidden.length > 0 && (
        <IconButton
          icon={ChevronDown}
          label={`ほかのビュー（${hidden.length} 件）`}
          size={14}
          className={cx("sidebar-view-icon sidebar-view-more", more.isOpen && "active", hidden.some((id) => id === views.active?.id) && "has-active")}
          aria-expanded={more.isOpen}
          onClick={(e) => more.toggle(e, undefined)}
        />
      )}
      {more.menu && (
        <PopupMenu at={more.menu.at} label="ほかのビュー" ignore=".sidebar-view-more" onClose={more.close}>
          {views.views
            .filter((v) => hidden.includes(v.id))
            .map((view) => (
              <MenuItem key={view.id} role="menuitemradio" checked={views.active?.id === view.id} onSelect={() => views.apply(view)}>
                {view.name}
              </MenuItem>
            ))}
        </PopupMenu>
      )}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`ビュー「${menu.menu.value.name}」`} onClose={menu.close}>
          <MenuItem onSelect={() => setRenaming(menu.menu?.value.id)}>
            <Pencil size={14} aria-hidden /> 名前を変更
          </MenuItem>
          <MenuItem
            disabled={sameSidebarViewState(menu.menu.value.state, views.current)}
            title={sameSidebarViewState(menu.menu.value.state, views.current) ? "いまの見え方と同じです" : undefined}
            onSelect={() => menu.menu && views.overwrite(menu.menu.value.id)}
          >
            <Save size={14} aria-hidden /> いまの見え方で上書き
          </MenuItem>
          <MenuItem danger onSelect={() => menu.menu && void remove(menu.menu.value)}>
            <Trash2 size={14} aria-hidden /> 削除
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
