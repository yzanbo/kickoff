import { Plus, Save, Settings } from "lucide-react";
import { useState } from "react";
import { BucketColorItem, chatListSettings } from "@/features/chatList/ui";
import { sameViewExistsText, viewNameTaken } from "@/foundation/ui/lib/namedViews";
import { openSettings } from "@/features/settings/ui";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import type { SidebarViews } from "./useSidebarViews";
import { TunerFieldButton } from "./ViewFieldControl";
import { keysOfRow, ROW_LABELS, sameSidebarViewState, type ViewRow } from "./viewFields";

/**
 * サイドバーの見え方の調整（見出しの ⚙ で開く窓の中身）。何に効くかで行を分け（プロジェクト・チャット・要対応）、
 * 項目ごとのボタンを並べる（項目と並びは viewFields.ts の表。1 つのボタンには 1 種類だけ）。
 * 下に、変えた見え方を残す操作（選んでいるビューに上書き・今のビューを新規保存）と、設定の画面の「サイドバー」へ
 */
export function SidebarViewTuner({ views, archivedCount, waitingCount }: { views: SidebarViews; archivedCount: number; waitingCount: number }) {
  const ctx = { state: views.current, archivedCount };
  const row = (r: ViewRow, badge?: number) => (
    <div className="project-list-row">
      <span className="project-list-row-label">
        {ROW_LABELS[r]}
        {badge ? <span className="count-badge project-list-count">{badge}</span> : null}
      </span>
      {keysOfRow(r).map((k) => (
        <TunerFieldButton
          key={k}
          field={k}
          state={views.current}
          set={views.set}
          ctx={ctx}
          // グループ別・作業場所別の見出しの色（色付き / 色なし。見出しの右クリックにも同じ項目）。選んでもメニューは閉じない
          extra={k === "grouping" ? <BucketColorItem setting={chatListSettings.bucketColors} keepOpen /> : undefined}
        />
      ))}
    </div>
  );
  return (
    <div className="sidebar-view-tuner">
      <div className="project-list-head">
        {row("project")}
        {row("chat")}
        {/* 要対応の行（待っているチャットの数を名前の横に） */}
        {row("waiting", waitingCount)}
      </div>
      <TunerActions views={views} />
    </div>
  );
}

/**
 * 変えた見え方を残す操作: 選んでいるビューに上書き（同じなら押せない）・今のビューを新規保存（名前を聞く）・ビューの管理（設定の画面）。
 * いまの見え方と同じビューがもうあれば、今のビューを新規保存は押せなくし、どのビューと同じかを下に書く（同じ見え方のビューを 2 つ作らない）
 */
function TunerActions({ views }: { views: SidebarViews }) {
  const [naming, setNaming] = useState(false);
  const target = views.selected;
  const same = !target || sameSidebarViewState(target.state, views.current);
  // いまの見え方と同じビュー（あれば新しく作らない）
  const duplicate = views.active;
  return (
    <div className="sidebar-view-tuner-actions">
      {naming ? (
        <InlineName
          className="sidebar-view-name"
          placeholder="ビューの名前"
          validate={(name) =>
            viewNameTaken(views.views, name) ? `「${name}」というビューはもうあります` : duplicate ? sameViewExistsText(duplicate.name) : null
          }
          onSubmit={(name) => {
            views.save(name);
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      ) : (
        <>
          <button
            type="button"
            className="btn"
            data-size="sm"
            disabled={same}
            title={!target ? "選んでいるビューがありません" : same ? "いまの見え方と同じです" : `ビュー「${target.name}」をいまの見え方で上書きする`}
            onClick={() => target && views.overwrite(target.id)}
          >
            <Save size={13} aria-hidden /> {target ? `「${target.name}」に上書き` : "上書き"}
          </button>
          <button
            type="button"
            className="btn"
            data-size="sm"
            disabled={Boolean(duplicate)}
            title={duplicate ? sameViewExistsText(duplicate.name) : "いまの見え方に名前を付けて、ビューのタブに足す"}
            onClick={() => setNaming(true)}
          >
            <Plus size={13} aria-hidden /> 今のビューを新規保存
          </button>
          {duplicate && <p className="sidebar-view-same muted small">{sameViewExistsText(duplicate.name)}</p>}
        </>
      )}
      <button type="button" className="btn sidebar-view-manage" data-size="sm" title="設定の画面で、ビューの並べ替え・名前と中身の変更・削除をする" onClick={() => openSettings("sidebar")}>
        <Settings size={13} aria-hidden /> ビューを管理
      </button>
    </div>
  );
}
