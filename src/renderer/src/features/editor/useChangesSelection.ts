import { useRef, useState } from "react";
import type { GitFileChange } from "@shared/types";
import type { SettingValue } from "@/lib/storage";
import type { CHANGES_VIEW } from "@/lib/storageKeys";
import { confirmDialog } from "@/ui/dialogs";

/**
 * 選んでいるファイル。変更の一覧から選んだときは、ステージ済み・未ステージのどちらか（同じファイルが両方にあることもある）。
 * エクスプローラーから選んだときは staged を持たない（変更があれば差分、なければ中身を出す）。
 * 検索の結果から選んだときは line を持つ（変更があってもいまの中身を出し、その行を目立たせる）。
 * edit は、差分の「編集」から来たとき（いまの中身を開いてすぐ編集する）
 */
export interface Selection {
  path: string;
  staged?: boolean;
  line?: number;
  edit?: boolean;
}

/** エディタタブで選んでいるファイル。編集中に保存していない変更があれば、別のファイルを開く前に確かめる */
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
  };
}

export type ChangesSelection = ReturnType<typeof useChangesSelection>;

/** 変更の一覧（ステージ済み / 未ステージ。未ステージには未追跡・競合も含む） */
export interface ChangeGroups {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
}

/**
 * 選んだファイルの差分（エクスプローラーから選んだときは、未ステージ → ステージ済みの順に探す）。
 * 検索の行や「編集」から開いたときは、差分ではなく中身を出すので undefined
 */
export function selectedChange(selected: Selection | undefined, groups: ChangeGroups): { file: GitFileChange; staged: boolean } | undefined {
  if (!selected || selected.line !== undefined || selected.edit) return undefined;
  const find = (list: GitFileChange[], path: string) => list.find((f) => f.path === path);
  const unstaged = selected.staged !== true ? find(groups.unstaged, selected.path) : undefined;
  if (unstaged) return { file: unstaged, staged: false };
  const staged = selected.staged !== false ? find(groups.staged, selected.path) : undefined;
  return staged && { file: staged, staged: true };
}

/** エディタタブの左の表示（すべてのファイル・検索・変更） */
export type ChangesView = SettingValue<typeof CHANGES_VIEW>;
