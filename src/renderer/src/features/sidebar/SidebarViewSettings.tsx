import { ArrowDown, ArrowUp, Check, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { cx } from "@/lib/cx";
import { viewNameTaken } from "@/lib/namedViews";
import { CHAT_GROUPINGS } from "@/features/chatList/chatGrouping";
import { confirmDialog } from "@/ui/dialogs";
import { Field } from "@/ui/Field";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import { Segmented } from "@/ui/Segmented";
import { CHAT_ORDERS, GROUPING_META, ORDER_META } from "./chatGroupings";
import { newSidebarViewName, type SidebarView, type SidebarViewState } from "./sidebarViews";
import { LAYOUT_META, LAYOUTS } from "./SidebarViewTuner";
import { useSidebarViews, type SidebarViews } from "./useSidebarViews";
import { canChooseOrder, WAITING_ORDERS, WAITING_SCOPES, waitingAxes, waitingViewOf } from "./waitingAxes";
import { WAITING_ORDER_META, WAITING_SCOPE_META } from "./waitingView";

/**
 * 設定の「サイドバー」: サイドバーの見出しのビューの一覧（利用者の依頼）。並べ替え（↑↓。見出しのタブのドラッグと同じ並び）・名前の変更・
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
    if (await confirmDialog({ title: `ビュー「${view.name}」を削除しますか？`, message: "サイドバーの見え方はいまのまま残ります。", confirmLabel: "削除", danger: true })) views.remove(view.id);
  };
  return (
    <section className="section">
      <h2>サイドバーのビュー</h2>
      <p className="muted small">
        サイドバーの上に並べるビューです。ビューは、プロジェクト・チャット・要対応の見え方の組に名前を付けたもので、タブを押すとその見え方になります。見出しの ⚙ でいまの見え方を変えて、ビューに上書き・新しいビューとして保存することもできます。
      </p>
      <div className="snippet-manager">
        <div className="snippet-manager-head">
          <span className="muted small">{views.views.length} 件</span>
          <button type="button" className="btn" title="いまのサイドバーの見え方から新しいビューを作る" onClick={add}>
            <Plus size={14} aria-hidden /> 新しいビュー
          </button>
        </div>
        {views.views.length === 0 ? (
          <p className="muted small">ビューがありません。「新しいビュー」で、いまのサイドバーの見え方から作れます。</p>
        ) : (
          <ul className="snippet-manager-list">
            {views.views.map((view, i) => (
              <li key={view.id} className={cx("snippet-manager-row sidebar-view-setting", editing === view.id && "editing")}>
                <div className="snippet-manager-moves">
                  <IconButton icon={ArrowUp} size={13} label="1 つ上へ" disabled={i === 0} onClick={() => views.move(view.id, views.views[i - 1].id, "before")} />
                  <IconButton icon={ArrowDown} size={13} label="1 つ下へ" disabled={i === views.views.length - 1} onClick={() => views.move(view.id, views.views[i + 1].id, "after")} />
                </div>
                <div className="snippet-manager-body">
                  <div className="snippet-manager-title">
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
                      <span className="snippet-manager-name" onDoubleClick={() => setRenaming(view.id)}>
                        {view.name}
                      </span>
                    )}
                    {views.active?.id === view.id && <span className="snippet-scope common">表示中</span>}
                  </div>
                  {editing === view.id ? <ViewStateForm view={view} views={views} /> : <p className="snippet-manager-text">{describeState(view.state)}</p>}
                </div>
                <div className="snippet-manager-actions">
                  <IconButton icon={Pencil} size={13} label="名前を変更" title="名前を変更（名前のダブルクリックでも）" onClick={() => setRenaming(view.id)} />
                  <IconButton
                    icon={editing === view.id ? Check : SlidersHorizontal}
                    size={13}
                    label={editing === view.id ? "中身の変更を閉じる" : "中身を変更"}
                    onClick={() => setEditing(editing === view.id ? null : view.id)}
                  />
                  <IconButton icon={Trash2} size={13} label="削除" onClick={() => void remove(view)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** ビューの見え方の短い説明（一覧の行） */
function describeState(s: SidebarViewState): string {
  const waiting = s.waitingOn ? `要対応: ${WAITING_SCOPE_META[waitingAxes(s.waitingView).scope].short}・${WAITING_ORDER_META[waitingAxes(s.waitingView).order].short}` : "要対応: オフ";
  return [
    `プロジェクト: ${LAYOUT_META[s.layout].short}・${s.projectOrder === "recent" ? "最近順" : "手動"}・${s.projectCompact ? "1 行" : "2 行"}${s.showArchivedProjects ? "・アーカイブを表示" : ""}`,
    `チャット: ${GROUPING_META[s.grouping].short}・${ORDER_META[s.chatOrder].short}・${s.chatCompact ? "1 行" : "2 行"}${s.showArchivedChats ? "・アーカイブを表示" : ""}`,
    waiting,
  ].join(" / ");
}

/** ビューの中身を変えるフォーム（変えるとすぐ保存する。表示中のビューなら、いまの見え方にも当てる） */
function ViewStateForm({ view, views }: { view: SidebarView; views: SidebarViews }) {
  const s = view.state;
  const set = (patch: Partial<SidebarViewState>) => views.update(view.id, { ...s, ...patch });
  const { scope, order } = waitingAxes(s.waitingView);
  const onOff = (value: boolean) => (value ? "on" : "off");
  return (
    <div className="form sidebar-view-form">
      <Field as="div" label="プロジェクトの並べ方">
        <Segmented className="segmented theme-switch" label="プロジェクトの並べ方" value={s.layout} onChange={(layout) => set({ layout })} options={LAYOUTS.map((l) => ({ value: l, label: LAYOUT_META[l].short }))} />
      </Field>
      <Field as="div" label="プロジェクトの並び順">
        <Segmented
          className="segmented theme-switch"
          label="プロジェクトの並び順"
          value={s.projectOrder}
          onChange={(projectOrder) => set({ projectOrder })}
          options={[
            { value: "manual", label: "手動" },
            { value: "recent", label: "最近順" },
          ]}
        />
      </Field>
      <Field as="div" label="プロジェクトのカード">
        <Segmented
          className="segmented theme-switch"
          label="プロジェクトのカード"
          value={onOff(s.projectCompact)}
          onChange={(v) => set({ projectCompact: v === "on" })}
          options={[
            { value: "on", label: "1 行" },
            { value: "off", label: "2 行" },
          ]}
        />
      </Field>
      <Field as="div" label="しまったプロジェクト">
        <Segmented
          className="segmented theme-switch"
          label="しまったプロジェクト"
          value={onOff(s.showArchivedProjects)}
          onChange={(v) => set({ showArchivedProjects: v === "on" })}
          options={[
            { value: "on", label: "表示" },
            { value: "off", label: "隠す" },
          ]}
        />
      </Field>
      <Field as="div" label="チャットのまとめ方">
        <Segmented className="segmented theme-switch" label="チャットのまとめ方" value={s.grouping} onChange={(grouping) => set({ grouping })} options={CHAT_GROUPINGS.map((g) => ({ value: g, label: GROUPING_META[g].short }))} />
      </Field>
      <Field as="div" label="チャットの並び順">
        <Segmented className="segmented theme-switch" label="チャットの並び順" value={s.chatOrder} onChange={(chatOrder) => set({ chatOrder })} options={CHAT_ORDERS.map((o) => ({ value: o, label: ORDER_META[o].short }))} />
      </Field>
      <Field as="div" label="チャットの行">
        <Segmented
          className="segmented theme-switch"
          label="チャットの行"
          value={onOff(s.chatCompact)}
          onChange={(v) => set({ chatCompact: v === "on" })}
          options={[
            { value: "on", label: "1 行" },
            { value: "off", label: "2 行" },
          ]}
        />
      </Field>
      <Field as="div" label="アーカイブ済みのチャット">
        <Segmented
          className="segmented theme-switch"
          label="アーカイブ済みのチャット"
          value={onOff(s.showArchivedChats)}
          onChange={(v) => set({ showArchivedChats: v === "on" })}
          options={[
            { value: "on", label: "表示" },
            { value: "off", label: "隠す" },
          ]}
        />
      </Field>
      <Field as="div" label="要対応">
        <Segmented
          className="segmented theme-switch"
          label="要対応"
          value={onOff(s.waitingOn)}
          onChange={(v) => set({ waitingOn: v === "on" })}
          options={[
            { value: "on", label: "オン" },
            { value: "off", label: "オフ" },
          ]}
        />
      </Field>
      {s.waitingOn && (
        <>
          <Field as="div" label="要対応の出し方">
            <Segmented
              className="segmented theme-switch"
              label="要対応の出し方"
              value={scope}
              onChange={(next) => set({ waitingView: waitingViewOf(next, order) })}
              options={WAITING_SCOPES.map((w) => ({ value: w, label: WAITING_SCOPE_META[w].short }))}
            />
          </Field>
          {canChooseOrder(scope) && (
            <Field as="div" label="要対応の並べ方">
              <Segmented
                className="segmented theme-switch"
                label="要対応の並べ方"
                value={order}
                onChange={(next) => set({ waitingView: waitingViewOf(scope, next) })}
                options={WAITING_ORDERS.map((w) => ({ value: w, label: WAITING_ORDER_META[w].short }))}
              />
            </Field>
          )}
        </>
      )}
    </div>
  );
}
