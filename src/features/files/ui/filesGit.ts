// files ⇄ git の口: ファイルの画面が Git から受けるもの（git が contributes.ts で 1 つだけ登録する。登録がなければ Git の飾りなしで動く）
import type { ComponentType } from "react";
import type { ActionState } from "@/foundation/ui/hooks/useAction";
import { definePoint } from "@/foundation/ui/points";
import type { WorkplaceRef } from "@/foundation/ui/workplace/workplace";
import type { Selection } from "./tabSelection";
import type { FileRename } from "./useFileActions";

/** 変更の記号（M・A など）と名前（変更・追加 など）。色は CSS が data-kind で付ける */
export interface ChangeMark {
  kind: string;
  label: string;
}

/** ファイルとフォルダの変更の記号（フォルダは中でいちばん目立つもの） */
export interface ChangeMarks {
  files: ReadonlyMap<string, ChangeMark>;
  folders: ReadonlyMap<string, ChangeMark>;
}

/** そのファイルのコミットしていない変更（中身は Git の口が持つ。差分のタブ・差分を見ながら編集の元に渡す） */
export interface FileChange {
  readonly path: string;
  readonly staged: boolean;
  /** 消したファイル（書く中身がない） */
  readonly deleted: boolean;
}

/** 変更の一覧の右クリックの操作 */
export type FileGitAction = "stage" | "unstage" | "discard";

/** 作業場所の Git の状態のうち、ファイルの画面が使うもの */
export interface FilesGitStatus {
  /** 取り直すたびに増える（木・中身の取り直しのきっかけ） */
  readonly version: number;
  /** Git で管理しているか（null = まだ読んでいない） */
  readonly repo: boolean | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly marks: ChangeMarks;
  changeOf(path: string): FileChange | null;
  /** ファイルの操作のあとに取り直す */
  refresh(): Promise<void>;
  act(action: FileGitAction, paths: string[]): Promise<void>;
}

/** 行ごとの変更の記録（行の数がいまの中身と合わない・記録のない行は null） */
export interface BlameLines {
  at(line: number, lineCount: number): { label: string; hover: string } | null;
}

/** 開いたタブの中身: 読むだけの差分か、差分を見ながら編集する元か（どちらでもなければ null = ふつうの中身） */
export type TabChange = { kind: "diff" | "edit"; change: FileChange };

/** 変更の一覧（ファイルのタブの殻 EditorTab の「変更」。操作の様子 action は殻が持ち、表示を切り替えても残す） */
export interface FilesChangesPaneProps {
  status: FilesGitStatus;
  action: ActionState;
  selected?: Selection;
  onSelect: (next: Selection, newTab?: boolean) => void;
  rename: FileRename;
  onHideList: () => void;
}

/** 読むだけの差分のタブ（onEdit で差分を見ながら編集へ。消したファイルは渡さない） */
export interface FilesDiffTabProps {
  projectId: number;
  change: FileChange;
  version: number;
  onEdit?: () => void;
}

export interface FilesGit {
  /** 作業場所の Git の状態（active の間は一定の間隔でも取り直す） */
  useStatus(target: WorkplaceRef, active: boolean): FilesGitStatus;
  /** 行の横の帯の元の中身（ステージした中身、なければコミットの中身。content は読み込んだ中身） */
  useQuickDiffBase(target: WorkplaceRef, path: string, status: FilesGitStatus, content: string | null): string | null;
  /** 保存した中身（hash）の行ごとの変更の記録 */
  useBlame(target: WorkplaceRef, path: string, status: FilesGitStatus, hash: string | null): BlameLines | null;
  /** 差分を見ながら編集するときの元の中身（バイナリ・大きすぎるものは null） */
  readOriginal(target: WorkplaceRef, change: FileChange): Promise<string | null>;
  /** チャットのファイルのチップを押したとき: コミットしていない変更があるか（読めなければ false） */
  hasChange(target: WorkplaceRef, path: string): Promise<boolean>;
  tabChange(status: FilesGitStatus, selected: Selection): TabChange | null;
  /** 変更の一覧で選んだときの選択（差分を見ながら編集にするか） */
  changeSelection(status: FilesGitStatus, next: { path: string; staged: boolean }): Selection;
  /** 元に戻す前の確かめ */
  confirmDiscard(paths: string[]): Promise<boolean>;
  ChangesPane: ComponentType<FilesChangesPaneProps>;
  DiffTab: ComponentType<FilesDiffTabProps>;
}

const NO_MARKS: ChangeMarks = { files: new Map(), folders: new Map() };
const NO_STATUS: FilesGitStatus = { version: 0, repo: false, loading: false, error: null, marks: NO_MARKS, changeOf: () => null, refresh: async () => {}, act: async () => {} };

/** Git の飾りなし（登録がないとき） */
export const NO_GIT: FilesGit = {
  useStatus: () => NO_STATUS,
  useQuickDiffBase: () => null,
  useBlame: () => null,
  readOriginal: async () => null,
  hasChange: async () => false,
  tabChange: () => null,
  changeSelection: (_status, next) => next,
  confirmDiscard: async () => false,
  ChangesPane: () => null,
  DiffTab: () => null,
};

export const filesGit = definePoint<FilesGit>("filesGit", { key: () => "git" });

/** 登録された口（なければ NO_GIT。登録は描く前に済んでいて、あとで変わらない。hook の名前にすると、中の hook を値から選んで呼ぶ形になり React Compiler が外す） */
export const filesGitImpl = (): FilesGit => filesGit.items()[0] ?? NO_GIT;

export function useFilesGitStatus(target: WorkplaceRef, active: boolean): FilesGitStatus {
  return filesGitImpl().useStatus(target, active);
}

export function useQuickDiffBase(target: WorkplaceRef, path: string, status: FilesGitStatus, content: string | null): string | null {
  return filesGitImpl().useQuickDiffBase(target, path, status, content);
}

export function useBlame(target: WorkplaceRef, path: string, status: FilesGitStatus, hash: string | null): BlameLines | null {
  return filesGitImpl().useBlame(target, path, status, hash);
}
