import { useRef, useState } from "react";
import type { GitFileChange } from "@shared/types";
import { confirmDialog } from "@/ui/dialogs";

/**
 * 選んでいるファイル。変更の一覧から選んだときは、ステージ済み・未ステージのどちらか（同じファイルが両方にあることもある）。
 * エクスプローラーから選んだときは staged を持たない（変更があっても中身を出し、変更は行の横の色の帯で見せる）。
 * 検索の結果から選んだときは line を持つ（変更があってもいまの中身を出し、その行を目立たせる）。
 * edit は、差分を見ながら編集するとき（変更の一覧から選んだとき（changeSelection）と、差分の「編集」から来たとき。staged はどちらの差分から来たか。
 * 編集しながらその差分を出す）。focus は「編集」のボタンから来たとき（編集の部品にピントを置く。一覧から選んだときは一覧に残し、↑↓ で移れるように）
 */
export interface Selection {
  path: string;
  staged?: boolean;
  line?: number;
  edit?: boolean;
  focus?: boolean;
}

/** ファイルタブで選んでいるファイル。編集中に保存していない変更があれば、別のファイルを開く前に確かめる */
export function useChangesSelection() {
  const [selected, setSelectedState] = useState<Selection>();
  // 編集中のファイルに保存していない変更があるか（別のファイルを開く前に確かめる）
  const dirty = useRef(false);
  const setSelected = async (next: Selection) => {
    if (
      dirty.current &&
      !(await confirmDialog({ title: "保存していない変更があります", message: "別のファイルを開くと、変更は消えます。", confirmLabel: "変更を捨てて開く", danger: true }))
    )
      return;
    dirty.current = false;
    setSelectedState(next);
  };
  return {
    selected,
    /** 選ぶ（確かめてやめることがあるので async。画面からは void で呼ぶ） */
    setSelected,
    /** 編集中のファイルの保存していない変更の有無（FileView の onDirtyChange から） */
    setDirty: (next: boolean) => void (dirty.current = next),
    /** 編集中のファイルに保存していない変更があるか（名前を変える前に確かめる） */
    isDirty: () => dirty.current,
    /** 名前を変えたファイル・フォルダ（from）を選んでいれば、新しいパス（to）に付け替える（確かめない） */
    relocate: (from: string, to: string) =>
      setSelectedState((prev) => (prev && (prev.path === from || prev.path.startsWith(`${from}/`)) ? { ...prev, path: to + prev.path.slice(from.length) } : prev)),
  };
}

export type ChangesSelection = ReturnType<typeof useChangesSelection>;

/** 変更の一覧（ステージ済み / 未ステージ。未ステージには未追跡・競合も含む） */
export interface ChangeGroups {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
}

/** そのファイルの差分（staged がなければ、未ステージ → ステージ済みの順に探す） */
function findChange(path: string, staged: boolean | undefined, groups: ChangeGroups): { file: GitFileChange; staged: boolean } | undefined {
  const find = (list: GitFileChange[]) => list.find((f) => f.path === path);
  const unstaged = staged !== true ? find(groups.unstaged) : undefined;
  if (unstaged) return { file: unstaged, staged: false };
  const found = staged !== false ? find(groups.staged) : undefined;
  return found && { file: found, staged: true };
}

/**
 * 選んだファイルの差分（変更の一覧から選んだときだけ）。エクスプローラー・検索の行・「編集」から開いたときは、差分ではなく中身を出すので undefined
 * （VS Code と同じく、エクスプローラーからは開いたらすぐ書ける中身を開き、変更は行の横の色の帯で見せる）
 */
export function selectedChange(selected: Selection | undefined, groups: ChangeGroups): { file: GitFileChange; staged: boolean } | undefined {
  if (!selected || selected.staged === undefined || selected.line !== undefined || selected.edit) return undefined;
  return findChange(selected.path, selected.staged, groups);
}

/**
 * 変更の一覧で選んだときの選択。VS Code と同じく、差分を見ながらすぐ書ける形（edit）で開く（利用者の依頼。前は読むだけの差分で、「編集」を押すと書けた）。
 * 読むだけの差分にするのは、消したファイル（書く中身がない）と、ステージ済みの差分でまだステージしていない変更もあるファイル
 * （書けるのは作業中のファイルなので、左のコミットの中身と比べると、ステージした差分とは違うものになる。「編集」で書ける）
 */
export function changeSelection(next: { path: string; staged: boolean }, groups: ChangeGroups): Selection {
  const change = findChange(next.path, next.staged, groups);
  if (!change || change.file.kind === "D") return next;
  if (next.staged && groups.unstaged.some((f) => f.path === next.path)) return next;
  return { ...next, edit: true };
}

/** 差分を見ながら編集するファイルの差分（編集しながら、元の中身を左に並べる。来た方の差分がもうなければ、もう一方を探す） */
export function editedChange(selected: Selection | undefined, groups: ChangeGroups): { file: GitFileChange; staged: boolean } | undefined {
  if (!selected?.edit) return undefined;
  return findChange(selected.path, selected.staged, groups) ?? findChange(selected.path, undefined, groups);
}

/** 左の一覧の表示（ファイル・検索・変更。プロジェクトのタブの files / search / changes） */
export type ChangesView = "files" | "search" | "changes";
