import { useMemo } from "react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { addView, moveView, removeView, renameView, replaceViewState } from "@/foundation/ui/lib/namedViews";
import { useBoard } from "./BoardContext";
import { applyView, type BoardViewState } from "./layout";
import { activeView, parseSavedViews } from "./savedViews";
import { storage } from "./storage";

/**
 * 保存したビュー（全プロジェクトのボードとプロジェクトのボードで別の一覧。プロジェクトのボードの一覧はすべてのプロジェクトで共通）と、当てる操作。
 * ビューは見え方の組を覚えるだけで、当てるといまの見え方（BoardContext の view）に書く
 */
export function useSavedViews() {
  const { kind, view: current, patch } = useBoard();
  const [stored, setStored] = useSetting(kind === "all" ? storage.settings.viewsAll : storage.settings.viewsProject);
  const views = useMemo(() => parseSavedViews(stored), [stored]);
  return {
    views,
    current,
    active: activeView(views, current),
    /** ビューの見え方を当てる（そのボードで選べない段の分け方は、段の分け方だけそのまま） */
    apply: (state: BoardViewState) => patch(applyView(current, state, kind)),
    /** いまの見え方に名前を付けて保存する（いちばん後ろに足す） */
    save: (name: string) => setStored(addView(views, { id: crypto.randomUUID(), name, state: current })),
    rename: (id: string, name: string) => setStored(renameView(views, id, name)),
    /** いまの見え方で上書きする */
    overwrite: (id: string) => setStored(replaceViewState(views, id, current)),
    remove: (id: string) => setStored(removeView(views, id)),
    /** ビュー id を target の前・後ろへ動かす（ドラッグの並べ替え） */
    move: (id: string, target: string, side: "before" | "after") => setStored(moveView(views, id, target, side)),
  };
}
