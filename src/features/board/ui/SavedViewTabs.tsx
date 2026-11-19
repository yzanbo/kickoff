import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { isRenameKey } from "@/foundation/ui/lib/keys";
import { confirmDialog } from "@/foundation/ui/kit/dialogs";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { sameViewExistsText, viewNameTaken } from "@/foundation/ui/lib/namedViews";
import { useViewTabDrag } from "@/foundation/ui/kit/useViewTabDrag";
import { sameViewState, type SavedView } from "./savedViews";
import { useRememberedView } from "./useRememberedView";
import { useSavedViews } from "./useSavedViews";

/**
 * ツールバーの上の、保存したビューのタブ（Notion のビューを参考に）。押すとそのビューの見え方（表示・段・列の分け方・並び順・
 * アーカイブ）を当て、いまの見え方に合うビューを選択中に見せる。「＋ 今のビューを新規保存」でいまの見え方に名前を付けて足し、
 * タブのドラッグで並べ替え、右クリックで名前の変更・いまの見え方で上書き・削除。いまの見え方と同じビューがもうあれば「今のビューを新規保存」は押せなくし、
 * どのビューと同じかを横に書く（同じ見え方のビューを 2 つ作らない）。全プロジェクトのボード（projectId なし）とプロジェクトのボード（
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
  /** 同じ一覧の同じ名前は付けられない（名前を変えるときはそのビュー自身を除く） */
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
            title="押すとこのビューの表示にする（ダブルクリック・Enter で名前の変更。ドラッグで並べ替え・右クリックで名前の変更・上書き・削除）"
            onClick={() => saved.apply(view.state)}
            onContextMenu={(e) => menu.open(e, view)}
            onDoubleClick={() => setRenaming(view.id)}
            // ピントがあるときの Enter で名前を変える（サイドバーのビュー・チャットのタブと同じ。押すのは Space）
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
            <Plus size={12} aria-hidden /> 今のビューを新規保存
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
