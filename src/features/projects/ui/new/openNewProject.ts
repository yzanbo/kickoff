import { openAppDialog } from "@/foundation/ui/shell/points";

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
export type NewProjectAfter = { [K in keyof NewProjectAfterMap]: { kind: K } & NewProjectAfterMap[K] }[keyof NewProjectAfterMap];

/**
 * 作ったあとの処理の種類ごとの値。持ち主の機能が declare module で足し、処理を afterNewProject.ts の newProjectAfters に登録する
 * （moveChat = そのチャットを作ったプロジェクトへ移す: chat。moveDraft = その下書きを作ったプロジェクトへ移す: chatPanel）
 */
export interface NewProjectAfterMap {}

/** 新しいプロジェクトの作り方 */
export type NewProjectMode = "create" | "import";

declare module "@/foundation/ui/shell/points" {
  interface AppDialogMap {
    /** 新しいプロジェクトのダイアログ */
    newProject: NewProjectRequest;
    /**
     * プロジェクトがないのに新しいチャットを始めようとしたとき（サイドバー・⌘N・パネル・カンバンの「新しいチャット」）の案内。
     * すべてのチャットはプロジェクトの中で行うことを説明し、新しいプロジェクトへ誘う（作ると、そのプロジェクトで新しいチャットが開く）
     */
    noProjectsGuide: null;
  }
}

/** プロジェクトがないときの案内を開く（App が受け取る） */
export function openNoProjectsGuide() {
  openAppDialog("noProjectsGuide");
}

/** 新しいプロジェクトのダイアログを開く（App が受け取る。チャットのメニューの「プロジェクトを変更」→「新規プロジェクト」など） */
export function openNewProject(request: NewProjectRequest = {}) {
  openAppDialog("newProject", request);
}
