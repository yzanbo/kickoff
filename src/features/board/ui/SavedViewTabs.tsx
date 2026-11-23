import "./SavedViewTabs.css";
import { Plus } from "lucide-react";
import { useState } from "react";
import { NamedViewTabs } from "@/features/chatList/ui";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { sameViewExistsText, viewNameTaken } from "@/foundation/ui/lib/namedViews";
import { sameViewState } from "./savedViews";
import { useSavedViews } from "./useSavedViews";

/** ドラッグで運ぶビューの種類（ほかのドラッグと見分ける） */
const VIEW_DRAG_TYPE = "application/x-kickoff-board-view";

/**
 * ツールバーの上の、保存したビューのタブ。押すとそのビューの見え方（表示・段・列の分け方・並び順・
 * アーカイブ）を当て、いまの見え方に合うビューを選択中に見せる。「＋ 今のビューを新規保存」でいまの見え方に名前を付けて足し、
 * タブのドラッグで並べ替え、右クリックで名前の変更・いまの見え方で上書き・削除。いまの見え方と同じビューがもうあれば「今のビューを新規保存」は押せなくし、
 * どのビューと同じかを横に書く（同じ見え方のビューを 2 つ作らない）。全プロジェクトのボードとプロジェクトのボード（
 * すべてのプロジェクトで共通）で別の一覧で、同じ一覧に同じ名前は付けられない
 */
export function SavedViewTabs() {
  const saved = useSavedViews();
  const [adding, setAdding] = useState(false);
  // いまの見え方と同じビュー（あれば新しく作らない）
  const duplicate = saved.active;
  return (
    <NamedViewTabs
      views={saved.views}
      activeId={saved.active?.id}
      look="board-view"
      listClass="board-views"
      label="保存したビュー"
      dragType={VIEW_DRAG_TYPE}
      tabTitle={() => "押すとこのビューの表示にする（ダブルクリック・Enter で名前の変更。ドラッグで並べ替え・右クリックで名前の変更・上書き・削除）"}
      texts={{ overwrite: "いまの表示で上書き", same: "いまの表示と同じです", removeNote: "表示の設定はいまのまま残ります。" }}
      same={(view) => sameViewState(view.state, saved.current)}
      onApply={(view) => saved.apply(view.state)}
      onRename={saved.rename}
      onOverwrite={saved.overwrite}
      onRemove={saved.remove}
      onMove={saved.move}
    >
      {adding ? (
        <InlineName
          className="board-view-name"
          placeholder="ビューの名前"
          validate={(name) => (viewNameTaken(saved.views, name) ? `「${name}」というビューはもうあります` : duplicate ? sameViewExistsText(duplicate.name) : null)}
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
    </NamedViewTabs>
  );
}
