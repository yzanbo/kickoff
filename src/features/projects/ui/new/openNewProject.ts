import type { DraftRef } from "@/features/chatPanel/ui/drafts/panelDrafts";

/** 新しいプロジェクトのダイアログを開く（App が受け取る。チャットのメニューの「プロジェクトを変更」→「新規プロジェクト」など） */
export const OPEN_NEW_PROJECT_EVENT = "kickoff:open-new-project";

export interface NewProjectRequest {
  /** 名前の欄に初めから入れておく（検索欄に書いた名前） */
  name?: string;
  /** 作ったあとの処理（省けば、そのプロジェクトで新しいチャットを開く。afterNewProject.ts） */
  after?: NewProjectAfter;
  /** 初めに開く作り方（新しく作る / 既存のフォルダを取り込む。省けば新しく作る） */
  mode?: NewProjectMode;
}

/**
 * 新しいプロジェクトを作ったあとの処理。関数ではなく値で持つ（別ウィンドウ（サイドバーなど）の中から頼んだときも、
 * メインのウィンドウの App に知らせとして渡せるように。関数は渡せない）
 */
export type NewProjectAfter =
  /** そのチャットを作ったプロジェクトへ移す（確かめてから。チャットのメニューの「プロジェクトを変更」→「新規プロジェクト」） */
  | { kind: "moveChat"; chatId: number }
  /** その下書きを作ったプロジェクトへ移す（下書きのメニューの「プロジェクトを変更」→「新規プロジェクト」） */
  | { kind: "moveDraft"; draft: DraftRef };

/** 新しいプロジェクトの作り方 */
export type NewProjectMode = "create" | "import";

/**
 * プロジェクトがないのに新しいチャットを始めようとしたとき（サイドバー・⌘N・パネル・カンバンの「新しいチャット」）の案内を開く（App が受け取る）。
 * すべてのチャットはプロジェクトの中で行うことを説明し、新しいプロジェクトへ誘う（作ると、そのプロジェクトで新しいチャットが開く）
 */
export const OPEN_NO_PROJECTS_GUIDE_EVENT = "kickoff:open-no-projects-guide";

export function openNoProjectsGuide() {
  window.dispatchEvent(new CustomEvent(OPEN_NO_PROJECTS_GUIDE_EVENT));
}

export function openNewProject(request: NewProjectRequest = {}) {
  window.dispatchEvent(new CustomEvent<NewProjectRequest>(OPEN_NEW_PROJECT_EVENT, { detail: request }));
}
