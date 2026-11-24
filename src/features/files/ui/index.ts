// files の画面の口（ほかの機能から読むもの）
import { storage } from "./storage";

export { EditorViewPage } from "./projectViewPages";
export { PopoutFilesFrame } from "./PopoutFiles";

/** ほかの機能も読む保存の設定（宣言は ./storage.ts） */
export const filesSettings = { listWidth: storage.settings.listWidth } as const;

/** Git の口（git が登録する。形は ./filesGit.ts） */
export { filesGit } from "./filesGit";
export type { BlameLines, ChangeMark, ChangeMarks, FileChange, FilesChangesPaneProps, FilesDiffTabProps, FilesGit, FilesGitStatus } from "./filesGit";
export type { Selection } from "./tabSelection";
export { FileTree, siblingNameError, type TreeMulti } from "./FileTree";
export type { FileRename } from "./useFileOps";
export { useCodeQuoteMenu } from "./useCodeQuoteMenu";
