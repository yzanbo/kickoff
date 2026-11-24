// Git の値の一覧と画面の名前（変更の種類・途中で止まる操作）

/**
 * Git の変更のあるファイルの種類（VS Code のソース管理と同じ記号）。
 * M: 変更 / A: 追加 / D: 削除 / R: 名前の変更 / C: コピー / T: 種類の変更 / U: 未追跡（新しいファイル） / !: 競合
 */
export const GIT_CHANGE_KINDS = ["M", "A", "D", "R", "C", "T", "U", "!"] as const;
export type GitChangeKind = (typeof GIT_CHANGE_KINDS)[number];
/** 変更の種類の名前（差分の見出し・一覧の印に出す） */
export const GIT_CHANGE_LABELS: Record<GitChangeKind, string> = {
  M: "変更",
  A: "追加",
  D: "削除",
  R: "名前の変更",
  C: "コピー",
  T: "種類の変更",
  U: "未追跡",
  "!": "競合",
};

/** 途中で止まることのある Git の操作（衝突したときに、取りやめる・続けるを選んでもらう） */
export const GIT_OPERATIONS = ["merge", "rebase", "cherry-pick", "revert"] as const;
export type GitOperation = (typeof GIT_OPERATIONS)[number];
export const GIT_OPERATION_LABELS: Record<GitOperation, string> = {
  merge: "マージ",
  rebase: "リベース",
  "cherry-pick": "チェリーピック",
  revert: "リバート",
};
