import type { Project } from "@shared/types";

/** 新しいプロジェクトのダイアログを開く（App が受け取る。チャットのメニューの「プロジェクトを変更」→「新規プロジェクト」など） */
export const OPEN_NEW_PROJECT_EVENT = "kickoff:open-new-project";

export interface NewProjectRequest {
  /** 名前の欄に初めから入れておく（検索欄に書いた名前） */
  name?: string;
  /** 作ったあとの処理（省けば、そのプロジェクトで新しいチャットを開く） */
  onCreated?: (project: Project) => void;
  /** 初めに開く作り方（新しく作る / 既存のフォルダを取り込む。省けば新しく作る） */
  mode?: NewProjectMode;
}

/** 新しいプロジェクトの作り方 */
export type NewProjectMode = "create" | "import";

export function openNewProject(request: NewProjectRequest = {}) {
  window.dispatchEvent(new CustomEvent<NewProjectRequest>(OPEN_NEW_PROJECT_EVENT, { detail: request }));
}
