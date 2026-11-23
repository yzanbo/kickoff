import { ArrowDown, ArrowUp, Check, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { viewNameTaken } from "@/foundation/ui/lib/namedViews";
import { confirmRemoveView } from "@/features/chatList/ui";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { useSidebarViews, type SidebarViews } from "./useSidebarViews";
import { SettingsFieldControl } from "./ViewFieldControl";
import { describeSidebarView, newSidebarViewName, SIDEBAR_REMOVE_NOTE, VIEW_KEYS, type SidebarView, type SidebarViewState } from "./viewFields";

/**
 * 設定の「サイドバー」: サイドバーの見出しのビューの一覧。並べ替え（↑↓。見出しのタブのドラッグと同じ並び）・名前の変更・
 * 中身の変更（見出しの ⚙ の窓と同じ項目）・削除・新しいビュー（いまのサイドバーの見え方から作る）
 */
export function SidebarViewSettings() {
  const views = useSidebarViews();
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const add = () => {
    const view = views.save(newSidebarViewName(views.views));
    setEditing(view.id);
  };
  const remove = async (view: SidebarView) => {
    if (await confirmRemoveView(view, SIDEBAR_REMOVE_NOTE)) views.remove(view.id);
  };
  return (
    <section className="section">
      <h2>サイドバーのビュー</h2>
      <p className="muted small">
        サイドバーの上に並べるビューです。ビューは、プロジェクト・チャット・要対応の見え方の組に名前を付けたもので、タブを押すとその見え方になります。見出しの ⚙ でいまの見え方を変えて、ビューに上書き・今のビューを新規保存することもできます。
      </p>
      <div className="manage-list">
        <div className="manage-list-head">
          <span className="muted small">{views.views.length} 件</span>
          <button type="button" className="btn" title="いまのサイドバーの見え方から新しいビューを作る" onClick={add}>
            <Plus size={14} aria-hidden /> 新しいビュー
          </button>
        </div>
        {views.views.length === 0 ? (
          <p className="muted small">ビューがありません。「新しいビュー」で、いまのサイドバーの見え方から作れます。</p>
        ) : (
          <ul className="manage-list-items">
            {views.views.map((view, i) => (
              <li key={view.id} className={cx("manage-list-row sidebar-view-setting", editing === view.id && "editing")}>
                <div className="manage-list-moves">
                  <IconButton icon={ArrowUp} iconSize={13} label="1 つ上へ" disabled={i === 0} onClick={() => views.move(view.id, views.views[i - 1].id, "before")} />
                  <IconButton icon={ArrowDown} iconSize={13} label="1 つ下へ" disabled={i === views.views.length - 1} onClick={() => views.move(view.id, views.views[i + 1].id, "after")} />
                </div>
                <div className="manage-list-body">
                  <div className="manage-list-title">
                    {renaming === view.id ? (
                      <InlineName
                        className="sidebar-view-name"
                        initial={view.name}
                        validate={(name) => (viewNameTaken(views.views, name, view.id) ? `「${name}」というビューはもうあります` : null)}
                        onSubmit={(name) => {
                          views.rename(view.id, name);
                          setRenaming(null);
                        }}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (
                      <span className="manage-list-name" onDoubleClick={() => setRenaming(view.id)}>
                        {view.name}
                      </span>
                    )}
                    {views.active?.id === view.id && <span className="manage-list-scope tag common" data-look="outline">表示中</span>}
                  </div>
                  {editing === view.id ? <ViewStateForm view={view} views={views} /> : <p className="manage-list-text">{describeSidebarView(view.state)}</p>}
                </div>
                <div className="manage-list-actions">
                  <IconButton icon={Pencil} iconSize={13} label="名前を変更" title="名前を変更（名前のダブルクリックでも）" onClick={() => setRenaming(view.id)} />
                  <IconButton
                    icon={editing === view.id ? Check : SlidersHorizontal}
                    iconSize={13}
                    label={editing === view.id ? "中身の変更を閉じる" : "中身を変更"}
                    onClick={() => setEditing(editing === view.id ? null : view.id)}
                  />
                  <IconButton icon={Trash2} iconSize={13} label="削除" onClick={() => void remove(view)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** ビューの中身を変えるフォーム（項目は viewFields.ts の表。変えるとすぐ保存する。表示中のビューなら、いまの見え方にも当てる） */
function ViewStateForm({ view, views }: { view: SidebarView; views: SidebarViews }) {
  const set = (patch: Partial<SidebarViewState>) => views.update(view.id, { ...view.state, ...patch });
  return (
    <div className="form sidebar-view-form">
      {VIEW_KEYS.map((k) => (
        <SettingsFieldControl key={k} field={k} state={view.state} set={set} />
      ))}
    </div>
  );
}
