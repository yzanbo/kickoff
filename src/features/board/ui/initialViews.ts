// ボードの保存したビューの初めの値（保存の宣言は storage.ts。形は savedViews.ts の BoardViewState）
import type { StoredView } from "@/foundation/ui/storage";

/** 初めからあるビュー 1 つ（並び順は初めの最後に動いた順、アーカイブは初めの未アーカイブ） */
const defaultView = (id: string, name: string, view: "board" | "list", columns: string, lanes: string): StoredView => ({
  id,
  name,
  state: { view, lanes, columns, sort: { key: "active", dir: "desc" }, archive: "active" },
});

/**
 * プロジェクトのボードに初めからある保存したビュー（並びは グループボード・状態ボード・グループリスト）。
 * 形は features/board/savedViews.ts の BoardViewState。並び順は初めの最後に動いた順、アーカイブは初めの未アーカイブ。
 * 表示項目は入れない（当てても表示項目を変えない）。名前を変えた・消したビューは覚えた一覧のほうを使う（すべて消しても [] で残し、ここに戻さない）
 */
export const DEFAULT_PROJECT_VIEWS: readonly StoredView[] = [
  defaultView("default-group-board", "グループボード", "board", "groups", "none"),
  defaultView("default-state-board", "状態ボード", "board", "state", "none"),
  defaultView("default-group-list", "グループリスト", "list", "state", "group"),
];

/** 全プロジェクトのボードに初めからある保存したビュー（並びは プロジェクト別グループボード・プロジェクト別リスト。決まりはプロジェクトのボードと同じ） */
export const DEFAULT_ALL_PROJECTS_VIEWS: readonly StoredView[] = [
  defaultView("default-project-group-board", "プロジェクト別グループボード", "board", "groups", "project"),
  defaultView("default-project-list", "プロジェクト別リスト", "list", "none", "project"),
];
