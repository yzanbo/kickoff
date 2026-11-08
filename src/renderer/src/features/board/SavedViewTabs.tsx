import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { confirmDialog } from "@/ui/dialogs";
import { InlineName } from "@/ui/InlineName";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { sameViewState, type SavedView } from "./savedViews";
import { useSavedViews } from "./useSavedViews";

/**
 * ツールバーの上の、保存したビューのタブ（Notion のビューを参考に）。押すとそのビューの見え方（表示・段・列の分け方・並び順・表の列・
 * リストの行・アーカイブ）を当て、いまの見え方に合うビューを選択中に見せる。「＋ ビューを保存」でいまの見え方に名前を付けて足し、
 * タブの右クリックで名前の変更・いまの見え方で上書き・削除。全プロジェクトのボードとプロジェクトのボードで別の一覧
 */
export function SavedViewTabs({ allProjects }: { allProjects: boolean }) {
  const saved = useSavedViews(allProjects);
  const menu = useContextMenu<SavedView>();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string>();
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
            className={cx("board-view-tab", saved.active?.id === view.id && "active")}
            title="押すとこのビューの表示にする（右クリックで名前の変更・上書き・削除）"
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
          onSubmit={(name) => {
            saved.save(name);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="board-view-add" onClick={() => setAdding(true)} title="いまの表示・段・列の分け方・並び順・絞り込みに名前を付けて保存する">
          <Plus size={12} aria-hidden /> ビューを保存
        </button>
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
