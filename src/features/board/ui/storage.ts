// board の画面の保存（キーは kickoff:board:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, json, namedViews } from "@/foundation/ui/storage";
import { DEFAULT_ALL_PROJECTS_VIEWS, DEFAULT_PROJECT_VIEWS } from "./initialViews";

/** 形を確かめずにオブジェクトとして読む（中身は読む側 layout.ts の parseLayout で確かめる） */
function parseLooseObject(value: unknown): Readonly<Record<string, unknown>> | null | undefined {
  if (value === null) return null;
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export const storage = defineSettings("board", {
  /**
   * いまの見え方（layout.ts の BoardLayoutState: 表示・段・列の分け方・並び順・アーカイブの絞り込み・表示項目）。
   * 全プロジェクトのボードとプロジェクトのボード（すべてのプロジェクトで共通）で別に覚え、覚えていなければ初めからあるビューの先頭
   */
  layoutAll: json(parseLooseObject, null, (v) => v === null),
  layoutProject: json(parseLooseObject, null, (v) => v === null),
  /**
   * 保存したボードのビュー（見え方の組に名前を付けたもの。features/board/savedViews.ts）。全プロジェクトのボードとプロジェクトのボードで別に覚える。
   * 覚えていなければ初めのビュー（DEFAULT_ALL_PROJECTS_VIEWS・DEFAULT_PROJECT_VIEWS）。すべて消したら [] を覚え、初めのビューには戻さない
   */
  viewsAll: namedViews(DEFAULT_ALL_PROJECTS_VIEWS),
  viewsProject: namedViews(DEFAULT_PROJECT_VIEWS),
});
