// セクションごとの既定の推論の深さと権限モード（コアと画面で共通。Node 依存を持ち込まないこと）
import type { EffortLevel, Phase, PermissionChoice } from "./types.js";

export const SECTION_DEFAULT_EFFORT: Record<Phase, EffortLevel> = {
  requirements: "high",
  schedule: "medium",
  implementation: "high",
  testing: "high",
  deployment: "medium",
};

/** 実装・テストはファイルの編集を自動承認、それ以外は毎回確認 */
export const SECTION_DEFAULT_PERMISSION: Record<Phase, Exclude<PermissionChoice, "phase">> = {
  requirements: "default",
  schedule: "default",
  implementation: "acceptEdits",
  testing: "acceptEdits",
  deployment: "default",
};

/** 実際に使われる推論の深さ（チャット・設定で決めていなければセクションの既定） */
export function effectiveEffort(section: Phase, ...choices: (EffortLevel | null | undefined)[]): EffortLevel {
  return choices.find((c): c is EffortLevel => Boolean(c)) ?? SECTION_DEFAULT_EFFORT[section];
}

/** 実際に使われる権限モード（"phase" はセクションの既定に置き換える） */
export function effectivePermission(
  section: Phase,
  ...choices: (PermissionChoice | null | undefined)[]
): Exclude<PermissionChoice, "phase"> {
  const chosen = choices.find((c): c is Exclude<PermissionChoice, "phase"> => Boolean(c) && c !== "phase");
  return chosen ?? SECTION_DEFAULT_PERMISSION[section];
}
