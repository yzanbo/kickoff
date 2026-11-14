import type { HTMLAttributes } from "react";
import { isCancelKey } from "@/lib/keys";
import { useMultiSelect } from "@/hooks/useMultiSelect";
import type { ChangeFold } from "./ChangeGroup";
import type { ChangeGroups, Selection } from "./fileSelection";
import type { TreeMulti } from "./FileTree";
import { buildTree, folderPaths, visibleTreePaths } from "./treeModel";

/** 選ぶ印（同じファイルがステージ済みと未ステージの両方にあるので、まとまりも入れる） */
const keyOf = (staged: boolean, path: string) => `${staged ? "s" : "u"}:${path}`;
const parseKey = (key: string) => ({ staged: key.startsWith("s:"), path: key.slice(2) });

/** まとまりの中で見えているファイルの並び（閉じたまとまりは空。木ならフォルダを除いた、開いているフォルダの中までの順） */
export function visibleChangePaths(paths: readonly string[], fold: ChangeFold, tree: boolean): string[] {
  if (!fold.open) return [];
  if (!tree) return [...paths];
  const nodes = buildTree({ files: [...paths], ignored: [] });
  const open = new Set(folderPaths(nodes).filter((p) => !fold.closed.has(p)));
  const files = new Set(paths);
  return visibleTreePaths(nodes, open).filter((p) => files.has(p));
}

/**
 * 変更の一覧（ChangesPane）の ⌘ / Shift ＋クリックの複数選択（利用者の依頼。決まりは useMultiSelect）。「ステージされている変更」と「変更」をまたいで 1 つで、
 * 範囲は見えている並び（ステージ済み → 未ステージ）。まだ何も選んでいなければ開いているファイルも入れる。フォルダの行は選ばない（中に変更のないファイルもあるため）。
 * 返す multiFor(staged) をまとまりに渡し、pickedIn(staged) は行のボタン（ステージなど）を選んだものすべてに効かせるのに使う
 */
export function useChangeSelection({ groups, folds, tree, selected }: { groups: ChangeGroups; folds: { staged: ChangeFold; unstaged: ChangeFold }; tree: boolean; selected?: Selection }) {
  const keysOf = (staged: boolean) => (staged ? groups.staged : groups.unstaged).map((f) => keyOf(staged, f.path));
  const existing = [...keysOf(true), ...keysOf(false)];
  const fileKeys = new Set(existing);
  const picks = useMultiSelect(existing, () => [
    ...visibleChangePaths(groups.staged.map((f) => f.path), folds.staged, tree).map((p) => keyOf(true, p)),
    ...visibleChangePaths(groups.unstaged.map((f) => f.path), folds.unstaged, tree).map((p) => keyOf(false, p)),
  ]);
  // いま開いているファイル（変更の一覧から開いたものだけ。どちらのまとまりかが分かるので）
  const current = selected?.staged === undefined ? null : keyOf(selected.staged, selected.path);

  const multiFor = (staged: boolean): TreeMulti => ({
    any: picks.selected.length > 0,
    has: (path) => picks.has(keyOf(staged, path)),
    // フォルダの行（ファイルの印にないもの）は選ばず、ふだんどおり開閉する
    click: (e, path) => fileKeys.has(keyOf(staged, path)) && picks.click(e, keyOf(staged, path), current),
    manyFor: (path) => {
      if (picks.has(keyOf(staged, path)) && picks.selected.length > 1) return picks.selected.map((k) => ({ ...parseKey(k), dir: false }));
      picks.clear();
      return null;
    },
  });
  /** そのまとまりで選んでいるファイル */
  const pickedIn = (staged: boolean) => picks.selected.map(parseKey).filter((k) => k.staged === staged).map((k) => k.path);
  /** まとまりを包む要素に広げる（Esc・行の外を押したら、選んだものを外す） */
  const containerProps: Pick<HTMLAttributes<HTMLElement>, "onClick" | "onKeyDown"> = {
    onClick: (e) => {
      if (!(e.target instanceof Element && e.target.closest(".tree-row, .change-file, button, input"))) picks.clear();
    },
    onKeyDown: (e) => {
      if (!isCancelKey(e) || picks.selected.length === 0) return;
      e.preventDefault();
      picks.clear();
    },
  };
  return { multiFor, pickedIn, containerProps };
}
