import { useMemo } from "react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { addView, moveView, removeView, renameView, replaceViewState } from "@/foundation/ui/lib/namedViews";
import { storage } from "./storage";
import { activeSidebarView, applySidebarView, parseSidebarViews, useSidebarViewState, type SidebarView, type SidebarViewState } from "./viewFields";

/**
 * サイドバーのビュー（見出しのタブ・⚙ の窓・設定の画面で共通）と、いまの見え方・当てる操作。
 * 見え方の設定（並べ方・まとめ方など）はそれぞれの設定のまま読み書きし、ビューはその組を覚えるだけ（項目の表は viewFields.ts）。
 * selected は最後に選んだビュー（⚙ の窓の「上書き」の先。いまの見え方に合うビューがあれば、そちらを選んでいるものとみなす）
 */
export function useSidebarViews() {
  const [stored, setStored] = useSetting(storage.settings.savedViews);
  const views = useMemo(() => parseSidebarViews(stored), [stored]);
  const [selectedId, setSelectedId] = useSetting(storage.settings.viewSelected);
  const current = useSidebarViewState();
  const active = activeSidebarView(views, current);
  /** 選んでいるビュー（いまの見え方に合うもの。なければ最後に選んだもの） */
  const selected = active ?? views.find((v) => v.id === selectedId);

  return {
    views,
    current,
    /** いまの見え方に合う、いちばん前のビュー */
    active,
    selected,
    /** まだ一度もビューを選んでいないか（初めて開いたときに最初のビューを当てる） */
    neverSelected: selectedId === "",
    /** いまの見え方の一部を変える（⚙ の窓） */
    set: applySidebarView,
    /** ビューを選ぶ（見え方を当て、上書きの先として覚える） */
    apply: (view: SidebarView) => {
      applySidebarView(view.state);
      setSelectedId(view.id);
    },
    /** いまの見え方に名前を付けて保存する（いちばん後ろに足し、選んでいるものにする）。足したビューを返す */
    save: (name: string, state: SidebarViewState = current): SidebarView => {
      const view = { id: crypto.randomUUID(), name, state };
      setStored(addView(views, view));
      setSelectedId(view.id);
      return view;
    },
    rename: (id: string, name: string) => setStored(renameView(views, id, name)),
    /** いまの見え方で上書きする */
    overwrite: (id: string) => setStored(replaceViewState(views, id, current)),
    /** 中身を変える（設定の画面。そのビューを選んでいれば、いまの見え方にも当てる） */
    update: (id: string, state: SidebarViewState) => {
      setStored(replaceViewState(views, id, state));
      if (selected?.id === id) applySidebarView(state);
    },
    remove: (id: string) => setStored(removeView(views, id)),
    /** ビュー id を target の前・後ろへ動かす（ドラッグ・設定の画面の上下） */
    move: (id: string, target: string, side: "before" | "after") => setStored(moveView(views, id, target, side)),
  };
}

export type SidebarViews = ReturnType<typeof useSidebarViews>;
