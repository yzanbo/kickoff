import { ChevronDown, Pencil, Save, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { anchorPlacement } from "@/foundation/ui/lib/floating";
import { isRenameKey } from "@/foundation/ui/lib/keys";
import { viewNameTaken, type NamedView } from "@/foundation/ui/lib/namedViews";
import { confirm } from "@/foundation/ui/kit/ask";
import { useReorder } from "@/foundation/ui/kit/drag/useReorder";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";

/** ビューを消してよいか聞く（note = 消しても見え方は残ることの説明） */
export const confirmRemoveView = (view: NamedView, note: string) =>
  confirm({ title: `ビュー「${view.name}」を削除しますか？`, message: note, confirmLabel: "削除", danger: true });

interface Props<V extends NamedView> {
  views: readonly V[];
  /** いまの見え方に合うビュー */
  activeId: string | undefined;
  /** 選んだビューから見え方を変えているとき、そのビュー（点線の枠） */
  modifiedId?: string;
  /** クラスの頭（<look>-tab・<look>-name・<look>-rename・<look>-icon・<look>-more・<look>-menu） */
  look: string;
  /** 並びの入れ物のクラスと読み上げの名前 */
  listClass: string;
  label: string;
  /** ドラッグで運ぶビューの種類（ほかのドラッグと見分ける） */
  dragType: string;
  tabTitle(modified: boolean): string;
  /** 右クリックの「上書き」の名前と、いまの見え方と同じで押せないときの説明・削除の確かめの説明 */
  texts: { overwrite: string; same: string; removeNote: string };
  /** いまの見え方と同じか */
  same(view: V): boolean;
  onApply(view: V): void;
  onRename(id: string, name: string): void;
  onOverwrite(id: string): void;
  onRemove(id: string): void;
  onMove(id: string, target: string, side: "before" | "after"): void;
  /** 1 行に入らないタブを隠して ▾ のメニューに出す（実際に折り返したかで決める） */
  overflow?: boolean;
  /** タブの後ろ（並びの入れ物の中） */
  children?: ReactNode;
}

/**
 * 名前を付けた見え方（ビュー）のタブ（サイドバーのビュー・ボードの保存したビュー）。押すとその見え方を当て、いまの見え方に合うタブを選択中に見せる。
 * ダブルクリック・Enter で名前の変更、ドラッグで並べ替え（▾ のメニューの中・タブの行との間も）、右クリックで名前の変更・上書き・削除
 */
export function NamedViewTabs<V extends NamedView>(p: Props<V>) {
  const { views, look } = p;
  const listRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [renaming, setRenaming] = useState<string>();
  const menu = useContextMenu<V>();
  const more = useContextMenu({ align: "end" });
  const drag = useReorder({ keys: views.map((v) => v.id), type: p.dragType, onMove: p.onMove });

  // 折り返して 2 行目より下に行ったタブ（隠れる）を数える。幅・タブが変わるたびに測り直す
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!p.overflow || !list) return;
    const measure = () => {
      const tabs = [...list.querySelectorAll<HTMLElement>("[data-view-id]")];
      // 名前を変えている欄は先頭に並べ替える（CSS の order）ので、DOM の最初のタブではなく、いちばん上の行の高さを基準にする
      const top = Math.min(...tabs.map((t) => t.offsetTop));
      const next = tabs.filter((t) => t.offsetTop > top).map((t) => t.dataset.viewId ?? "");
      setHidden((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [p.overflow, views, renaming]);

  const remove = async (view: V) => {
    if (await confirmRemoveView(view, p.texts.removeNote)) p.onRemove(view.id);
  };
  const nameField = (view: V) => (
    <InlineName
      key={view.id}
      className={`${look}-name`}
      initial={view.name}
      validate={(name) => (viewNameTaken(views, name, view.id) ? `「${name}」というビューはもうあります` : null)}
      onSubmit={(name) => {
        p.onRename(view.id, name);
        setRenaming(undefined);
      }}
      onCancel={() => setRenaming(undefined)}
    />
  );

  return (
    <>
      <div ref={listRef} className={p.listClass} role="tablist" aria-label={p.label}>
        {views.map((view) => {
          if (renaming === view.id)
            return p.overflow ? (
              <span key={view.id} data-view-id={view.id} className={`${look}-rename`}>
                {nameField(view)}
              </span>
            ) : (
              nameField(view)
            );
          const modified = p.modifiedId === view.id;
          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              data-view-id={p.overflow ? view.id : undefined}
              aria-selected={p.activeId === view.id}
              tabIndex={hidden.includes(view.id) ? -1 : undefined}
              {...drag.itemProps(view.id)}
              className={cx(`${look}-tab view-tab`, p.activeId === view.id && "active", modified && "modified", hidden.includes(view.id) && "overflowed")}
              title={p.tabTitle(modified)}
              onClick={() => p.onApply(view)}
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
          );
        })}
        {p.children}
      </div>
      {hidden.length > 0 && (
        <IconButton
          icon={ChevronDown}
          label={`ほかのビュー（${hidden.length} 件）`}
          iconSize={14}
          active={more.isOpen}
          className={cx(`${look}-icon ${look}-more`, hidden.some((id) => id === p.activeId) && "has-active")}
          aria-expanded={more.isOpen}
          onClick={(e) => more.toggle(e, undefined)}
          // タブをドラッグして重ねると、いちばん後ろへ落とせる。重ねたまま待つとメニューを開き、その中の好きな位置へ落とせる
          {...drag.endProps((el) => !more.isOpen && more.openAt(anchorPlacement(el, { align: "end", gap: 4 }), undefined))}
        />
      )}
      {more.menu && (
        <PopupMenu at={more.menu.at} className={`${look}-menu`} label="ほかのビュー" ignore={`.${look}-more`} onClose={more.close}>
          {views
            .filter((v) => hidden.includes(v.id))
            .map((view) => (
              <MenuItem
                key={view.id}
                role="menuitemradio"
                checked={p.activeId === view.id}
                onSelect={() => p.onApply(view)}
                // ドラッグで並べ替える（メニューの中の上下の半分で前後を決める。タブの行へも落とせる）。右クリックはタブと同じメニュー（▾ のメニューは閉じて、その位置に開く）
                buttonProps={{
                  ...drag.itemProps(view.id, "y"),
                  onContextMenu: (e) => {
                    menu.open(e, view);
                    more.close();
                  },
                }}
              >
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
            disabled={p.same(menu.menu.value)}
            title={p.same(menu.menu.value) ? p.texts.same : undefined}
            onSelect={() => menu.menu && p.onOverwrite(menu.menu.value.id)}
          >
            <Save size={14} aria-hidden /> {p.texts.overwrite}
          </MenuItem>
          <MenuItem danger onSelect={() => menu.menu && void remove(menu.menu.value)}>
            <Trash2 size={14} aria-hidden /> 削除
          </MenuItem>
        </PopupMenu>
      )}
    </>
  );
}
