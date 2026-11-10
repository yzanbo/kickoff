import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { confirmDialog } from "@/ui/dialogs";
import { InlineName } from "@/ui/InlineName";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { sameViewExistsText, viewNameTaken } from "@/lib/namedViews";
import { useViewTabDrag } from "@/ui/useViewTabDrag";
import { sameViewState, type SavedView } from "./savedViews";
import { useRememberedView } from "./useRememberedView";
import { useSavedViews } from "./useSavedViews";

/**
 * ツールバーの上の、保存したビューのタブ（Notion のビューを参考に）。押すとそのビューの見え方（表示・段・列の分け方・並び順・表の列・
 * アーカイブ）を当て、いまの見え方に合うビューを選択中に見せる。「＋ ビューを保存」でいまの見え方に名前を付けて足し、
 * タブのドラッグで並べ替え、右クリックで名前の変更・いまの見え方で上書き・削除。いまの見え方と同じビューがもうあれば「ビューを保存」は押せなくし、
 * どのビューと同じかを横に書く（同じ見え方のビューを 2 つ作らない。利用者の依頼）。全プロジェクトのボード（projectId なし）とプロジェクトのボード（
 * すべてのプロジェクトで共通）で別の一覧で、同じ一覧に同じ名前は付けられない
 */
export function SavedViewTabs({ projectId }: { projectId?: number }) {
  const saved = useSavedViews(projectId);
  // ボードを開いたときに、そのボードで最後に見ていた見え方（初めは最初のビュー）に戻す
  useRememberedView(saved, projectId === undefined);
  const menu = useContextMenu<SavedView>();
  const drag = useViewTabDrag(saved.views, saved.move, "board-view");
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string>();
  // いまの見え方と同じビュー（あれば新しく作らない）
  const duplicate = saved.active;
  /** 同じ一覧の同じ名前は付けられない（利用者の依頼。名前を変えるときはそのビュー自身を除く） */
  const nameError = (exceptId?: string) => (name: string) => (viewNameTaken(saved.views, name, exceptId) ? `「${name}」というビューはもうあります` : null);
  const remove = async (view: SavedView) => {
    if (await confirmDialog({ title: `ビュー「${view.name}」を削除しますか？`, message: "表示の設定はいまのまま残ります。", confirmLabel: "削除", danger: true })) saved.remove(view.id);
  };
  return (
    <div className="board-views" role="tablist" aria-label="保存したビュー">
      {saved.views.map((view) =>
        renaming === view.id ? (
          <InlineName
            key={view.id}
            className="board-view-name"
            initial={view.name}
            validate={nameError(view.id)}
            onSubmit={(name) => {
              saved.rename(view.id, name);
              setRenaming(undefined);
            }}
            onCancel={() => setRenaming(undefined)}
          />
        ) : (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={saved.active?.id === view.id}
            {...drag.tabProps(view.id)}
            className={cx("board-view-tab", saved.active?.id === view.id && "active", drag.tabClass(view.id))}
            title="押すとこのビューの表示にする（ドラッグで並べ替え・右クリックで名前の変更・上書き・削除）"
            onClick={() => saved.apply(view.state)}
            onContextMenu={(e) => menu.open(e, view)}
            onDoubleClick={() => setRenaming(view.id)}
          >
            {view.name}
          </button>
        ),
      )}
      {adding ? (
        <InlineName
          className="board-view-name"
          placeholder="ビューの名前"
          validate={(name) => nameError()(name) ?? (duplicate ? sameViewExistsText(duplicate.name) : null)}
          onSubmit={(name) => {
            saved.save(name);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <>
          <button
            type="button"
            className="board-view-add"
            disabled={Boolean(duplicate)}
            onClick={() => setAdding(true)}
            title={duplicate ? sameViewExistsText(duplicate.name) : "いまの表示・段・列の分け方・並び順・絞り込みに名前を付けて保存する"}
          >
            <Plus size={12} aria-hidden /> ビューを保存
          </button>
          {duplicate && <span className="board-view-same">{sameViewExistsText(duplicate.name)}</span>}
        </>
      )}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`ビュー「${menu.menu.value.name}」`} onClose={menu.close}>
          <MenuItem onSelect={() => setRenaming(menu.menu?.value.id)}>
            <Pencil size={14} aria-hidden /> 名前を変更
          </MenuItem>
          <MenuItem
            disabled={sameViewState(menu.menu.value.state, saved.current)}
            title={sameViewState(menu.menu.value.state, saved.current) ? "いまの表示と同じです" : undefined}
            onSelect={() => menu.menu && saved.overwrite(menu.menu.value.id)}
          >
            <Save size={14} aria-hidden /> いまの表示で上書き
          </MenuItem>
          <MenuItem danger onSelect={() => menu.menu && void remove(menu.menu.value)}>
            <Trash2 size={14} aria-hidden /> 削除
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}
